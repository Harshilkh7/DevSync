import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness.js';
import { yCollab } from 'y-codemirror.next';

const toBytes = (value) => Uint8Array.from(Array.isArray(value) ? value : []);
const toWire = (value) => Array.from(value);
const colors = [
    { color: '#38bdf8', light: '#38bdf833' }, { color: '#a78bfa', light: '#a78bfa33' },
    { color: '#34d399', light: '#34d39933' }, { color: '#fb7185', light: '#fb718533' },
    { color: '#fbbf24', light: '#fbbf2433' }, { color: '#2dd4bf', light: '#2dd4bf33' },
];
const colorFor = (userId = '') => {
    let hash = 0;
    for (const char of String(userId)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return colors[hash % colors.length];
};

export const useProjectCollaboration = ({ socket, projectId, fileName, user, enabled, onContentChange }) => {
    const [binding, setBinding] = useState(null);
    const [onlineUsers, setOnlineUsers] = useState([]);
    const [status, setStatus] = useState('Offline');
    const [revision, setRevision] = useState(0);

    useEffect(() => {
        if (!socket || !projectId || !enabled) {
            setOnlineUsers([]);
            return undefined;
        }
        const handlePresence = (data) => setOnlineUsers(Array.isArray(data?.users) ? data.users : []);
        socket.on('presence-updated', handlePresence);
        return () => socket.off('presence-updated', handlePresence);
    }, [socket, projectId, enabled]);

    useEffect(() => {
        setBinding(null);
        setRevision(0);
        if (!socket || !projectId || !fileName || !user?._id || !enabled) {
            setStatus('Waiting for file');
            return undefined;
        }

        let disposed = false, joining = false, joined = false;
        let doc = null, awareness = null, yText = null;
        let updateHandler = null, awarenessHandler = null;

        const remoteUpdateHandler = (data) => {
            if (disposed || data?.fileName !== fileName || !doc || !Array.isArray(data.update)) return;
            try {
                if (Number.isFinite(data.revision)) setRevision((current) => Math.max(current, data.revision));
                Y.applyUpdate(doc, toBytes(data.update), 'socket');
            } catch (error) {
                console.error('Unable to apply a collaborative edit:', error);
                setStatus('Sync error');
            }
        };
        const remoteAwarenessHandler = (data) => {
            if (disposed || data?.fileName !== fileName || !awareness || !Array.isArray(data.update)) return;
            try { applyAwarenessUpdate(awareness, toBytes(data.update), 'socket'); }
            catch (error) { console.error('Unable to apply collaborator awareness:', error); }
        };

        const begin = () => {
            if (disposed || joining || !socket.connected) return;
            joining = true;
            setStatus('Joining document…');
            doc = new Y.Doc();
            awareness = new Awareness(doc);
            yText = doc.getText('content');
            const palette = colorFor(user._id);
            awareness.setLocalStateField('user', {
                name: user.email || 'Collaborator', color: palette.color, colorLight: palette.light,
            });
            socket.on('collab-update', remoteUpdateHandler);
            socket.on('collab-awareness-update', remoteAwarenessHandler);

            socket.timeout(10000).emit('collab-join', { projectId, fileName }, (timeoutError, response) => {
                if (disposed) return;
                if (timeoutError || !response?.ok || !Array.isArray(response.update)) {
                    setStatus(response?.error || 'Unable to sync document');
                    joining = false;
                    return;
                }
                try {
                    Y.applyUpdate(doc, toBytes(response.update), 'server-sync');
                    if (Array.isArray(response.awareness) && response.awareness.length) {
                        applyAwarenessUpdate(awareness, toBytes(response.awareness), 'socket');
                    }
                } catch (error) {
                    setStatus('Unable to load document');
                    console.error('Unable to load collaborative document:', error);
                    joining = false;
                    return;
                }

                let lastText = yText.toString();
                setRevision(Number.isFinite(response.revision) ? response.revision : 0);
                onContentChange(fileName, lastText);
                updateHandler = (update, origin) => {
                    const nextText = yText.toString();
                    if (nextText !== lastText) {
                        lastText = nextText;
                        onContentChange(fileName, nextText);
                    }
                    if (origin !== 'socket' && origin !== 'server-sync' && joined && socket.connected) {
                        socket.emit('collab-update', { projectId, fileName, update: toWire(update) });
                    }
                };
                awarenessHandler = ({ added, updated, removed }, origin) => {
                    if (origin === 'socket' || !joined || !socket.connected) return;
                    const changedClients = [...added, ...updated, ...removed];
                    if (!changedClients.length) return;
                    socket.emit('collab-awareness-update', {
                        projectId, fileName, update: toWire(encodeAwarenessUpdate(awareness, changedClients)),
                    });
                };
                doc.on('update', updateHandler);
                awareness.on('update', awarenessHandler);
                setBinding({ fileName, extension: yCollab(yText, awareness, { undoManager: new Y.UndoManager(yText) }) });
                joined = true;
                joining = false;
                setStatus('Live');
                socket.emit('collab-awareness-update', {
                    projectId, fileName, update: toWire(encodeAwarenessUpdate(awareness, [doc.clientID])),
                });
                if (Array.isArray(response.presence)) setOnlineUsers(response.presence);
            });
        };

        setStatus(socket.connected ? 'Joining document…' : 'Connecting…');
        socket.on('connect', begin);
        if (socket.connected) begin();
        return () => {
            disposed = true;
            socket.off('connect', begin);
            socket.off('collab-update', remoteUpdateHandler);
            socket.off('collab-awareness-update', remoteAwarenessHandler);
            if (awareness && awarenessHandler) {
                awareness.setLocalState(null);
                awareness.off('update', awarenessHandler);
            }
            if (doc && updateHandler) doc.off('update', updateHandler);
            if (joined && socket.connected) socket.emit('collab-leave', { projectId, fileName });
            if (awareness) awareness.destroy();
            if (doc) doc.destroy();
        };
    }, [socket, projectId, fileName, user?._id, user?.email, enabled, onContentChange]);

    return { binding, onlineUsers, status, revision };
};
