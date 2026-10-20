import 'dotenv/config';
import http from 'http';
import app from './app.js';
import connect from './db/db.js';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import projectModel from './models/project.model.js';
import userModel from './models/user.model.js';
import { generateResult } from './services/ai.service.js';
import * as messageService from './services/message.service.js';
import * as projectService from './services/project.service.js';
import { ACCESS_COOKIE } from './services/token.service.js';
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness.js';
import {
    applyTextOperation,
    applyTextOperationToYText,
    diffTextToOperation,
    transformTextOperation,
} from './services/operationalTransform.service.js';

const port = process.env.PORT || 3000;
const corsOrigin = process.env.CLIENT_URL || '*';
const accessSecret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;

const collabDocuments = new Map();
const collabDocumentLoads = new Map();
const projectWriteQueues = new Map();
const activePresence = new Map();
const collabKey = (projectId, fileName) => `${projectId}:${fileName}`;
const fileRoom = (projectId, fileName) => `project:${projectId}:file:${fileName}`;
const getFileContents = (tree, fileName) => tree?.[fileName]?.file?.contents || '';

const getPresenceSnapshot = (projectId) => {
    const sockets = activePresence.get(projectId) || new Map();
    const byUser = new Map();
    for (const person of sockets.values()) if (!byUser.has(person.id)) byUser.set(person.id, person);
    return [...byUser.values()].sort((a, b) => a.email.localeCompare(b.email));
};
const broadcastPresence = (projectId) => {
    io.to(projectId).emit('presence-updated', { users: getPresenceSnapshot(projectId) });
};

const persistCollabDocument = async (record) => {
    const projectId = record.projectId;
    const write = async () => {
        const project = await projectModel.findById(projectId);
        if (!project) return;
        const fileTree = { ...(project.fileTree || {}) };
        const previousEntry = fileTree[record.fileName] || {};
        fileTree[record.fileName] = {
            ...previousEntry,
            file: { ...(previousEntry.file || {}), contents: record.doc.getText('content').toString() },
        };
        const collabState = (project.collabState || [])
            .filter((entry) => entry.fileName !== record.fileName)
            .map((entry) => ({ fileName: entry.fileName, update: entry.update, revision: entry.revision || 0 }));
        collabState.push({
            fileName: record.fileName,
            update: Buffer.from(Y.encodeStateAsUpdate(record.doc)).toString('base64'),
            revision: record.revision,
        });
        await projectModel.updateOne({ _id: projectId }, { $set: { fileTree, collabState } });
    };
    const previous = projectWriteQueues.get(projectId) || Promise.resolve();
    const pending = previous.catch(() => {}).then(write);
    projectWriteQueues.set(projectId, pending);
    try {
        await pending;
    } finally {
        if (projectWriteQueues.get(projectId) === pending) projectWriteQueues.delete(projectId);
    }
};
const scheduleCollabPersistence = (record) => {
    if (record.persistTimer) clearTimeout(record.persistTimer);
    record.persistTimer = setTimeout(() => {
        record.persistTimer = null;
        persistCollabDocument(record).catch((error) => {
            console.error('Collaborative document persistence failed:', error.message);
        });
    }, 400);
    record.persistTimer.unref?.();
};

