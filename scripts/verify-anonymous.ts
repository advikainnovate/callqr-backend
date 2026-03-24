import axios from 'axios';
import { io } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';

const API_URL = 'http://localhost:3000/api';
const SOCKET_URL = 'http://localhost:3000';

// Mock data
const qrToken = '...'; // Need a valid QR token from DB
const guestId = uuidv4();

async function testAnonymousFlow() {
  console.log('--- Testing Anonymous Flow ---');

  try {
    // 1. Initiate Call as Guest
    console.log('Initiating call as guest...');
    const initiateRes = await axios.post(
      `${API_URL}/calls/initiate`,
      {
        qrToken: qrToken,
      },
      {
        headers: { 'x-guest-id': guestId },
      }
    );
    console.log('Call initiated:', initiateRes.data);

    const callId = initiateRes.data.data.callId;

    // 2. Connect to Socket as Guest
    console.log('Connecting to socket as guest...');
    const socket = io(SOCKET_URL, {
      auth: { guestId: guestId },
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      console.log('Socket connected as guest!');

      // 3. Try to send a message (should fail if blocked or not allowed)
      // This is via REST, which requires JWT, so it should fail for guest.
      console.log('Testing messaging restriction...');
      axios
        .post(
          `${API_URL}/messages`,
          {
            chatSessionId: uuidv4(), // mock
            content: 'Hello',
          },
          {
            headers: { 'x-guest-id': guestId },
          }
        )
        .catch(err => {
          console.log(
            'Messaging restricted (Expected):',
            err.response?.status,
            err.response?.data?.message
          );
        });

      socket.disconnect();
    });

    socket.on('connect_error', err => {
      console.error('Socket connection error:', err.message);
    });
  } catch (error: any) {
    console.error('Test failed:', error.response?.data || error.message);
  }
}

// Note: To run this, the server must be running and a valid QR token is needed.
// testAnonymousFlow();
