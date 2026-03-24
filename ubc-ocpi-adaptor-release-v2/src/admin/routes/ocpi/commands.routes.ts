import { NextFunction, Request, Response, Router } from 'express';
import AdminCommandsModule from '../../modules/AdminCommandsModule';
// import { adminAuth } from '../utils/middlewares';
import handleRequest from '../utils/requestHandler';

const router = Router();

// Start charging session
router.post(
    '/start',
    // adminAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(req, res, next, AdminCommandsModule.startCharging),
);

// Stop charging session
router.post(
    '/stop',
    // adminAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(req, res, next, AdminCommandsModule.stopCharging),
);

export default router;


