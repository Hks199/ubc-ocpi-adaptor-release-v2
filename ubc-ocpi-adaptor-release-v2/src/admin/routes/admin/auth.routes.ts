import { Router, Request, Response, NextFunction } from 'express';
import AdminAuthModule from '../../modules/AdminAuthModule';
import { adminAuth, adminRequestLogger } from '../utils/middlewares';
import handleRequest from '../utils/requestHandler';

const router = Router();

router.post('/login', adminRequestLogger, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, AdminAuthModule.login)
);

router.get('/me', adminAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, AdminAuthModule.getMe)
);

export default router;
