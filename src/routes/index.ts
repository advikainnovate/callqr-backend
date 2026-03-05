import { Router } from 'express';
import { logger } from '../utils';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import qrCodeRoutes from './qrCode.routes';
import callRoutes from './call.routes';
import webrtcRoutes from './webrtc.routes';
import reportRoutes from './report.routes';
import subscriptionRoutes from './subscription.routes';
import chatSessionRoutes from './chatSession.routes';
import messageRoutes from './message.routes';
import adminRoutes from './admin.routes';
import paymentRoutes from './payment.routes';
import phoneVerificationRoutes from './phone-verification.routes';

const router = Router();

// Auth routes
router.use('/auth', authRoutes);

// Phone verification routes (under /auth)
router.use('/auth', phoneVerificationRoutes);

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

// Subscription routes
router.use('/subscriptions', subscriptionRoutes);

// Chat session routes
router.use('/chat-sessions', chatSessionRoutes);

// Message routes
router.use('/messages', messageRoutes);

// Admin routes
router.use('/admin', adminRoutes);

// Payment routes
router.use('/payments', paymentRoutes);

export default router;
