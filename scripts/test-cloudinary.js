const { v2: cloudinary } = require('cloudinary');
require('dotenv').config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function testCloudinaryConnection() {
  console.log('🔍 Testing Cloudinary Connection...\n');

  // Check environment variables
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  console.log('📋 Configuration:');
  console.log(`   Cloud Name: ${cloudName ? (cloudName === 'your_cloudinary_cloud_name' ? '⚠️  Placeholder value' : '✅ Set') : '❌ Missing'}`);
  console.log(`   API Key: ${apiKey ? '✅ Set' : '❌ Missing'}`);
  console.log(`   API Secret: ${apiSecret ? '✅ Set' : '❌ Missing'}\n`);

  if (!cloudName || !apiKey || !apiSecret || cloudName === 'your_cloudinary_cloud_name') {
    console.error('❌ Invalid Cloudinary credentials in .env file');
    console.log('\n💡 Please update your .env file with actual Cloudinary credentials:');
    console.log('CLOUDINARY_CLOUD_NAME=your_actual_cloud_name  # ← Replace this');
    console.log('CLOUDINARY_API_KEY=your_actual_api_key');
    console.log('CLOUDINARY_API_SECRET=your_actual_api_secret');
    console.log('\n🔗 Get your credentials from: https://console.cloudinary.com/');
    process.exit(1);
  }

  try {
    // Test 1: Ping Cloudinary API
    console.log('🏓 Test 1: Pinging Cloudinary API...');
    const pingResult = await cloudinary.api.ping();
    
    if (pingResult.status === 'ok') {
      console.log('✅ Cloudinary API is reachable');
    } else {
      console.log('❌ Cloudinary API ping failed:', pingResult);
    }

    // Test 2: Get account usage info
    console.log('\n📊 Test 2: Getting account usage...');
    const usage = await cloudinary.api.usage();
    
    console.log('✅ Account usage retrieved:');
    console.log(`   Plan: ${usage.plan || 'Unknown'}`);
    console.log(`   Credits used: ${usage.credits?.used || 0}/${usage.credits?.limit || 'Unlimited'}`);
    console.log(`   Storage used: ${Math.round((usage.storage?.used || 0) / 1024 / 1024)} MB`);
    console.log(`   Bandwidth used: ${Math.round((usage.bandwidth?.used || 0) / 1024 / 1024)} MB`);

    // Test 3: List recent uploads (if any)
    console.log('\n📁 Test 3: Checking recent uploads...');
    const resources = await cloudinary.api.resources({
      type: 'upload',
      max_results: 5,
      prefix: 'callqr/' // Our app folder
    });

    if (resources.resources.length > 0) {
      console.log(`✅ Found ${resources.resources.length} recent uploads in callqr/ folder:`);
      resources.resources.forEach((resource, index) => {
        console.log(`   ${index + 1}. ${resource.public_id} (${resource.format}, ${Math.round(resource.bytes / 1024)} KB)`);
      });
    } else {
      console.log('ℹ️  No uploads found in callqr/ folder (this is normal for new setups)');
    }

    console.log('\n🎉 Cloudinary connection test completed successfully!');
    console.log('✅ Your media upload functionality should work properly.');

  } catch (error) {
    console.error('\n❌ Cloudinary connection test failed:');
    console.error('Error details:', error);
    
    if (error.http_code === 401) {
      console.log('\n💡 Authentication failed. Please check your API credentials.');
    } else if (error.http_code === 403) {
      console.log('\n💡 Access forbidden. Check your account permissions.');
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.log('\n💡 Network connection failed. Check your internet connection.');
    } else if (error.message && error.message.includes('cloud_name')) {
      console.log('\n💡 Invalid cloud name. Please check your CLOUDINARY_CLOUD_NAME in .env');
    }
    
    process.exit(1);
  }
}

// Run the test
testCloudinaryConnection();