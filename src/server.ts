import app from './app';
import { createServer } from 'http';
import { logger } from './utils';
import { appConfig } from './config';
import { WebRTCService } from './services/webrtc.service';
import { db, client } from './db'; // Import database connection

const PORT = appConfig.port;
const server = createServer(app);

// Initialize WebRTC service
let webrtcService: WebRTCService;

let httpServer: any; // Declare server variable to hold the http.Server instance

// Service health check function
const checkServices = async () => {
  const services = {
    database: { status: 'unknown', details: '' },
    webrtc: { status: 'unknown', details: '' },
    environment: { status: 'ok', details: process.env.NODE_ENV || 'development' }
  };

  // Check database connection
  try {
    await client`SELECT 1`;
    services.database = { 
      status: 'connected', 
      details: 'PostgreSQL connection successful' 
    };
  } catch (error) {
    services.database = { 
      status: 'error', 
      details: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }

  // Check WebRTC service
  try {
    if (webrtcService) {
      services.webrtc = { 
        status: 'running', 
        details: `Socket.IO server initialized on port ${PORT}` 
      };
    } else {
      services.webrtc = { 
        status: 'error', 
        details: 'WebRTC service not initialized' 
      };
    }
  } catch (error) {
    services.webrtc = { 
      status: 'error', 
      details: `WebRTC service error: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }

  return services;
};

(async () => {
  try {
    logger.info('🔍 Checking service health...');
    
    // Initialize WebRTC service
    webrtcService = new WebRTCService(server);
    
    // Check all services
    const services = await checkServices();
    
    // Log service status
    logger.info('📊 Service Status:');
    Object.entries(services).forEach(([service, status]) => {
      const icon = status.status === 'connected' || status.status === 'running' || status.status === 'ok' ? '✅' : '❌';
      logger.info(`${icon} ${service.charAt(0).toUpperCase() + service.slice(1)}: ${status.status} - ${status.details}`);
    });

    // Check if critical services are working
    if (services.database.status === 'error') {
      throw new Error('Database connection failed - cannot start server');
    }

    logger.info('🚀 Starting server...');

    httpServer = server.listen(PORT, () => {
      logger.info(`🌐 Server is running on port ${PORT}`);
      logger.info(`📊 Health check available at: http://localhost:${PORT}/healthz`);
      logger.info(`📚 API docs available at: http://localhost:${PORT}/api-docs`);
      logger.info(`🔌 Signaling server ready for WebRTC connections`);
      logger.info(`🌍 Environment: ${appConfig.env}`);
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
})();

// Function to handle graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`📡 Received ${signal}. Initiating graceful shutdown...`);

  try {
    // Step 1: Shutdown WebRTC service (notify clients and close connections)
    if (webrtcService) {
      logger.info('🔌 Shutting down WebRTC service...');
      await webrtcService.shutdown(`Server received ${signal}`);
    }

    // Step 2: Close the HTTP server (stop accepting new connections)
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err: any) => {
        if (err) {
          logger.error('❌ Error closing HTTP server:', err);
          reject(err);
        } else {
          logger.info('✅ HTTP server closed');
          resolve();
        }
      });
    });

    // Step 3: Close Database connection
    await client.end();
    logger.info('✅ Database connection closed');

    logger.info('✅ Application gracefully shut down');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
};

// Timeout handler for forced shutdown
const forceShutdown = () => {
  logger.error('⚠️ Forcing shutdown after timeout');
  process.exit(1);
};

// Listen for termination signals
process.on('SIGTERM', () => {
  gracefulShutdown('SIGTERM');
  // Force shutdown after 15 seconds if graceful shutdown hangs
  setTimeout(forceShutdown, 15000);
});

process.on('SIGINT', () => {
  gracefulShutdown('SIGINT');
  // Force shutdown after 15 seconds if graceful shutdown hangs
  setTimeout(forceShutdown, 15000);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('❌ Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
  setTimeout(forceShutdown, 5000);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
  setTimeout(forceShutdown, 5000);
});

