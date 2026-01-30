import { Router } from 'express';
import { WebRTCService } from '../services/webrtc.service';

const router = Router();

// Get WebRTC configuration (ICE servers)
router.get('/config', (req, res) => {
  try {
    // Note: In a real app, you'd get the service instance
    // For now, return the configuration directly
    const iceConfig = {
      iceServers: [
        { urls: process.env.STUN_SERVER || 'stun:stun.l.google.com:19302' },
        ...(process.env.TURN_SERVER ? [{
          urls: process.env.TURN_SERVER,
          username: process.env.TURN_USERNAME,
          credential: process.env.TURN_PASSWORD
        }] : [])
      ]
    };

    res.json({
      success: true,
      data: iceConfig,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get WebRTC configuration',
    });
  }
});

export default router;
