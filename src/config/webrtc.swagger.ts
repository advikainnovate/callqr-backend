/**
 * @swagger
 * components:
 *   schemas:
 *     WebRTCSignal:
 *       type: object
 *       properties:
 *         type:
 *           type: string
 *           enum: [offer, answer, ice-candidate]
 *           description: Type of WebRTC signal
 *         callId:
 *           type: string
 *           description: Unique identifier for the call
 *         targetUserId:
 *           type: string
 *           description: ID of the user to receive the signal
 *         data:
 *           type: object
 *           description: WebRTC signal data (SDP or ICE candidate)
 *     
 *     IncomingCall:
 *       type: object
 *       properties:
 *         callId:
 *           type: string
 *         callerId:
 *           type: string
 *         callType:
 *           type: string
 *           enum: [audio, video]
 *     
 *     CallAccepted:
 *       type: object
 *       properties:
 *         callId:
 *           type: string
 *         receiverId:
 *           type: string
 *     
 *     CallRejected:
 *       type: object
 *       properties:
 *         callId:
 *           type: string
 *         receiverId:
 *           type: string
 *     
 *     CallEnded:
 *       type: object
 *       properties:
 *         callId:
 *           type: string
 *         endedBy:
 *           type: string
 */

/**
 * @swagger
 * tags:
 *   - name: WebRTC
 *     description: WebRTC signaling and configuration
 */

/**
 * @swagger
 * /webrtc/config:
 *   get:
 *     summary: Get WebRTC configuration
 *     tags: [WebRTC]
 *     responses:
 *       200:
 *         description: WebRTC ICE configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     iceServers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           urls:
 *                             type: string
 *                           username:
 *                             type: string
 *                           credential:
 *                             type: string
 */

/**
 * @swagger
 *   Socket.IO Events:
 *     webrtc-signal:
 *       description: Send WebRTC signaling data (offer, answer, ICE candidates)
 *       payload:
 *         $ref: '#/components/schemas/WebRTCSignal'
 *     
 *     initiate-call:
 *       description: Initiate a call to another user
 *       payload:
 *         type: object
 *         properties:
 *           callId:
 *             type: string
 *     
 *     accept-call:
 *       description: Accept an incoming call
 *       payload:
 *         type: object
 *         properties:
 *           callId:
 *             type: string
 *     
 *     reject-call:
 *       description: Reject an incoming call
 *       payload:
 *         type: object
 *         properties:
 *           callId:
 *             type: string
 *     
 *     end-call:
 *       description: End an active call
 *       payload:
 *         type: object
 *         properties:
 *           callId:
 *             type: string
 *     
 *     incoming-call:
 *       description: Receive notification of incoming call
 *       payload:
 *         $ref: '#/components/schemas/IncomingCall'
 *     
 *     call-accepted:
 *       description: Notification that call was accepted by receiver
 *       payload:
 *         $ref: '#/components/schemas/CallAccepted'
 *     
 *     call-rejected:
 *       description: Notification that call was rejected by receiver
 *       payload:
 *         $ref: '#/components/schemas/CallRejected'
 *     
 *     call-ended:
 *       description: Notification that call was ended
 *       payload:
 *         $ref: '#/components/schemas/CallEnded'
 *     
 *     call-connected:
 *       description: Notification that call is successfully connected
 *       payload:
 *         type: object
 *         properties:
 *           callId:
 *             type: string
 *     
 *     error:
 *       description: Error event for failed operations
 *       payload:
 *         type: object
 *         properties:
 *           message:
 *             type: string
 *           code:
 *             type: string
 */

export {};
