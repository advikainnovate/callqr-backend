import { db, client } from '../db';
import { logger } from './logger';

/**
 * Execute a function within a database transaction
 * Automatically commits on success or rolls back on error
 * 
 * @param callback - Function to execute within transaction
 * @returns Result of the callback function
 * 
 * @example
 * const result = await withTransaction(async (tx) => {
 *   const user = await tx.insert(users).values({...}).returning();
 *   const subscription = await tx.insert(subscriptions).values({...}).returning();
 *   return { user, subscription };
 * });
 */
export async function withTransaction<T>(
  callback: (tx: any) => Promise<T>
): Promise<T> {
  try {
    // Use Drizzle's transaction method
    const result = await db.transaction(async (tx) => {
      return await callback(tx);
    });
    
    return result;
  } catch (error) {
    logger.error('Transaction failed and was rolled back:', error);
    throw error;
  }
}

/**
 * Execute multiple operations atomically
 * All operations succeed or all fail together
 * 
 * @param operations - Array of async operations to execute
 * @returns Array of results from all operations
 * 
 * @example
 * const [user, qrCode, subscription] = await executeAtomic([
 *   (tx) => tx.insert(users).values({...}).returning(),
 *   (tx) => tx.insert(qrCodes).values({...}).returning(),
 *   (tx) => tx.insert(subscriptions).values({...}).returning(),
 * ]);
 */
export async function executeAtomic<T extends any[]>(
  operations: Array<(tx: any) => Promise<any>>
): Promise<T> {
  return withTransaction(async (tx) => {
    const results: any[] = [];
    
    for (const operation of operations) {
      const result = await operation(tx);
      results.push(result);
    }
    
    return results as T;
  });
}
