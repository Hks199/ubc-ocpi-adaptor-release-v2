import { NextFunction, Request, Response, Router } from 'express';
import AdminTokensModule from '../../modules/AdminTokensModule';
// import { adminAuth } from '../utils/middlewares';
import handleRequest from '../utils/requestHandler';

const router = Router();

// Upsert a token in DB and sync it to the CPO via OCPI Tokens PUT
router.post('/',
    //  adminAuth,
     async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, AdminTokensModule.upsertTokenAndSyncWithCPO)
);

export default router;
 
 