const createCollabDocument = async (projectId, fileName, userId) => {
    const key = collabKey(projectId, fileName);
    if (collabDocuments.has(key)) return collabDocuments.get(key);
    if (collabDocumentLoads.has(key)) return collabDocumentLoads.get(key);
    const loading = (async () => {
        const project = await projectModel.findOne({ _id: projectId, users: userId });
        if (!project) throw new Error('Project access denied');
        const stored = (project.collabState || []).find((entry) => entry.fileName === fileName);
        const doc = new Y.Doc();
        if (stored?.update) Y.applyUpdate(doc, new Uint8Array(Buffer.from(stored.update, 'base64')), 'persistence-hydrate');
        else {
            const initialContents = getFileContents(project.fileTree, fileName);
            if (initialContents) doc.getText('content').insert(0, initialContents);
        }
        const awareness = new Awareness(doc);
        const record = {
            projectId, fileName, doc, awareness,
            revision: stored?.revision || 0,
            historyFloor: stored?.revision || 0,
            operationHistory: [],
            lastText: doc.getText('content').toString(),
            persistTimer: null,
            awarenessClientsBySocket: new Map(),
        };
        doc.on('update', (update) => {
            const nextText = doc.getText('content').toString();
            if (nextText !== record.lastText) {
                const operation = diffTextToOperation(record.lastText, nextText);
                record.revision += 1;
                record.operationHistory.push({ revision: record.revision, operation });
                record.lastText = nextText;
                if (record.operationHistory.length > 500) {
                    const removed = record.operationHistory.shift();
                    record.historyFloor = removed.revision;
                }
                io.to(projectId).emit('file-content-updated', { fileName, content: nextText });
            }
            scheduleCollabPersistence(record);
            io.to(fileRoom(projectId, fileName)).emit('collab-update', {
                projectId, fileName, update: Array.from(update), revision: record.revision,
            });
        });
        awareness.on('update', ({ added, updated, removed }, origin) => {
            const clients = [...added, ...updated, ...removed];
            if (!clients.length) return;
            if (typeof origin === 'string' && origin !== 'server-disconnect') {
                const owned = record.awarenessClientsBySocket.get(origin) || new Set();
                for (const clientId of clients) owned.add(clientId);
                record.awarenessClientsBySocket.set(origin, owned);
            }
            io.to(fileRoom(projectId, fileName)).emit('collab-awareness-update', {
                projectId, fileName, update: Array.from(encodeAwarenessUpdate(awareness, clients)),
            });
        });
        collabDocuments.set(key, record);
        return record;
    })();
    collabDocumentLoads.set(key, loading);
    try { return await loading; }
    finally { collabDocumentLoads.delete(key); }
};

const getCookie = (cookieHeader, name) => {
    if (!cookieHeader) return null;
    const pair = cookieHeader.split(';').find((part) => part.trim().startsWith(`${name}=`));
    return pair ? decodeURIComponent(pair.trim().slice(name.length + 1)) : null;
};

connect();

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: corsOrigin,
        credentials: corsOrigin !== '*'
    }
});
app.set('io', io);

io.use(async (socket, next) => {
    try {
        const token = getCookie(socket.handshake.headers.cookie, ACCESS_COOKIE) ||
            socket.handshake.auth?.token ||
            socket.handshake.headers.authorization?.split(' ')[1];

        if (!token) return next(new Error('Authentication error'));

        const decoded = jwt.verify(token, accessSecret);
        if (decoded.type !== 'access' || !decoded.userId) {
            return next(new Error('Authentication error'));
        }

        const user = await userModel.findById(decoded.userId);
        if (!user) return next(new Error('Authentication error'));

        socket.user = user;

        const projectId = socket.handshake.query.projectId;
        if (!projectId) return next();

        if (!mongoose.Types.ObjectId.isValid(projectId)) {
            return next(new Error('Invalid projectId'));
        }

        socket.project = await projectModel.findOne({ _id: projectId, users: user._id });
        if (!socket.project) return next(new Error('Project access denied'));

        next();
    } catch (error) {
        next(error);
    }
});

