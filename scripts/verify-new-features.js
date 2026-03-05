/**
 * Verification script for new features:
 * - Forgot Password fields
 * - Global User Blocking fields
 */

const { client } = require('../dist/db');

async function verifyNewFeatures() {
  console.log('🔍 Verifying new features in database...\n');

  try {
    // Check if new columns exist
    const columnsQuery = `
      SELECT 
        column_name, 
        data_type, 
        is_nullable,
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN (
        'reset_password_token',
        'reset_password_expires',
        'is_globally_blocked',
        'global_block_reason',
        'global_blocked_at',
        'global_blocked_by'
      )
      ORDER BY column_name;
    `;

    const columns = await client.unsafe(columnsQuery);

    console.log('📊 New Columns in users table:');
    console.log('================================');
    
    const expectedColumns = [
      'reset_password_token',
      'reset_password_expires',
      'is_globally_blocked',
      'global_block_reason',
      'global_blocked_at',
      'global_blocked_by'
    ];

    const foundColumns = columns.map(col => col.column_name);
    
    expectedColumns.forEach(colName => {
      const found = columns.find(col => col.column_name === colName);
      if (found) {
        console.log(`✅ ${colName} (${found.data_type})`);
      } else {
        console.log(`❌ ${colName} - MISSING`);
      }
    });

    console.log('\n📊 Indexes:');
    console.log('================================');

    // Check if indexes exist
    const indexesQuery = `
      SELECT 
        indexname,
        indexdef
      FROM pg_indexes 
      WHERE tablename = 'users' 
      AND indexname IN (
        'users_reset_password_token_idx',
        'users_is_globally_blocked_idx'
      )
      ORDER BY indexname;
    `;

    const indexes = await client.unsafe(indexesQuery);

    const expectedIndexes = [
      'users_reset_password_token_idx',
      'users_is_globally_blocked_idx'
    ];

    const foundIndexes = indexes.map(idx => idx.indexname);

    expectedIndexes.forEach(idxName => {
      if (foundIndexes.includes(idxName)) {
        console.log(`✅ ${idxName}`);
      } else {
        console.log(`❌ ${idxName} - MISSING`);
      }
    });

    // Summary
    console.log('\n📋 Summary:');
    console.log('================================');
    
    const missingColumns = expectedColumns.filter(col => !foundColumns.includes(col));
    const missingIndexes = expectedIndexes.filter(idx => !foundIndexes.includes(idx));

    if (missingColumns.length === 0 && missingIndexes.length === 0) {
      console.log('✅ All new features verified successfully!');
      console.log('\n🎉 Database is ready for:');
      console.log('   - Forgot Password functionality');
      console.log('   - Global User Blocking');
    } else {
      console.log('⚠️  Some features are missing:');
      if (missingColumns.length > 0) {
        console.log(`   Missing columns: ${missingColumns.join(', ')}`);
      }
      if (missingIndexes.length > 0) {
        console.log(`   Missing indexes: ${missingIndexes.join(', ')}`);
      }
      console.log('\n💡 Run migration to add missing features:');
      console.log('   npm run db:push');
      console.log('   OR');
      console.log('   psql -d your_database -f scripts/migrations/add-forgot-password-and-global-blocking.sql');
    }

    console.log('\n📚 Documentation:');
    console.log('================================');
    console.log('   - docs/FORGOT_PASSWORD_FLOW.md');
    console.log('   - docs/GLOBAL_USER_BLOCKING.md');
    console.log('   - docs/NEW_FEATURES_SUMMARY.md');
    console.log('   - API_ENDPOINTS.md (updated)');

  } catch (error) {
    console.error('❌ Error verifying features:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run verification
verifyNewFeatures();
