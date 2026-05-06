import express from 'express';
import path from 'path';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import {
  generalLimiter,
  bodyParserMiddleware,
  corsMiddleware,
  requestLogger,
  notFoundHandler,
  errorHandler,
  sanitizeInput,
  xssProtection,
} from './middlewares/index';
import routes from './routes/index';
import { asyncHandler } from './utils';

const app = express();

// Trust proxy for rate limiting when behind reverse proxy
app.set('trust proxy', 1);

// Debug Logger removed for production

// Core Middlewares
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
  })
);
app.use(corsMiddleware);
app.use(generalLimiter);
app.use(bodyParserMiddleware);
app.use(cookieParser());
app.use(requestLogger);

// Security Middlewares
app.use(xssProtection);
app.use(sanitizeInput);

// Health Check Routes (outside /api prefix)
app.get(
  '/healthz',
  asyncHandler(async (_, res) => {
    try {
      // Import database client for health check
      const { client } = await import('./db');
      const { checkS3Health } = await import('./config/storage');

      const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        services: {
          database: { status: 'unknown', details: '' },
          webrtc: { status: 'unknown', details: '' },
          storage: { status: 'unknown', details: '' },
          environment: {
            status: 'ok',
            details: process.env.NODE_ENV || 'development',
          },
        },
      };

      // Check database connection
      try {
        await client`SELECT 1`;
        health.services.database = {
          status: 'connected',
          details: 'PostgreSQL connection successful',
        };
      } catch (error) {
        health.services.database = {
          status: 'error',
          details: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
        health.status = 'degraded';
      }

      // Check if we can access the webrtc service (basic check)
      try {
        health.services.webrtc = {
          status: 'running',
          details: 'WebRTC signaling service available',
        };
      } catch (error) {
        health.services.webrtc = {
          status: 'error',
          details: `WebRTC service error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
        health.status = 'degraded';
      }

      // Check S3 connection
      const storageHealth = await checkS3Health();
      health.services.storage = storageHealth;
      if (storageHealth.status === 'error') {
        health.status = 'degraded';
      }

      const statusCode = health.status === 'ok' ? 200 : 503;
      res.status(statusCode).json(health);
    } catch (error) {
      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })
);

// Serve the test client
app.get('/test', (req, res) => {
  res.sendFile(path.join(__dirname, '../minimal_client.html'));
});

// API Routes
app.use('/api', routes);

// Swagger Docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
