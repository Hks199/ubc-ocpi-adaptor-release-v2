import { Router, Request, Response, NextFunction } from 'express';
// import AdminTariffsModule from '../../modules/AdminTariffsModule';
import { adminAuth } from '../utils/middlewares';
import handleRequest from '../utils/requestHandler';

const router = Router();

// router.post('/fetch', adminAuth, async (req: Request, res: Response, next: NextFunction) =>
//     handleRequest(req, res, next, AdminTariffsModule.fetchTariffs)
// );

// router.post('/sync-to-cds', adminAuth, async (req: Request, res: Response, next: NextFunction) =>
//     handleRequest(req, res, next, AdminTariffsModule.syncToCDS)
// );

// router.get('/', adminAuth, async (req: Request, res: Response, next: NextFunction) =>
//     handleRequest(req, res, next, AdminTariffsModule.getTariffs)
// );

// router.get('/:tariff_id', adminAuth, async (req: Request, res: Response, next: NextFunction) =>
//     handleRequest(req, res, next, AdminTariffsModule.getTariff)
// );

export default router;
