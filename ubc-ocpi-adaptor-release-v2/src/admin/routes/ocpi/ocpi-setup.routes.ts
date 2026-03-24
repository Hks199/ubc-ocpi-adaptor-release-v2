import { NextFunction, Request, Response, Router } from 'express';
import AdminVersionsModule from '../../modules/AdminVersionsModule';
import AdminCredentialsModule from '../../modules/AdminCredentialsModule';
// import { adminAuth } from '../utils/middlewares';
import handleRequest from '../utils/requestHandler';

const router = Router();

// Sync versions from CPO and store in DB for a given partner
router.post('/versions',
    //  adminAuth,
      (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, AdminVersionsModule.getCpoVersions)
);

// Sync version details (endpoints) from CPO and store in DB for a given partner+version
router.post('/versions/details',
    //  adminAuth,
      (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, AdminVersionsModule.getCpoVersionDetails)
);

// Directly POST raw OCPI Credentials payload to a CPO 2
router.post('/credentials',
    //  adminAuth,
      (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, AdminCredentialsModule.sendPostCredentials)
);

// GET CPO view of credentials for a given partner
router.get('/credentials',
    //  adminAuth,
     (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, AdminCredentialsModule.getCpoCredentials)
);

// Upsert CPO partner + credentials from a raw OCPI credentials payload 1
router.post(
    '/register',
    // adminAuth,
    (req: Request, res: Response, next: NextFunction) =>
        handleRequest(req, res, next, AdminCredentialsModule.registerCpoFromCredentialsPayload),
);

export default router;
