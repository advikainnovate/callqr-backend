import { Router } from 'express';
import { WebRTCService } from '../services/webrtc.service';
import { asyncHandler } from '../utils';

const router = Router();

// Get WebRTC configuration (ICE servers)
router.get(
  '/config',
  asyncHandler(async (req, res) => {
    // Note: In a real app, you'd get the service instance
    // For now, return the configuration directly
    const iceConfig = {
      iceServers: [
        { urls: process.env.STUN_SERVER || 'stun:stun.l.google.com:19302' },
        ...(process.env.TURN_SERVER
          ? [
              {
                urls: process.env.TURN_SERVER, // e.g. turn:123.45.67.89:3478?transport=udp
                username: process.env.TURN_USERNAME,
                credential: process.env.TURN_PASSWORD,
              },
            ]
          : []),
      ],
    };

    res.json({
      success: true,
      data: iceConfig,
    });
  })
);

export default router;
