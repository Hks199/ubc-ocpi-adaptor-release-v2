import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { appConfig } from './config/app.config';
import { databaseService } from './services/database.service';
import { logger } from './services/logger.service';
import { AppError } from './utils/errors';

// Import routes
import ubcRoutes from './ubc/ubc-router';
import adminAuthRoutes from './admin/routes/admin/auth.routes';
import adminOCPISetupRoutes from './admin/routes/ocpi/ocpi-setup.routes';
import adminLocationsRoutes from './admin/routes/ocpi/locations.routes';
import adminTariffsRoutes from './admin/routes/ocpi/tariffs.routes';
import adminTokensRoutes from './admin/routes/ocpi/tokens.routes';
import adminCommandsRoutes from './admin/routes/ocpi/commands.routes';
import healthRoutes from './api/health/routes';
import ocpiOutgoingRoutes from './api/ocpi/ocpi-outgoing-routes';
import ocpiIncomingRoutes from './ocpi/ocpi-incoming-routes';
import appRoutes from './api/app/routes';
import { CronService } from './ubc/services/cron/CronService';

const app: Express = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

import { v4 as uuidv4 } from 'uuid';

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
    const correlationId = uuidv4();
    logger.setCorrelationId(correlationId);
    req.headers['x-correlation-id'] = correlationId;

    logger.info('Incoming request', {
        method: req.method,
        path: req.path,
        correlationId,
    });

    next();
});
// OCPI EMSP incoming (receiver) interface
// - Versions:        /ocpi/versions
// - Version details: /ocpi/2.2.1
// - Modules:         /ocpi/2.2.1/<module>
app.use('/ocpi', ocpiIncomingRoutes);

// OCPI outgoing (internal admin-triggered EMSP → CPO calls)
app.use('/ocpi/cpo', ocpiOutgoingRoutes);

app.use('/ubc', ubcRoutes);
// UAT: CDS may POST to BPP_URL + "/bpp/receiver/on_catalog_publish" when ingress sends that path to this app (same handlers as /ubc).
app.use('/bpp/receiver', ubcRoutes);

app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin/ocpi', adminOCPISetupRoutes);
app.use('/api/admin/locations', adminLocationsRoutes);
app.use('/api/admin/tariffs', adminTariffsRoutes);
app.use('/api/admin/tokens', adminTokensRoutes);
app.use('/api/admin/commands', adminCommandsRoutes);
app.use('/api/health', healthRoutes);

app.use('/api/app', appRoutes);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
    res.json({
        name: 'UBC OCPI Adaptor',
        version: '1.0.0',
        status: 'running',
    });
});

// Error handling middleware
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
    // Check if response has already been sent
    if (res.headersSent) {
        return next(error);
    }

    logger.error('Unhandled error', error, {
        path: req.path,
        method: req.method,
    });

    if (error instanceof AppError) {
        res.status(error.statusCode).json({
            success: false,
            error: error.message,
            ...(error instanceof Error && 'details' in error
                ? { details: (error as any).details }
                : {}),
        });
        return;
    }

    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: appConfig.nodeEnv === 'development' ? error.message : undefined,
    });
});

// 404 handler
app.use((req: Request, res: Response) => {
    res.status(404).json({
        success: false,
        error: 'Not found',
        path: req.path,
    });
});

// Graceful shutdown
const shutdown = async () => {
    logger.info('Shutting down gracefully...');

    try {
        // Stop cron jobs
        if(process.env.NODE_ENV === 'prod') {
            CronService.stop();
        }
        
        await databaseService.disconnect();
        process.exit(0);
    }
    catch (error) {
        logger.error('Error during shutdown', error as Error);
        process.exit(1);
    }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
const startServer = async () => {
    try {
        // Connect to database
        await databaseService.connect();

        // Start cron jobs
        if(process.env.NODE_ENV === 'prod') {
            CronService.start();
        }

        app.listen(appConfig.port, () => {
            logger.info(`Server started on port ${appConfig.port}`, {
                environment: appConfig.nodeEnv,
                port: appConfig.port,
            });
        });
    }
    catch (error) {
        logger.error('Failed to start server', error as Error);
        process.exit(1);
    }
};

startServer();

export default app;
