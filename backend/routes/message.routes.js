import { Router } from 'express';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as messageController from '../controllers/message.controller.js';

const router = Router();

router.get('/project/:projectId', authMiddleware.authUser, messageController.getProjectMessages);

export default router;