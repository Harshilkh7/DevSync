import userModel from '../models/user.model.js';
import * as messageService from '../services/message.service.js';

export const getProjectMessages = async (req, res) => {
    try {
        const loggedInUser = await userModel.findOne({ email: req.user.email });
        const messages = await messageService.getProjectMessages({
            projectId: req.params.projectId,
            userId: loggedInUser._id,
            limit: req.query.limit
        });

        return res.status(200).json({ messages });
    } catch (err) {
        console.error(err.message);
        return res.status(400).json({ error: err.message });
    }
};