const postgres = require('postgres');
require('dotenv').config();

const sql = postgres(process.env.DATABASE_URL);

async function fixAdminPhoneVerification() {
  try {
    console.log('🔧 Fixing Admin Phone Verification\n');

    // Get admin user IDs from environment
    const adminUserIds = process.env.ADMIN_USER_IDS;
    
    if (!adminUserIds) {
      console.error('❌ No ADMIN_USER_IDS found in .env file');
      console.log('💡 Please set ADMIN_USER_IDS in your .env file with comma-separated user IDs');
      process.exit(1);
    }

    const adminIds = adminUserIds.split(',').map(id => id.trim()).filter(id => id.length > 0);
    
    if (adminIds.length === 0) {
      console.error('❌ No valid admin user IDs found');
      process.exit(1);
    }

    console.log(`📋 Found ${adminIds.length} admin user ID(s):`);
    adminIds.forEach((id, index) => {
      console.log(`   ${index + 1}. ${id}`);
    });

    console.log('\n🔍 Checking admin users...');

    // Check each admin user
    for (const adminId of adminIds) {
      try {
        const [user] = await sql`
          SELECT id, username, is_phone_verified, status 
          FROM users 
          WHERE id = ${adminId}
        `;

        if (!user) {
          console.log(`⚠️  Admin user ${adminId} not found in database`);
          continue;
        }

        console.log(`\n👤 Admin: ${user.username} (${user.id})`);
        console.log(`   Status: ${user.status}`);
        console.log(`   Phone Verified: ${user.is_phone_verified}`);

        if (user.is_phone_verified === 'true') {
          console.log(`   ✅ Already phone verified - no action needed`);
        } else {
          console.log(`   🔧 Setting phone verification to true...`);
          
          await sql`
            UPDATE users 
            SET is_phone_verified = 'true', 
                updated_at = NOW()
            WHERE id = ${adminId}
          `;
          
          console.log(`   ✅ Phone verification updated successfully`);
        }

      } catch (error) {
        console.error(`❌ Error processing admin ${adminId}:`, error.message);
      }
    }

    console.log('\n🎉 Admin phone verification fix completed!');
    console.log('\n📝 Summary:');
    console.log('   - All admin users should now be able to login');
    console.log('   - Phone verification requirement bypassed for admins');
    console.log('   - No server restart required');

  } catch (error) {
    console.error('\n❌ Error fixing admin phone verification:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Make sure PostgreSQL is running and DATABASE_URL is correct in .env');
    }
    
    process.exit(1);
  } finally {
    await sql.end();
  }
}

fixAdminPhoneVerification();