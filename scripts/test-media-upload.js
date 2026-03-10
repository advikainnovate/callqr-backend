const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const fetch = require('node-fetch');

// Test configuration
const API_URL = process.env.API_URL || 'http://localhost:9001';
const TEST_TOKEN = process.env.TEST_TOKEN; // You'll need to provide this
const TEST_CHAT_ID = process.env.TEST_CHAT_ID; // You'll need to provide this

async function testMediaUpload() {
  if (!TEST_TOKEN || !TEST_CHAT_ID) {
    console.error('❌ Please set TEST_TOKEN and TEST_CHAT_ID environment variables');
    console.log('Example:');
    console.log('TEST_TOKEN=your-jwt-token TEST_CHAT_ID=chat-uuid node scripts/test-media-upload.js');
    process.exit(1);
  }

  console.log('🧪 Testing Media Upload API...\n');

  // Create a test image (1x1 pixel PNG)
  const testImageBuffer = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
    0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0x00,
    0xFF, 0xFF, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC, 0x33,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
  ]);

  try {
    // Test 1: Send text message
    console.log('📝 Test 1: Sending text message...');
    const textResponse = await fetch(`${API_URL}/api/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chatSessionId: TEST_CHAT_ID,
        content: 'Hello! This is a test text message.',
        messageType: 'text'
      })
    });

    const textResult = await textResponse.json();
    if (textResult.success) {
      console.log('✅ Text message sent successfully');
      console.log(`   Message ID: ${textResult.data.id}`);
    } else {
      console.log('❌ Text message failed:', textResult.message);
    }

    // Test 2: Send image message
    console.log('\n🖼️  Test 2: Sending image message...');
    const formData = new FormData();
    formData.append('chatSessionId', TEST_CHAT_ID);
    formData.append('messageType', 'image');
    formData.append('content', 'Test image upload from script');
    formData.append('images', testImageBuffer, {
      filename: 'test-image.png',
      contentType: 'image/png'
    });

    const imageResponse = await fetch(`${API_URL}/api/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    const imageResult = await imageResponse.json();
    if (imageResult.success) {
      console.log('✅ Image message sent successfully');
      console.log(`   Message ID: ${imageResult.data.id}`);
      console.log(`   Media attachments: ${imageResult.data.mediaAttachments?.length || 0}`);
      if (imageResult.data.mediaAttachments?.[0]) {
        console.log(`   Image URL: ${imageResult.data.mediaAttachments[0].secureUrl}`);
        console.log(`   Thumbnail: ${imageResult.data.mediaAttachments[0].thumbnailUrl}`);
      }
    } else {
      console.log('❌ Image message failed:', imageResult.message);
    }

    // Test 3: Get messages to verify
    console.log('\n📋 Test 3: Retrieving messages...');
    const messagesResponse = await fetch(`${API_URL}/api/messages/${TEST_CHAT_ID}?limit=5`, {
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`
      }
    });

    const messagesResult = await messagesResponse.json();
    if (messagesResult.success) {
      console.log('✅ Messages retrieved successfully');
      console.log(`   Total messages: ${messagesResult.data.messages.length}`);
      messagesResult.data.messages.forEach((msg, index) => {
        console.log(`   ${index + 1}. ${msg.messageType}: ${msg.content.substring(0, 50)}...`);
        if (msg.mediaAttachments?.length > 0) {
          console.log(`      📎 ${msg.mediaAttachments.length} attachment(s)`);
        }
      });
    } else {
      console.log('❌ Failed to retrieve messages:', messagesResult.message);
    }

    console.log('\n🎉 Media upload test completed!');

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 Make sure the server is running on', API_URL);
    }
  }
}

// Run the test
testMediaUpload();