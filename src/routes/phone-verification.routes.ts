import { Router } from 'express';
import { phoneVerificationController } from '../controllers/phone-verification.controller';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = Router();

// All phone verification routes require authentication
router.post(
  '/send-phone-verification',
  authenticateToken,
  phoneVerificationController.sendPhoneVerificationOTP.bind(
    phoneVerificationController
  )
);

router.post(
  '/verify-phone',
  authenticateToken,
  phoneVerificationController.verifyPhone.bind(phoneVerificationController)
);

router.post(
  '/resend-phone-verification',
  authenticateToken,
  phoneVerificationController.resendPhoneVerificationOTP.bind(
    phoneVerificationController
  )
);

// Exotel Webhook for Missed Call Verification (Public route, no auth required)
router.post(
  '/exotel-webhook',
  phoneVerificationController.handleExotelWebhook.bind(
    phoneVerificationController
  )
);

router.get(
  '/phone-verification-status',
  authenticateToken,
  phoneVerificationController.getPhoneVerificationStatus.bind(
    phoneVerificationController
  )
);

export default router;
