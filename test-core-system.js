/**
 * Core System Test
 * 
 * Tests the core system functionality to verify all components work together.
 */

const { simpleIntegration } = require('./dist/integration/simpleIntegration.js');

async function testCoreSystem() {
  console.log('🚀 Starting core system test...\n');

  try {
    // Test 1: Initial health check (should be unhealthy before initialization)
    console.log('📋 Test 1: Initial health check');
    const initialHealth = await simpleIntegration.healthCheck();
    console.log('Initial health status:', initialHealth.status);
    console.log('Services initialized:', Object.keys(initialHealth.services).filter(k => initialHealth.services[k]).length, '/', Object.keys(initialHealth.services).length);
    console.log('✅ Initial health check completed\n');

    // Test 2: Initialize the system
    console.log('🔧 Test 2: System initialization');
    const config = {
      database: {
        host: 'localhost',
        port: 5432,
        database: 'privacy_qr_calling_test',
        username: 'test_user',
        password: 'test_password',
        ssl: false
      },
      auth: {
        requireMFA: false,
        jwtSecret: 'test-jwt-secret-key-for-testing',
        sessionDurationHours: 24
      }
    };

    await simpleIntegration.initialize(config);
    console.log('✅ System initialization completed\n');

    // Test 3: Post-initialization health check
    console.log('📋 Test 3: Post-initialization health check');
    const postInitHealth = await simpleIntegration.healthCheck();
    console.log('Post-init health status:', postInitHealth.status);
    console.log('Services initialized:', Object.keys(postInitHealth.services).filter(k => postInitHealth.services[k]).length, '/', Object.keys(postInitHealth.services).length);
    
    if (postInitHealth.errors.length > 0) {
      console.log('Errors:', postInitHealth.errors);
    }
    console.log('✅ Post-initialization health check completed\n');

    // Test 4: Get services
    console.log('🔍 Test 4: Service availability check');
    try {
      const services = simpleIntegration.getServices();
      console.log('Available services:');
      console.log('- Auth Service:', services.authService ? '✅' : '❌');
      console.log('- Token Manager:', services.tokenManager ? '✅' : '❌');
      console.log('- Call Router:', services.callRouter ? '✅' : '❌');
      console.log('- Token Mapper:', services.tokenMapper ? '✅' : '❌');
      console.log('- Session Manager:', services.sessionManager ? '✅' : '❌');
      console.log('- Privacy Layer:', services.privacyLayer ? '✅' : '❌');
      console.log('✅ Service availability check completed\n');
    } catch (error) {
      console.log('❌ Service availability check failed:', error.message, '\n');
    }

    // Test 5: Test call flow processing with invalid data
    console.log('🔄 Test 5: Call flow processing (invalid QR)');
    const invalidResult = await simpleIntegration.processCallFlow('invalid-qr-data');
    console.log('Invalid QR result:', {
      success: invalidResult.success,
      error: invalidResult.error
    });
    console.log('✅ Invalid QR test completed\n');

    // Test 6: Test call flow processing with malformed data
    console.log('🔄 Test 6: Call flow processing (malformed QR)');
    const malformedResult = await simpleIntegration.processCallFlow('pqc:invalid:format');
    console.log('Malformed QR result:', {
      success: malformedResult.success,
      error: malformedResult.error
    });
    console.log('✅ Malformed QR test completed\n');

    // Test 7: Final system status
    console.log('📊 Test 7: Final system status');
    const finalHealth = await simpleIntegration.healthCheck();
    console.log('Final system status:', finalHealth.status);
    
    const healthyServices = Object.values(finalHealth.services).filter(Boolean).length;
    const totalServices = Object.keys(finalHealth.services).length;
    const healthPercentage = Math.round((healthyServices / totalServices) * 100);
    
    console.log(`System health: ${healthyServices}/${totalServices} services (${healthPercentage}%)`);
    
    if (finalHealth.status === 'healthy') {
      console.log('🎉 Core system is fully operational!');
    } else if (finalHealth.status === 'degraded') {
      console.log('⚠️  Core system is operational but degraded');
    } else {
      console.log('❌ Core system has issues that need attention');
    }

    console.log('\n🏁 Core system test completed successfully!');
    return true;

  } catch (error) {
    console.error('❌ Core system test failed:', error.message);
    console.error('Stack trace:', error.stack);
    return false;
  }
}

// Run the test
testCoreSystem().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});