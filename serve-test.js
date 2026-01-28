/**
 * Simple HTTP server to serve the test interface
 * This avoids CORS issues with file:// protocol
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;

const server = http.createServer((req, res) => {
  let filePath = '';
  
  // Route requests
  if (req.url === '/' || req.url === '/index.html') {
    filePath = 'test-simple-interface.html';
  } else if (req.url === '/webrtc' || req.url === '/webrtc.html') {
    filePath = 'test-real-webrtc.html';
  } else {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('File not found');
      return;
    }
    
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`🌐 Test interface server running at http://localhost:${PORT}`);
  console.log(`📱 Simulation Interface: http://localhost:${PORT}`);
  console.log(`🎤 Real WebRTC Interface: http://localhost:${PORT}/webrtc`);
  console.log(`🔗 Backend API running at http://localhost:3000`);
});