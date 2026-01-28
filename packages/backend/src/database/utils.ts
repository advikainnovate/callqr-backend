/**
 * Database Utilities
 * 
 * Utility functions for database operations, query building,
 * and data transformation with encryption support.
 * 
 * Requirements: 10.4, 10.5
 */

import { DatabaseManager } from './connection';
import { UserId } from '../utils/types';

/**
 * Query builder interface
 */
export interface QueryBuilder {
  select(columns: string[]): QueryBuilder;
  from(table: string): QueryBuilder;
  where(condition: string, value?: any): QueryBuilder;
  orderBy(column: string, direction?: 'ASC' | 'DESC'): QueryBuilder;
  limit(count: number): QueryBuilder;
  offset(count: number): QueryBuilder;
  build(): { query: string; params: any[] };
}

/**
 * Simple query builder implementation
 */
export class SimpleQueryBuilder implements QueryBuilder {
  private selectColumns: string[] = ['*'];
  private fromTable: string = '';
  private whereConditions: Array<{ condition: string; value?: any }> = [];
  private orderByClause: string = '';
  private limitClause: string = '';
  private offsetClause: string = '';
  private paramIndex: number = 1;

  select(columns: string[]): QueryBuilder {
    this.selectColumns = columns;
    return this;
  }

  from(table: string): QueryBuilder {
    this.fromTable = table;
    return this;
  }

  where(condition: string, value?: any): QueryBuilder {
    this.whereConditions.push({ condition, value });
    return this;
  }

  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): QueryBuilder {
    this.orderByClause = `ORDER BY ${column} ${direction}`;
    return this;
  }

  limit(count: number): QueryBuilder {
    this.limitClause = `LIMIT ${count}`;
    return this;
  }

  offset(count: number): QueryBuilder {
    this.offsetClause = `OFFSET ${count}`;
    return this;
  }

  build(): { query: string; params: any[] } {
    const params: any[] = [];
    let query = `SELECT ${this.selectColumns.join(', ')} FROM ${this.fromTable}`;

    if (this.whereConditions.length > 0) {
      const whereClause = this.whereConditions
        .map(({ condition, value }) => {
          if (value !== undefined) {
            params.push(value);
            return condition.replace('?', `$${this.paramIndex++}`);
          }
          return condition;
        })
        .join(' AND ');
      query += ` WHERE ${whereClause}`;
    }

    if (this.orderByClause) {
      query += ` ${this.orderByClause}`;
    }

    if (this.limitClause) {
      query += ` ${this.limitClause}`;
    }

    if (this.offsetClause) {
      query += ` ${this.offsetClause}`;
    }

    return { query, params };
  }
}

/**
 * Database utility functions
 */
export class DatabaseUtils {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  /**
   * Create a new query builder
   */
  createQueryBuilder(): QueryBuilder {
    return new SimpleQueryBuilder();
  }

