import { NextFunction, Request, Response, Router } from 'express';
import AdminLocationsModule from '../../modules/AdminLocationsModule';
import { adminAuth } from '../utils/middlewares';
import handleRequest from '../utils/requestHandler';

const router = Router();

/**
 * GET /admin/ocpi/locations/generate-beckn-connector-ids
 * Bulk generate beckn_connector_id for all connectors of a partner
 * Query params: partner_id (required)
 * Format: IND*{ubc_party_id}*{ocpi_location_id}*{evse_uid}*{connector_id}
 * NOTE: This route MUST be defined BEFORE /:location_id to avoid matching
 */
router.get('/generate-beckn-connector-ids', adminAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, AdminLocationsModule.generateBecknConnectorIds)
);

router.get('/generate-beckn-ids', adminAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, AdminLocationsModule.generateBecknIds)
);


router.get('/',
    //  adminAuth,
     async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, AdminLocationsModule.sendGetLocations)
);

router.get('/:location_id', adminAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, AdminLocationsModule.sendGetLocation)
);

export default router;
