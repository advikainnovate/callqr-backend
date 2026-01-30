import swaggerJSDoc from 'swagger-jsdoc';
import { version } from '../../package.json';
import './webrtc.swagger'; // Import WebRTC documentation

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Express TypeScript PostgreSQL QR Calling API',
    version,
    description:
      'A privacy-preserving QR-based calling system with WebRTC support, documented with Swagger.',
    license: {
      name: 'ISC',
    },
  },
  servers: [
    {
      url: 'http://localhost:4000',
      description: 'Development server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
};

const options: swaggerJSDoc.Options = {
  swaggerDefinition,
  apis: ['./src/routes/index.ts', './src/routes/*.ts', './src/schemas/*.ts', './src/config/*.ts'],
};

export const swaggerSpec = swaggerJSDoc(options);