  /**
   * Execute a paginated query
   */
  async paginatedQuery(
    baseQuery: string,
    params: any[],
    page: number = 1,
    pageSize: number = 20
  ): Promise<{
    data: any[];
    pagination: {
      page: number;
      pageSize: number;
      totalCount: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM (${baseQuery}) as count_query`;
    const countResult = await this.db.query(countQuery, params);
    const totalCount = parseInt(countResult.rows[0].total);

    // Calculate pagination
    const offset = (page - 1) * pageSize;
    const totalPages = Math.ceil(totalCount / pageSize);

    // Execute paginated query
    const paginatedQuery = `${baseQuery} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const paginatedParams = [...params, pageSize, offset];
    const dataResult = await this.db.query(paginatedQuery, paginatedParams);

    return {
      data: dataResult.rows,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }

  /**
   * Bulk insert with conflict resolution
   */
  async bulkInsert(
    table: string,
    columns: string[],
    values: any[][],
    onConflict?: 'ignore' | 'update',
    conflictColumns?: string[]
  ): Promise<number> {
    if (values.length === 0) {
      return 0;
    }

    const placeholders = values
      .map((_, rowIndex) =>
        `(${columns.map((_, colIndex) => `$${rowIndex * columns.length + colIndex + 1}`).join(', ')})`
      )
      .join(', ');

    let query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}`;

    if (onConflict === 'ignore') {
      query += ' ON CONFLICT DO NOTHING';
    } else if (onConflict === 'update' && conflictColumns) {
      const updateClause = columns
        .filter(col => !conflictColumns.includes(col))
        .map(col => `${col} = EXCLUDED.${col}`)
        .join(', ');
      query += ` ON CONFLICT (${conflictColumns.join(', ')}) DO UPDATE SET ${updateClause}`;
    }

    const flatValues = values.flat();
    const result = await this.db.query(query, flatValues);
    return result.rowCount || 0;
  }

  /**
   * Safe delete with conditions
   */
  async safeDelete(
    table: string,
    conditions: Record<string, any>,
    maxRows: number = 1000
  ): Promise<number> {
    const whereClause = Object.keys(conditions)
      .map((key, index) => `${key} = $${index + 1}`)
      .join(' AND ');

    const values = Object.values(conditions);

    // First, check how many rows would be affected
    const countQuery = `SELECT COUNT(*) as count FROM ${table} WHERE ${whereClause}`;
    const countResult = await this.db.query(countQuery, values);
    const rowCount = parseInt(countResult.rows[0].count);

    if (rowCount > maxRows) {
      throw new Error(`Delete operation would affect ${rowCount} rows, exceeding limit of ${maxRows}`);
    }

    // Perform the delete
    const deleteQuery = `DELETE FROM ${table} WHERE ${whereClause}`;
    const result = await this.db.query(deleteQuery, values);
    return result.rowCount || 0;
  }

  /**
   * Upsert operation (insert or update)
   */
  async upsert(
    table: string,
    data: Record<string, any>,
    conflictColumns: string[]
  ): Promise<any> {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');

    const updateClause = columns
      .filter(col => !conflictColumns.includes(col))
      .map(col => `${col} = EXCLUDED.${col}`)
      .join(', ');

    const query = `
      INSERT INTO ${table} (${columns.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT (${conflictColumns.join(', ')})
      DO UPDATE SET ${updateClause}
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  /**
   * Execute database cleanup operations
   */
  async performCleanup(): Promise<any> {
    const result = await this.db.query('SELECT perform_database_cleanup() as result');
    return result.rows[0].result;
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(): Promise<{
    tableStats: Array<{
      tableName: string;
      rowCount: number;
      sizeBytes: number;
    }>;
    indexStats: Array<{
      indexName: string;
      tableName: string;
      sizeBytes: number;
    }>;
  }> {
    // Get table statistics
    const tableStatsQuery = `
      SELECT 
        schemaname,
        tablename,
        n_tup_ins as inserts,
        n_tup_upd as updates,
        n_tup_del as deletes,
        n_live_tup as live_rows,
        n_dead_tup as dead_rows,
        pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
      FROM pg_stat_user_tables
      ORDER BY size_bytes DESC
    `;

    const indexStatsQuery = `
      SELECT 
        schemaname,
        tablename,
        indexname,
        idx_tup_read as reads,
        idx_tup_fetch as fetches,
        pg_relation_size(schemaname||'.'||indexname) as size_bytes
      FROM pg_stat_user_indexes
      ORDER BY size_bytes DESC
    `;

    const [tableResult, indexResult] = await Promise.all([
      this.db.query(tableStatsQuery),
      this.db.query(indexStatsQuery)
    ]);

    return {
      tableStats: tableResult.rows.map((row: any) => ({
        tableName: row.tablename,
        rowCount: parseInt(row.live_rows),
        sizeBytes: parseInt(row.size_bytes)
      })),
      indexStats: indexResult.rows.map((row: any) => ({
        indexName: row.indexname,
        tableName: row.tablename,
        sizeBytes: parseInt(row.size_bytes)
      }))
    };
  }

  /**
   * Encrypt sensitive field for storage
   */
  encryptField(value: string): string {
    return this.db.encrypt(value);
  }

  /**
   * Decrypt sensitive field from storage
   */
  decryptField(encryptedValue: string): string {
    return this.db.decrypt(encryptedValue);
  }

  /**
   * Hash field for storage (one-way)
   */
  hashField(value: string, salt?: string): string {
    return this.db.hash(value, salt);
  }

  /**
   * Verify hashed field
   */
  verifyHashedField(value: string, hashedValue: string): boolean {
    return this.db.verifyHash(value, hashedValue);
  }

  /**
   * Log security event
   */
  async logSecurityEvent(
    eventType: string,
    anonymousUserId?: string,
    ipAddress?: string,
    userAgent?: string,
    eventData?: any
  ): Promise<void> {
    const query = `
      INSERT INTO security_audit_log 
      (event_type, anonymous_user_id, ip_address, user_agent, event_data)
      VALUES ($1, $2, $3, $4, $5)
    `;

    await this.db.query(query, [
      eventType,
      anonymousUserId,
      ipAddress,
      userAgent,
      eventData ? JSON.stringify(eventData) : null
    ]);
  }

  /**
   * Get user by ID with decryption
   */
  async getUserById(userId: UserId): Promise<any | null> {
    const query = 'SELECT * FROM users WHERE user_id = $1 AND is_active = true';
    const result = await this.db.query(query, [userId]);

    if (result.rows.length === 0) {
      return null;
    }

    const user = result.rows[0];

    // Decrypt sensitive fields if they exist
    if (user.emergency_contact) {
      try {
        user.emergency_contact = this.decryptField(user.emergency_contact);
      } catch (error) {
        console.error('Failed to decrypt emergency contact:', error);
        user.emergency_contact = null;
      }
    }

    if (user.vehicle_number) {
      try {
        user.vehicle_number = this.decryptField(user.vehicle_number);
      } catch (error) {
        console.error('Failed to decrypt vehicle number:', error);
        user.vehicle_number = null;
      }
    }

    return user;
  }

  /**
   * Create user with encryption
   */
  async createUser(userData: {
    authHash: string;
    emergencyContact?: string;
    vehicleNumber?: string;
  }): Promise<UserId> {
    const query = `
      INSERT INTO users (auth_hash, emergency_contact, vehicle_number)
      VALUES ($1, $2, $3)
      RETURNING user_id
    `;

    const encryptedEmergencyContact = userData.emergencyContact
      ? this.encryptField(userData.emergencyContact)
      : null;

    const encryptedVehicleNumber = userData.vehicleNumber
      ? this.encryptField(userData.vehicleNumber)
      : null;

    const result = await this.db.query(query, [
      userData.authHash,
      encryptedEmergencyContact,
      encryptedVehicleNumber
    ]);

    return result.rows[0].user_id as UserId;
  }
}

/**
 * Create database utilities instance
 */
export function createDatabaseUtils(db: DatabaseManager): DatabaseUtils {
  return new DatabaseUtils(db);
}