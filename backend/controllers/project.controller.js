import * as projectService from '../services/project.service.js';
import userModel from '../models/user.model.js';
import { validationResult } from 'express-validator';

const emitProjectListUpdate = (req, userIds = []) => {
    const io = req.app.get('io');
    if (!io) {
        return;
    }

    userIds.forEach((userId) => {
        io.to(`user:${userId.toString()}`).emit('projects-changed');
    });
};

export const createProject = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        const { name } = req.body;
        const loggedInUser = await userModel.findOne({ email: req.user.email });
        const userId = loggedInUser._id;
        const newProject = await projectService.createProject({ name, userId });
        res.status(201).json(newProject);
    } catch (err) {
        console.error(err.message);
        res.status(400).send(err.message);
    }
};

export const getAllProject = async (req, res) => {
    try {
        const loggedInUser = await userModel.findOne({ email: req.user.email });
        const allUserProjects = await projectService.getAllProjectByUserId({ userId: loggedInUser._id });
        return res.status(200).json({ projects: allUserProjects }); 
    } catch (err) {
        console.error(err.message);
        res.status(400).json({ error: err.message });
    }
};

export const addUserToProject = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        const { projectId, users } = req.body;
        const loggedInUser = await userModel.findOne({ email: req.user.email });
        const project = await projectService.addUsersToProject({ projectId, users, userId: loggedInUser._id });
        emitProjectListUpdate(req, users);
        return res.status(200).json({ project });
    } catch (err) {
        console.error(err.message);
        res.status(400).json({ error: err.message });
    }
};

export const removeUserFromProject = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        const { projectId, collaboratorId } = req.body;
        const loggedInUser = await userModel.findOne({ email: req.user.email });
        const project = await projectService.removeUserFromProject({
            projectId,
            collaboratorId,
            userId: loggedInUser._id
        });
        emitProjectListUpdate(req, [ collaboratorId ]);
        return res.status(200).json({ project });
    } catch (err) {
        console.error(err.message);
        res.status(400).json({ error: err.message });
    }
};

export const getProjectById = async (req, res) => {
    const { projectId } = req.params;
    try {
        const loggedInUser = await userModel.findOne({ email: req.user.email });
        const project = await projectService.getProjectById({ projectId, userId: loggedInUser._id });
        return res.status(200).json({ project });
    } catch (err) {
        console.error(err.message);
        res.status(400).json({ error: err.message });
    }
};

export const updateFileTree = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        const { projectId, fileTree } = req.body;
        const loggedInUser = await userModel.findOne({ email: req.user.email });
        const project = await projectService.updateFileTree({ projectId, fileTree, userId: loggedInUser._id });
        return res.status(200).json({ project });
    } catch (err) {
        console.error(err.message);
        res.status(400).json({ error: err.message });
    }
};

export const deleteProject = async (req, res) => {
    const { projectId } = req.params;
    try {
        const loggedInUser = await userModel.findOne({ email: req.user.email });
        const userId = loggedInUser._id;
        await projectService.deleteProject({ projectId, userId });
        return res.status(200).json({ message: 'Project deleted successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(400).json({ error: err.message });
    }
};