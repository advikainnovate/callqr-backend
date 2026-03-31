import { userService } from '../src/services/user.service';
import { db } from '../src/db';
import { users } from '../src/models';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

async function runTest() {
  const testUsername = 'TestUser' + Math.floor(Math.random() * 1000);
  const testEmail = `test${Math.floor(Math.random() * 1000)}@example.com`;
  const testPassword = 'Password123!';

  console.log('--- Auth Fix Verification ---');

  try {
    // 1. Create a test user
    console.log(`Creating test user: ${testUsername} / ${testEmail}`);
    const user = await userService.createUser({
      username: testUsername,
      email: testEmail,
      password: testPassword,
      status: 'active',
    });

    // Force set phone verified for testing
    await db
      .update(users)
      .set({ isPhoneVerified: 'true' })
      .where(eq(users.id, user.id));

    console.log('User created successfully.');

    // 2. Test Scenario 1: Login with Email
    console.log('\nScenario 1: Testing login with email...');
    const authByEmail = await userService.authenticateUser(
      testEmail,
      testPassword
    );
    if (authByEmail.id === user.id) {
      console.log('✅ Scenario 1 Success: Login with email works.');
    } else {
      console.log('❌ Scenario 1 Failure: User ID mismatch.');
    }

    // 3. Test Scenario 1b: Login with email (different casing - should work if lowered before hashing)
    console.log('Scenario 1b: Testing login with email (uppercase)...');
    const authByEmailUpper = await userService.authenticateUser(
      testEmail.toUpperCase(),
      testPassword
    );
    if (authByEmailUpper.id === user.id) {
      console.log(
        '✅ Scenario 1b Success: Case-insensitive email login works.'
      );
    }

    // 4. Test Scenario 2: Login with Username (Incorrect Casing)
    console.log(
      '\nScenario 2: Testing login with username (incorrect casing)...'
    );
    const wrongCasing =
      testUsername.toLowerCase() === testUsername
        ? testUsername.toUpperCase()
        : testUsername.toLowerCase();
    console.log(`Actual: ${testUsername}, Trying: ${wrongCasing}`);

    const authByUsernameWrongCase = await userService.authenticateUser(
      wrongCasing,
      testPassword
    );
    if (authByUsernameWrongCase.id === user.id) {
      console.log(
        '✅ Scenario 2 Success: Case-insensitive username login works.'
      );
    } else {
      console.log('❌ Scenario 2 Failure: User ID mismatch.');
    }

    // 5. Test Genetic Error Message (User not found)
    console.log('\nTesting generic error message for invalid user...');
    try {
      await userService.authenticateUser('nonexistentuser', testPassword);
      console.log('❌ Failure: Should have thrown an error');
    } catch (error: any) {
      if (error.message === 'Invalid credentials') {
        console.log(
          '✅ Success: Generic "Invalid credentials" error returned.'
        );
      } else {
        console.log(`❌ Failure: Unexpected error message: ${error.message}`);
      }
    }

    // 6. Test Genetic Error Message (Invalid password)
    console.log('Testing generic error message for invalid password...');
    try {
      await userService.authenticateUser(testUsername, 'WrongPassword!');
      console.log('❌ Failure: Should have thrown an error');
    } catch (error: any) {
      if (error.message === 'Invalid credentials') {
        console.log(
          '✅ Success: Generic "Invalid credentials" error returned.'
        );
      } else {
        console.log(`❌ Failure: Unexpected error message: ${error.message}`);
      }
    }

    // Cleanup
    console.log('\nCleaning up test user...');
    await db.delete(users).where(eq(users.id, user.id));
    console.log('Done.');
  } catch (error) {
    console.error('Test failed with error:', error);
  } finally {
    process.exit(0);
  }
}

runTest();
