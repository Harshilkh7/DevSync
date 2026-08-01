import projectModel from '../models/project.model.js';
import mongoose from 'mongoose';
import { deleteMessagesByProject } from './message.service.js';

const assertProjectMember = async ({ projectId, userId }) => {
    const project = await projectModel.findOne({ _id: projectId, users: userId });
    if (!project) {
        throw new Error('User not belong to this project');
    }
    return project;
};

const assertProjectOwner = async ({ projectId, userId }) => {
    const project = await projectModel.findOne({ _id: projectId, createdBy: userId });
    if (!project) {
        throw new Error('Only project owner can perform this action');
    }
    return project;
};

const getDocumentId = (document) => (document?._id || document)?.toString();

const formatProjectForUser = (project, userId) => {
    const formattedProject = typeof project.toObject === 'function'
        ? project.toObject()
        : project;
    const ownerId = getDocumentId(formattedProject.createdBy);
    const currentUserId = userId.toString();

    return {
        ...formattedProject,
        role: ownerId === currentUserId ? 'owner' : 'collaborator',
        collaboratorCount: (formattedProject.users || [])
            .filter((projectUser) => getDocumentId(projectUser) !== ownerId)
            .length
    };
};

export const createProject = async ({ name, userId }) => {
    if (!name) {
        throw new Error('Name is required');
    }
    if (!userId) {
        throw new Error('UserId is required');
    }
    
    const existingProject = await projectModel.findOne({ 
        name: name.trim(), 
        createdBy: userId 
    });
    if (existingProject) {
        throw new Error('You already have a project with this name');
    }
    
    let project;
    try {
        project = await projectModel.create({ 
            name: name.trim(), 
            users: [userId],
            createdBy: userId
        });
    } catch (error) {
        if (error.code === 11000) {
            throw new Error('You already have a project with this name');
        }
        throw error;
    }
    return formatProjectForUser(project, userId);
};

export const getAllProjectByUserId = async ({ userId }) => {
    if (!userId) {
        throw new Error('UserId is required');
    }
    const allUserProjects = await projectModel.find({ users: userId })
        .populate('createdBy', 'email')
        .populate('users', 'email');
    return allUserProjects.map((project) => formatProjectForUser(project, userId));
};

export const addUsersToProject = async ({ projectId, users, userId }) => {
    if (!projectId) {
        throw new Error('projectId is required');
    }
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
        throw new Error('Invalid projectId');
    }
    if (!users) {
        throw new Error('users are required');
    }
    if (!Array.isArray(users) || users.some(userId => !mongoose.Types.ObjectId.isValid(userId))) {
        throw new Error('Invalid userId(s) in users array');
    }
    if (!userId) {
        throw new Error('userId is required');
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new Error('Invalid userId');
    }
    await assertProjectOwner({ projectId, userId });
    const updatedProject = await projectModel.findOneAndUpdate(
        { _id: projectId },
        { $addToSet: { users: { $each: users } } },
        { new: true }
    ).populate('createdBy', 'email').populate('users', 'email');
    return formatProjectForUser(updatedProject, userId);
};

export const removeUserFromProject = async ({ projectId, collaboratorId, userId }) => {
    if (!projectId) {
        throw new Error('projectId is required');
    }
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
        throw new Error('Invalid projectId');
    }
    if (!collaboratorId) {
        throw new Error('collaboratorId is required');
    }
    if (!mongoose.Types.ObjectId.isValid(collaboratorId)) {
        throw new Error('Invalid collaboratorId');
    }
    if (!userId) {
        throw new Error('userId is required');
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new Error('Invalid userId');
    }

    const project = await assertProjectOwner({ projectId, userId });
    if (project.createdBy.toString() === collaboratorId.toString()) {
        throw new Error('Project owner cannot be removed');
    }

    const updatedProject = await projectModel.findOneAndUpdate(
        { _id: projectId },
        { $pull: { users: collaboratorId } },
        { new: true }
    ).populate('createdBy', 'email').populate('users', 'email');

    return formatProjectForUser(updatedProject, userId);
};

export const getProjectById = async ({ projectId, userId }) => {
    if (!projectId) {
        throw new Error('projectId is required');
    }
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
        throw new Error('Invalid projectId');
    }
    if (!userId) {
        throw new Error('userId is required');
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new Error('Invalid userId');
    }
    const project = await projectModel.findOne({ _id: projectId, users: userId })
        .populate('createdBy', 'email')
        .populate('users', 'email');
    if (!project) {
        throw new Error('User not belong to this project');
    }
    return formatProjectForUser(project, userId);
};

export const updateFileTree = async ({ projectId, fileTree, userId }) => {
    if (!projectId) {
        throw new Error('projectId is required');
    }
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
        throw new Error('Invalid projectId');
    }
    if (!userId) {
        throw new Error('userId is required');
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new Error('Invalid userId');
    }
    if (!fileTree) {
        throw new Error('fileTree is required');
    }
    await assertProjectMember({ projectId, userId });
    const project = await projectModel.findOneAndUpdate(
        { _id: projectId, users: userId },
        { fileTree },
        { new: true }
    ).populate('createdBy', 'email').populate('users', 'email');
    return formatProjectForUser(project, userId);
};

export const deleteProject = async ({ projectId, userId }) => {
    if (!projectId) {
        throw new Error('projectId is required');
    }
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
        throw new Error('Invalid projectId');
    }
    if (!userId) {
        throw new Error('userId is required');
    }
    await assertProjectOwner({ projectId, userId });
    await deleteMessagesByProject({ projectId });
    await projectModel.deleteOne({ _id: projectId });
};

// Helper function to clear all projects (for development)
export const deleteAllProjects = async () => {
    return projectModel.deleteMany({});
};