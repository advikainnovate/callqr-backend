import { Router } from 'express';
import { logger } from '../utils';
import userRoutes from './user.routes';
import qrCodeRoutes from './qrCode.routes';
import callRoutes from './call.routes';
import webrtcRoutes from './webrtc.routes';
import reportRoutes from './report.routes';

const router = Router();

// User routes
router.use('/users', userRoutes);

// QR Code routes
router.use('/qr-codes', qrCodeRoutes);

// Call routes
router.use('/calls', callRoutes);

// WebRTC routes
router.use('/webrtc', webrtcRoutes);

// Report routes
router.use('/reports', reportRoutes);

export default router;
