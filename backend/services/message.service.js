import mongoose from 'mongoose';
import messageModel from '../models/message.model.js';
import projectModel from '../models/project.model.js';

const assertObjectId = (id, name) => {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        throw new Error(`Invalid ${name}`);
    }
};

export const serializeMessage = (message) => {
    const plain = typeof message.toObject === 'function' ? message.toObject() : message;

    return {
        _id: plain._id,
        message: plain.message,
        timestamp: plain.createdAt,
        sender: plain.senderType === 'ai'
            ? { _id: 'ai', email: 'AI' }
            : {
                _id: plain.sender?._id || plain.sender,
                email: plain.sender?.email || 'Unknown user'
            }
    };
};

export const getProjectMessages = async ({ projectId, userId, limit = 100 }) => {
    assertObjectId(projectId, 'projectId');
    assertObjectId(userId, 'userId');

    const project = await projectModel.exists({ _id: projectId, users: userId });
    if (!project) {
        throw new Error('User not belong to this project');
    }

    const messages = await messageModel
        .find({ project: projectId })
        .sort({ createdAt: -1 })
        .limit(Math.min(Number(limit) || 100, 200))
        .populate('sender', 'email')
        .lean();

    return messages.reverse().map(serializeMessage);
};

export const createUserMessage = async ({ projectId, senderId, message }) => {
    assertObjectId(projectId, 'projectId');
    assertObjectId(senderId, 'senderId');

    if (!message || !message.trim()) {
        throw new Error('Message is required');
    }

    const project = await projectModel.exists({ _id: projectId, users: senderId });
    if (!project) {
        throw new Error('User not belong to this project');
    }

    const savedMessage = await messageModel.create({
        project: projectId,
        sender: senderId,
        senderType: 'user',
        message: message.trim()
    });

    const populated = await savedMessage.populate('sender', 'email');
    return serializeMessage(populated);
};

export const createAiMessage = async ({ projectId, message }) => {
    assertObjectId(projectId, 'projectId');

    if (!message || !message.trim()) {
        throw new Error('Message is required');
    }

    const savedMessage = await messageModel.create({
        project: projectId,
        sender: null,
        senderType: 'ai',
        message: message.trim()
    });

    return serializeMessage(savedMessage);
};

export const deleteMessagesByProject = async ({ projectId }) => {
    assertObjectId(projectId, 'projectId');
    return messageModel.deleteMany({ project: projectId });
};