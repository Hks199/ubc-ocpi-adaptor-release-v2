import * as cron from 'node-cron';
import { logger } from '../../../services/logger.service';
import { AutoCancellationCronService } from './AutoCancellationCronService';
import { CronSchedules } from './CronSchedules';

/**
 * Central service for managing all cron jobs
 */
export class CronService {
    private static cronJobs: Map<string, cron.ScheduledTask> = new Map();

    /**
     * Start all cron jobs
     */
    public static start(): void {
        logger.info('🔄 CronService: Starting all cron jobs');

        // Start Auto Cancellation Cron
        this.startAutoCancellationCron();

        logger.info('✅ CronService: All cron jobs started');
    }

    /**
     * Stop all cron jobs
     */
    public static stop(): void {
        logger.info('🛑 CronService: Stopping all cron jobs');

        // Stop all registered cron jobs
        for (const [name, cronJob] of this.cronJobs.entries()) {
            cronJob.stop();
            logger.info(`🛑 CronService: Stopped ${name}`);
        }

        this.cronJobs.clear();
        logger.info('✅ CronService: All cron jobs stopped');
    }

    /**
     * Start Auto Cancellation Cron Job
     * Runs every 30 minutes
     */
    private static startAutoCancellationCron(): void {
        const cronName = 'AutoCancellationCron';
        const schedule = CronSchedules.AUTO_CANCELLATION;

        if (this.cronJobs.has(cronName)) {
            logger.warn(`⚠️ CronService: ${cronName} is already running`);
            return;
        }

        const cronJob = cron.schedule(schedule, async () => {
            logger.info(`🔄 ${cronName}: Starting scheduled job`);
            try {
                await AutoCancellationCronService.processAutoCancellation();
            }
            catch (error) {
                logger.error(`❌ ${cronName}: Error in scheduled job`, error instanceof Error ? error : undefined);
            }
        });

        this.cronJobs.set(cronName, cronJob);
        logger.info(`✅ ${cronName}: Started (schedule: ${schedule})`);
    }
}
