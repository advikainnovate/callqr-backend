import { db } from '../db';
import { auditLogs, NewAuditLog } from '../models/auditLog.schema';
import { logger } from '../utils';
import { Request } from 'express';

export interface AuditLogData {
  userId?: string;
  action: string;
  resource?: string;
  resourceId?: string;
  status: 'success' | 'failure' | 'error';
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

class AuditLogService {
  /**
   * Create an audit log entry
   */
  async createAuditLog(data: AuditLogData): Promise<void> {
    try {
      const logEntry: NewAuditLog = {
        userId: data.userId,
        action: data.action,
        resource: data.resource,
        resourceId: data.resourceId,
        status: data.status,
        details: data.details,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      };

      await db.insert(auditLogs).values(logEntry);
      
      // Also log to application logger for immediate visibility
      logger.info(`[AUDIT] ${data.action} - ${data.status}`, {
        userId: data.userId,
        resource: data.resource,
        resourceId: data.resourceId,
      });
    } catch (error) {
      // Don't throw - audit logging should not break the application
      logger.error('Failed to create audit log:', error);
    }
  }

  /**
   * Helper to extract IP and User-Agent from Express request
   */
  extractRequestInfo(req: Request): { ipAddress: string; userAgent: string } {
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() 
      || req.headers['x-real-ip'] as string
      || req.socket.remoteAddress 
      || 'unknown';
    
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    return { ipAddress, userAgent };
  }

  /**
   * Log authentication events
   */
  async logAuth(
    action: 'login' | 'logout' | 'register' | 'password_change' | 'token_refresh',
    userId: string | undefined,
    status: 'success' | 'failure',
    req: Request,
    details?: Record<string, any>
  ): Promise<void> {
    const { ipAddress, userAgent } = this.extractRequestInfo(req);
    
    await this.createAuditLog({
      userId,
      action,
      resource: 'auth',
      status,
      details,
      ipAddress,
      userAgent,
    });
  }

  /**
   * Log admin actions
   */
  async logAdminAction(
    action: string,
    userId: string,
    resource: string,
    resourceId: string,
    status: 'success' | 'failure',
    req: Request,
    details?: Record<string, any>
  ): Promise<void> {
    const { ipAddress, userAgent } = this.extractRequestInfo(req);
    
    await this.createAuditLog({
      userId,
      action: `admin_${action}`,
      resource,
      resourceId,
      status,
      details,
      ipAddress,
      userAgent,
    });
  }

  /**
   * Log security events
   */
  async logSecurityEvent(
    action: string,
    userId: string | undefined,
    status: 'success' | 'failure' | 'error',
    req: Request,
    details?: Record<string, any>
  ): Promise<void> {
    const { ipAddress, userAgent } = this.extractRequestInfo(req);
    
    await this.createAuditLog({
      userId,
      action: `security_${action}`,
      status,
      details,
      ipAddress,
      userAgent,
    });
  }
}

export const auditLogService = new AuditLogService();
