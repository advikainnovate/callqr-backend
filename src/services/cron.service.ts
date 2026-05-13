import cron, { ScheduledTask } from 'node-cron';
import { userService } from './user.service';
import { logger } from '../utils';

export class CronService {
  private static instance: CronService;
  private jobs: ScheduledTask[] = [];

  private constructor() {}

  public static getInstance(): CronService {
    if (!CronService.instance) {
      CronService.instance = new CronService();
    }
    return CronService.instance;
  }

  /**
   * Initializes all scheduled jobs
   */
  public init(): void {
    logger.info('⏰ Initializing scheduled background jobs...');

    // Job 1: Purge expired deleted accounts (every day at midnight)
    const purgeJob = cron.schedule('0 0 * * *', async () => {
      logger.info('🧹 Starting daily purge of expired deleted accounts...');
      try {
        const count = await userService.purgeExpiredDeletedAccounts();
        if (count > 0) {
          logger.info(`✅ Successfully purged ${count} expired accounts.`);
        } else {
          logger.info('ℹ️ No expired accounts found to purge.');
        }
      } catch (error) {
        logger.error('❌ Error during expired account purge job:', error);
      }
    });

    this.jobs.push(purgeJob);
    logger.info('✅ Scheduled job: Daily Account Purge (00:00)');
  }

  /**
   * Stops all scheduled jobs
   */
  public stopAll(): void {
    logger.info('🛑 Stopping all scheduled jobs...');
    this.jobs.forEach(job => job.stop());
    this.jobs = [];
  }
}

export const cronService = CronService.getInstance();