io.on('connection', socket => {
    socket.userRoomId = `user:${socket.user._id.toString()}`;
    socket.join(socket.userRoomId);

    if (!socket.project) {
        socket.on('disconnect', () => socket.leave(socket.userRoomId));
        return;
    }

    socket.roomId = socket.project._id.toString();
    socket.join(socket.roomId);
    const projectSockets = activePresence.get(socket.roomId) || new Map();
    projectSockets.set(socket.id, { id: socket.user._id.toString(), email: socket.user.email || 'Collaborator' });
    activePresence.set(socket.roomId, projectSockets);
    broadcastPresence(socket.roomId);

    socket.on('collab-join', async (data, acknowledge) => {
        const respond = typeof acknowledge === 'function' ? acknowledge : () => {};
        try {
            const requestedFile = String(data?.fileName || '');
            if (!requestedFile || requestedFile.length > 240 || requestedFile.includes('..') ||
                requestedFile.startsWith('/') || requestedFile.endsWith('/')) return respond({ ok: false, error: 'Invalid file name' });
            if (data?.projectId && data.projectId !== socket.roomId) return respond({ ok: false, error: 'Project mismatch' });
            const room = fileRoom(socket.roomId, requestedFile);
            if (socket.data.collabRoom && socket.data.collabRoom !== room) socket.leave(socket.data.collabRoom);
            const record = await createCollabDocument(socket.roomId, requestedFile, socket.user._id);
            socket.join(room);
            socket.data.collabRoom = room;
            socket.data.collabFileName = requestedFile;
            const awarenessClients = Array.from(record.awareness.getStates().keys());
            respond({
                ok: true,
                fileName: requestedFile,
                update: Array.from(Y.encodeStateAsUpdate(record.doc)),
                awareness: awarenessClients.length ? Array.from(encodeAwarenessUpdate(record.awareness, awarenessClients)) : [],
                revision: record.revision,
                presence: getPresenceSnapshot(socket.roomId),
            });
        } catch (error) {
            respond({ ok: false, error: error.message || 'Unable to join collaborative document' });
        }
    });

    socket.on('collab-leave', (data) => {
        if (!data?.fileName || data.fileName !== socket.data.collabFileName) return;
        if (socket.data.collabRoom) socket.leave(socket.data.collabRoom);
        socket.data.collabRoom = null;
        socket.data.collabFileName = null;
    });

    socket.on('collab-update', (data) => {
        try {
            if (!data || data.fileName !== socket.data.collabFileName ||
                (data.projectId && data.projectId !== socket.roomId) ||
                !Array.isArray(data.update) || data.update.length === 0 || data.update.length > 2_000_000) return;
            const record = collabDocuments.get(collabKey(socket.roomId, data.fileName));
            if (!record) return;
            Y.applyUpdate(record.doc, Uint8Array.from(data.update), socket.id);
        } catch (error) {
            socket.emit('project-error', { message: 'Unable to apply collaborative edit.' });
            console.error('Collaborative edit rejected:', error.message);
        }
    });

    socket.on('collab-awareness-update', (data) => {
        try {
            if (!data || data.fileName !== socket.data.collabFileName ||
                (data.projectId && data.projectId !== socket.roomId) ||
                !Array.isArray(data.update) || data.update.length === 0 || data.update.length > 100_000) return;
            const record = collabDocuments.get(collabKey(socket.roomId, data.fileName));
            if (!record) return;
            applyAwarenessUpdate(record.awareness, Uint8Array.from(data.update), socket.id);
        } catch (error) {
            console.error('Collaborator awareness update rejected:', error.message);
        }
    });

    socket.on('collab-flush', async (data, acknowledge) => {
        const respond = typeof acknowledge === 'function' ? acknowledge : () => {};
        if (!data?.fileName || data.fileName !== socket.data.collabFileName ||
            (data.projectId && data.projectId !== socket.roomId)) return respond({ ok: false, error: 'Document is not joined' });
        try {
            const record = collabDocuments.get(collabKey(socket.roomId, data.fileName));
            if (!record) return respond({ ok: false, error: 'Document is not loaded' });
            if (record.persistTimer) { clearTimeout(record.persistTimer); record.persistTimer = null; }
            await persistCollabDocument(record);
            respond({ ok: true, revision: record.revision });
        } catch {
            respond({ ok: false, error: 'Unable to save collaborative document' });
        }
    });

    socket.on('project-message', async data => {
        try {
            const message = data.message?.trim();
            if (!message) return;

            const savedUserMessage = await messageService.createUserMessage({
                projectId: socket.roomId,
                senderId: socket.user._id,
                message
            });

            io.to(socket.roomId).emit('project-message', savedUserMessage);

            const aiIsPresentInMessage = message.includes('@ai');
            if (aiIsPresentInMessage) {
                const prompt = message.replace('@ai', '');
                const result = await generateResult(prompt);

                try {
                    let cleanResult = result.trim();
                    const jsonMatch = cleanResult.match(/\{[\s\S]*\}/);
                    if (jsonMatch) cleanResult = jsonMatch[0];

                    const aiResponse = JSON.parse(cleanResult);
                    if (aiResponse.fileTree) {
                        const project = await projectService.updateFileTree({
                            projectId: socket.roomId,
                            fileTree: aiResponse.fileTree,
                            userId: socket.user._id
                        });

                        io.to(socket.roomId).emit('file-tree-updated', { fileTree: project.fileTree });
                    }

                    const savedAiMessage = await messageService.createAiMessage({
                        projectId: socket.roomId,
                        message: aiResponse.text || cleanResult
                    });
                    io.to(socket.roomId).emit('project-message', savedAiMessage);
                } catch (parseError) {
                    const savedAiMessage = await messageService.createAiMessage({
                        projectId: socket.roomId,
                        message: result
                    });
                    io.to(socket.roomId).emit('project-message', savedAiMessage);
                }
                return;
            }
        } catch (error) {
            console.error('Project message failed:', error.message);
            socket.emit('project-error', { message: error.message });
        }
    });

    socket.on('file-tree-save', async (data, acknowledge) => {
        const respond = typeof acknowledge === 'function' ? acknowledge : () => {};
        try {
            if (!data?.fileTree || typeof data.fileTree !== 'object' || Array.isArray(data.fileTree)) return respond({ ok: false, error: 'Invalid file tree' });
            const currentProject = await projectModel.findOne({ _id: socket.roomId, users: socket.user._id });
            if (!currentProject) return respond({ ok: false, error: 'Project access denied' });
            const mergedTree = { ...(currentProject.fileTree || {}) };
            const baseTree = data.baseFileTree && typeof data.baseFileTree === 'object' ? data.baseFileTree : {};

            for (const [name, proposedEntry] of Object.entries(data.fileTree)) {
                if (!name || name.length > 240 || name.includes('..') || name.startsWith('/') || name.endsWith('/')) {
                    return respond({ ok: false, error: `Invalid file path: ${name}` });
                }
                const proposedContent = proposedEntry?.file?.contents;
                if (typeof proposedContent !== 'string') { mergedTree[name] = proposedEntry; continue; }
                const baseContent = baseTree[name]?.file?.contents;
                const record = collabDocuments.get(collabKey(socket.roomId, name));
                const latestTreeContent = getFileContents(currentProject.fileTree, name);

                if (typeof baseContent === 'string' && baseContent !== proposedContent) {
                    const snapshotOperation = diffTextToOperation(baseContent, proposedContent);
                    const latestContent = record ? record.doc.getText('content').toString() : latestTreeContent;
                    let rebasedOperation;
                    const historyAvailable = record && Number.isFinite(data.baseRevision) &&
                        data.baseRevision >= record.historyFloor && record.operationHistory.length &&
                        record.operationHistory[0].revision <= data.baseRevision + 1 &&
                        record.operationHistory[record.operationHistory.length - 1].revision === record.revision;

                    if (historyAvailable) {
                        rebasedOperation = snapshotOperation;
                        for (const committed of record.operationHistory) {
                            if (committed.revision > data.baseRevision) rebasedOperation = transformTextOperation(rebasedOperation, committed.operation, false);
                        }
                    } else {
                        rebasedOperation = transformTextOperation(snapshotOperation, diffTextToOperation(baseContent, latestContent), false);
                    }

                    let mergedContent;
                    if (record) {
                        record.doc.transact(() => applyTextOperationToYText(record.doc.getText('content'), rebasedOperation), 'ot-merge');
                        mergedContent = record.doc.getText('content').toString();
                    } else mergedContent = applyTextOperation(latestContent, rebasedOperation);
                    mergedTree[name] = { ...proposedEntry, file: { ...(proposedEntry.file || {}), contents: mergedContent } };
                } else if (record) {
                    const liveContent = record.doc.getText('content').toString();
                    mergedTree[name] = { ...proposedEntry, file: { ...(proposedEntry.file || {}), contents: liveContent } };
                } else if (typeof baseContent === 'string' && latestTreeContent !== proposedContent && latestTreeContent !== baseContent) {
                    mergedTree[name] = { ...proposedEntry, file: { ...(proposedEntry.file || {}), contents: latestTreeContent } };
                } else {
                    mergedTree[name] = proposedEntry;
                }
            }

            const project = await projectService.updateFileTree({
                projectId: socket.roomId, fileTree: mergedTree, userId: socket.user._id
            });
            io.to(socket.roomId).emit('file-tree-updated', { fileTree: project.fileTree });
            respond({ ok: true });
        } catch (error) {
            console.error('File tree save failed:', error.message);
            respond({ ok: false, error: error.message || 'Unable to save file tree' });
            socket.emit('project-error', { message: error.message });
        }
    });

    socket.on('disconnect', () => {
        const projectSockets = activePresence.get(socket.roomId);
        if (projectSockets) {
            projectSockets.delete(socket.id);
            if (projectSockets.size === 0) activePresence.delete(socket.roomId);
            else activePresence.set(socket.roomId, projectSockets);
            broadcastPresence(socket.roomId);
        }
        for (const record of collabDocuments.values()) {
            const owned = record.awarenessClientsBySocket.get(socket.id);
            if (owned?.size) {
                removeAwarenessStates(record.awareness, [...owned], 'server-disconnect');
                record.awarenessClientsBySocket.delete(socket.id);
            }
        }
    });
});

server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
