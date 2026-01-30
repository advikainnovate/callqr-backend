import app from './app';
import { createServer } from 'http';
import { logger } from './utils';
import { appConfig } from './config';
import { WebRTCService } from './services/webrtc.service';
// import { client } from './db'; // Import client if you need to close it explicitly, though often not strictly necessary for simple apps

const PORT = appConfig.port;
const server = createServer(app);

// Initialize WebRTC service
const webrtcService = new WebRTCService(server);

let httpServer: any; // Declare server variable to hold the http.Server instance

(async () => {
  try {
    // Database connection is handled lazily by Drizzle/Postgres.js,
    // but you could add a check here if desired.
    logger.info('Initializing server...');

    httpServer = server.listen(PORT, () => {
      logger.info(`🚀 Server is running on port ${PORT}`);
      logger.info(
        `📊 Health check available at: http://localhost:${PORT}/healthz`
      );
      logger.info(
        `📚 API docs available at: http://localhost:${PORT}/api-docs`
      );
      logger.info(`🌍 Environment: ${appConfig.env}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
})();

// Function to handle graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Initiating graceful shutdown...`);

  // Close the HTTP server
  httpServer.close(async (err: any) => {
    if (err) {
      logger.error('Error closing HTTP server:', err);
      process.exit(1);
    }
    logger.info('HTTP server closed.');

    // Close Database connection if needed
    // await client.end();
    // logger.info('Database connection closed.');

    logger.info('Application gracefully shut down.');
    process.exit(0);
  });

  // Force close if server hasn't exited within a timeout
  setTimeout(() => {
    logger.error('Forcing shutdown after timeout.');
    process.exit(1);
  }, 10000); // 10 seconds timeout
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

