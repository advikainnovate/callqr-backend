/**
 * Privacy-Preserving QR-Based Calling System - Backend Entry Point
 * 
 * This is the main entry point for the backend services that handle
 * token management, call routing, and privacy-preserving communication.
 * Uses simple integration for better compatibility.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import * as dotenv from 'dotenv';
import { createApiRouter } from './api/routes';
import { checkDatabaseHealth } from './database';
import { simpleIntegration, SimpleIntegrationConfig } from './integration/simpleIntegration';
import { createStandardMiddlewareStack } from './api/middleware';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: true, // Allow all origins for development
  credentials: true
}));

// Standard middleware stack
app.use(...createStandardMiddlewareStack());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint with integrated system health
app.get('/health', async (req, res) => {
  try {
    const systemHealth = await simpleIntegration.healthCheck();
    const dbHealth = await checkDatabaseHealth();
    
    res.status(systemHealth.status === 'healthy' ? 200 : 503).json({ 
      status: systemHealth.status,
      timestamp: new Date().toISOString(),
      service: 'privacy-qr-calling-backend',
      database: dbHealth,
      services: systemHealth.services,
      errors: systemHealth.errors
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'privacy-qr-calling-backend',
      error: 'System health check failed'
    });
  }
});

// Initialize integrated system
async function initializeSystem() {
  try {
    // Create system configuration
    const config: SimpleIntegrationConfig = {
      database: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'privacy_qr_calling',
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'password',
        ssl: process.env.DB_SSL === 'true'
      },
      auth: {
        requireMFA: true,
        passwordPepper: process.env.PASSWORD_PEPPER,
        jwtSecret: process.env.JWT_SECRET || 'your-jwt-secret-key',
        sessionDurationHours: 24
      }
    };

    // Initialize the integrated system
    await simpleIntegration.initialize(config);

    // Get initialized services
    const services = simpleIntegration.getServices();

    // Mount API routes with integrated services
    app.use('/api', createApiRouter(
      services.authService,
      services.tokenManager,
      services.callRouter
    ));

    console.log('Simple integrated system initialized successfully');
  } catch (error) {
    console.error('Failed to initialize integrated system:', error);
    process.exit(1);
  }
}

// API routes will be mounted after system initialization
app.get('/api/v1', (req, res) => {
  res.json({ 
    message: 'Privacy-Preserving QR-Based Calling System API',
    version: '1.0.0'
  });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({ 
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    timestamp: new Date().toISOString()
  });
});

// Start server with simple integrated system
if (require.main === module) {
  initializeSystem().then(() => {
    app.listen(PORT, () => {
      console.log(`Backend server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`API: http://localhost:${PORT}/api/v1`);
    });
  }).catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export default app;