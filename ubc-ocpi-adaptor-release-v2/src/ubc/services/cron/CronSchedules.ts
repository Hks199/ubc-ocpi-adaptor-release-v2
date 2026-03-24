/**
 * Cron Schedule Configuration
 * 
 * This file contains all cron schedule expressions for the application.
 * 
 * Cron format: minute hour day month day-of-week
 * 
 * Examples:
//  * -  * /30 * * * *' - Every 30 minutes
 * - '0 0 * * *' - Every day at midnight
 * - '0 0 * * 0' - Every Sunday at midnight
 * - '0 9 * * 1-5' - Every weekday at 9 AM
 */

/**
 * Auto Cancellation Cron Schedule
 * Runs every 30 minutes to check and cancel sessions
 */
export const AUTO_CANCELLATION_CRON_SCHEDULE = '*/30 * * * *';

/**
 * All cron schedules mapped by cron job name
 * Add new cron schedules here as they are created
 */
export const CronSchedules = {
    AUTO_CANCELLATION: AUTO_CANCELLATION_CRON_SCHEDULE,
    // Add more cron schedules here as needed
    // EXAMPLE_CRON: '0 * * * *',
} as const;

/**
 * Type for cron schedule names
 */
export type CronScheduleName = keyof typeof CronSchedules;
