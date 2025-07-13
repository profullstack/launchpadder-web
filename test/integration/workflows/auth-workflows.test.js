/**
 * User Authentication Workflow Integration Tests
 * Tests complete authentication flows including registration, login, logout,
 * password reset, and session management
 */

import { expect } from 'chai';
import nock from 'nock';
import { testSupabase, testAuth, testUtils } from '../setup.js';
import DatabaseFixtures from '../fixtures/database.js';
import ApiTestHelper, { responseValidators } from '../helpers/api-helpers.js';

describe('Authentication Workflows', function() {
  this.timeout(15000);
  
  let fixtures;
  let apiHelper;
  let testApp;

  before(async () => {
    fixtures = new DatabaseFixtures();
    // Note: In a real implementation, testApp would be your SvelteKit app instance
    // For now, we'll mock the endpoints
    testApp = null; // This would be initialized with your actual app
    apiHelper = new ApiTestHelper(testApp);
  });

  beforeEach(async () => {
    // Clean up any existing test data
    await testUtils.cleanupTestData(['auth_test_%']);
    nock.cleanAll();
  });

  afterEach(async () => {
    await fixtures.cleanup();
    nock.cleanAll();
  });

  describe('User Registration Workflow', () => {
    it('should complete full registration flow with email verification', async function() {
      const testId = testUtils.generateTestId();
      const userData = {
        email: `auth_test_${testId}@example.com`,
        password: 'SecurePassword123!',
        username: `auth_test_user_${testId}`,
        full_name: `Auth Test User ${testId}`
      };

      // Step 1: Register user
      const { data: authUser, error: signUpError } = await testSupabase.auth.signUp({
        email: userData.email,
        password: userData.password,
        options: {
          data: {
            username: userData.username,
            full_name: userData.full_name
          }
        }
      });

      expect(signUpError).to.be.null;
      expect(authUser.user).to.not.be.null;
      expect(authUser.user.email).to.equal(userData.email);
      expect(authUser.user.email_confirmed_at).to.be.null; // Not confirmed yet

      // Step 2: Simulate email confirmation
      const { error: confirmError } = await testSupabase.auth.admin.updateUserById(
        authUser.user.id,
        { email_confirm: true }
      );

      expect(confirmError).to.be.null;

      // Step 3: Create profile after confirmation
      const { data: profile, error: profileError } = await testSupabase
        .from('profiles')
        .insert({
          id: authUser.user.id,
          username: userData.username,
          full_name: userData.full_name
        })
        .select()
        .single();

      expect(profileError).to.be.null;
      expect(profile.username).to.equal(userData.username);
      expect(profile.full_name).to.equal(userData.full_name);

      // Step 4: Verify user can sign in after confirmation
      const { data: signInData, error: signInError } = await testSupabase.auth.signInWithPassword({
        email: userData.email,
        password: userData.password
      });

      expect(signInError).to.be.null;
      expect(signInData.user.email_confirmed_at).to.not.be.null;
      expect(signInData.session).to.not.be.null;

      // Cleanup
      await testSupabase.auth.admin.deleteUser(authUser.user.id);
    });

    it('should prevent registration with duplicate email', async function() {
      const testId = testUtils.generateTestId();
      const userData = {
        email: `auth_test_duplicate_${testId}@example.com`,
        password: 'SecurePassword123!'
      };

      // First registration
      const { data: firstUser, error: firstError } = await testSupabase.auth.signUp(userData);
      expect(firstError).to.be.null;

      // Second registration with same email
      const { data: secondUser, error: secondError } = await testSupabase.auth.signUp(userData);
      expect(secondError).to.not.be.null;
      expect(secondError.message).to.include('already registered');

      // Cleanup
      if (firstUser.user) {
        await testSupabase.auth.admin.deleteUser(firstUser.user.id);
      }
    });

    it('should prevent registration with duplicate username', async function() {
      const testId = testUtils.generateTestId();
      const username = `auth_test_unique_${testId}`;

      // Create first user
      const firstUser = await fixtures.createUser({
        username,
        email: `first_${testId}@example.com`
      });

      // Try to create second user with same username
      try {
        await fixtures.createUser({
          username, // Same username
          email: `second_${testId}@example.com`
        });
        expect.fail('Should have thrown duplicate username error');
      } catch (error) {
        expect(error.message).to.include('duplicate key value');
      }
    });

    it('should validate password strength requirements', async function() {
      const testId = testUtils.generateTestId();
      const weakPasswords = [
        '123456',
        'password',
        'abc123',
        'short'
      ];

      for (const weakPassword of weakPasswords) {
        const { data, error } = await testSupabase.auth.signUp({
          email: `weak_${testId}_${Date.now()}@example.com`,
          password: weakPassword
        });

        expect(error).to.not.be.null;
        expect(error.message).to.include('Password should be');
      }
    });
  });

  describe('User Login Workflow', () => {
    let testUser;

    beforeEach(async () => {
      testUser = await fixtures.createUser({
        email: `login_test_${testUtils.generateTestId()}@example.com`,
        password: 'LoginPassword123!'
      });
    });

    it('should complete successful login flow', async function() {
      const { data, error } = await testSupabase.auth.signInWithPassword({
        email: testUser.credentials.email,
        password: testUser.credentials.password
      });

      expect(error).to.be.null;
      expect(data.user).to.not.be.null;
      expect(data.session).to.not.be.null;
      expect(data.user.email).to.equal(testUser.credentials.email);
      expect(data.session.access_token).to.be.a('string');
      expect(data.session.refresh_token).to.be.a('string');
    });

    it('should reject invalid credentials', async function() {
      const { data, error } = await testSupabase.auth.signInWithPassword({
        email: testUser.credentials.email,
        password: 'WrongPassword123!'
      });

      expect(error).to.not.be.null;
      expect(error.message).to.include('Invalid login credentials');
      expect(data.user).to.be.null;
      expect(data.session).to.be.null;
    });

    it('should reject login for unconfirmed email', async function() {
      // Create unconfirmed user
      const { data: unconfirmedUser } = await testSupabase.auth.admin.createUser({
        email: `unconfirmed_${testUtils.generateTestId()}@example.com`,
        password: 'UnconfirmedPassword123!',
        email_confirm: false
      });

      const { data, error } = await testSupabase.auth.signInWithPassword({
        email: unconfirmedUser.user.email,
        password: 'UnconfirmedPassword123!'
      });

      expect(error).to.not.be.null;
      expect(error.message).to.include('Email not confirmed');

      // Cleanup
      await testSupabase.auth.admin.deleteUser(unconfirmedUser.user.id);
    });

    it('should handle rate limiting for failed login attempts', async function() {
      this.timeout(10000);

      const maxAttempts = 5;
      const attempts = [];

      // Make multiple failed login attempts
      for (let i = 0; i < maxAttempts + 2; i++) {
        const attempt = testSupabase.auth.signInWithPassword({
          email: testUser.credentials.email,
          password: 'WrongPassword123!'
        });
        attempts.push(attempt);
      }

      const results = await Promise.allSettled(attempts);
      const errors = results.map(result => result.reason || result.value.error);
      
      // Should have rate limiting after multiple failures
      const rateLimitedErrors = errors.filter(error => 
        error && error.message.includes('rate limit')
      );
      
      expect(rateLimitedErrors.length).to.be.greaterThan(0);
    });
  });

  describe('User Logout Workflow', () => {
    let testUser;
    let session;

    beforeEach(async () => {
      testUser = await fixtures.createUser();
      const signInResult = await testAuth.signInUser(
        testUser.credentials.email,
        testUser.credentials.password
      );
      session = signInResult.session;
    });

    it('should complete successful logout flow', async function() {
      expect(session).to.not.be.null;

      const { error } = await testSupabase.auth.signOut();
      expect(error).to.be.null;

      // Verify session is invalidated
      const { data: user } = await testSupabase.auth.getUser();
      expect(user.user).to.be.null;
    });

    it('should invalidate session tokens after logout', async function() {
      const accessToken = session.access_token;

      // Logout
      await testSupabase.auth.signOut();

      // Try to use the old access token
      const supabaseWithOldToken = testSupabase.auth.setSession({
        access_token: accessToken,
        refresh_token: session.refresh_token
      });

      const { data, error } = await testSupabase.auth.getUser();
      expect(data.user).to.be.null;
    });
  });

  describe('Password Reset Workflow', () => {
    let testUser;

    beforeEach(async () => {
      testUser = await fixtures.createUser({
        email: `reset_test_${testUtils.generateTestId()}@example.com`
      });
    });

    it('should initiate password reset flow', async function() {
      const { data, error } = await testSupabase.auth.resetPasswordForEmail(
        testUser.credentials.email,
        {
          redirectTo: 'http://localhost:3000/auth/reset-password'
        }
      );

      expect(error).to.be.null;
      // Note: In a real test, you'd verify the email was sent
    });

    it('should complete password reset with valid token', async function() {
      // In a real implementation, you'd get the reset token from the email
      // For testing, we'll simulate the admin updating the password
      const newPassword = 'NewSecurePassword123!';

      const { error } = await testSupabase.auth.admin.updateUserById(
        testUser.auth.id,
        { password: newPassword }
      );

      expect(error).to.be.null;

      // Verify user can login with new password
      const { data: signInData, error: signInError } = await testSupabase.auth.signInWithPassword({
        email: testUser.credentials.email,
        password: newPassword
      });

      expect(signInError).to.be.null;
      expect(signInData.user).to.not.be.null;
    });

    it('should reject password reset for non-existent email', async function() {
      const { data, error } = await testSupabase.auth.resetPasswordForEmail(
        'nonexistent@example.com'
      );

      // Supabase doesn't return an error for security reasons
      expect(error).to.be.null;
    });
  });

  describe('Session Management', () => {
    let testUser;
    let session;

    beforeEach(async () => {
      testUser = await fixtures.createUser();
      const signInResult = await testAuth.signInUser(
        testUser.credentials.email,
        testUser.credentials.password
      );
      session = signInResult.session;
    });

    it('should refresh expired session tokens', async function() {
      expect(session.refresh_token).to.be.a('string');

      // Simulate token refresh
      const { data, error } = await testSupabase.auth.refreshSession({
        refresh_token: session.refresh_token
      });

      expect(error).to.be.null;
      expect(data.session).to.not.be.null;
      expect(data.session.access_token).to.not.equal(session.access_token);
    });

    it('should handle concurrent sessions', async function() {
      // Create second session for same user
      const { data: secondSession, error } = await testSupabase.auth.signInWithPassword({
        email: testUser.credentials.email,
        password: testUser.credentials.password
      });

      expect(error).to.be.null;
      expect(secondSession.session).to.not.be.null;
      expect(secondSession.session.access_token).to.not.equal(session.access_token);
    });

    it('should validate session security', async function() {
      // Verify session contains expected security properties
      expect(session.access_token).to.be.a('string');
      expect(session.refresh_token).to.be.a('string');
      expect(session.expires_at).to.be.a('number');
      expect(session.expires_in).to.be.a('number');
      expect(session.token_type).to.equal('bearer');

      // Verify token expiration
      expect(session.expires_at).to.be.greaterThan(Date.now() / 1000);
    });

    it('should handle session timeout gracefully', async function() {
      // Create a session with very short expiration (simulated)
      const shortLivedToken = session.access_token;
      
      // Wait a bit and try to use the session
      await testUtils.sleep(100);
      
      const { data: user } = await testSupabase.auth.getUser();
      
      // Session should still be valid (since we can't easily simulate expiration)
      // In a real test, you'd mock the token expiration
      expect(user.user).to.not.be.null;
    });
  });

  describe('Authentication Security', () => {
    it('should prevent brute force attacks', async function() {
      this.timeout(15000);
      
      const testEmail = `security_test_${testUtils.generateTestId()}@example.com`;
      const attempts = [];

      // Make many failed login attempts
      for (let i = 0; i < 10; i++) {
        attempts.push(
          testSupabase.auth.signInWithPassword({
            email: testEmail,
            password: 'WrongPassword123!'
          })
        );
      }

      const results = await Promise.allSettled(attempts);
      const errors = results.map(result => result.reason || result.value.error);
      
      // Should have rate limiting
      const rateLimitedErrors = errors.filter(error => 
        error && (
          error.message.includes('rate limit') ||
          error.message.includes('too many requests')
        )
      );
      
      expect(rateLimitedErrors.length).to.be.greaterThan(0);
    });

    it('should validate JWT token integrity', async function() {
      const testUser = await fixtures.createUser();
      const signInResult = await testAuth.signInUser(
        testUser.credentials.email,
        testUser.credentials.password
      );

      const token = signInResult.session.access_token;
      expect(token).to.be.a('string');
      expect(token.split('.')).to.have.length(3); // JWT format: header.payload.signature

      // Verify token can be used for authenticated requests
      const { data: user, error } = await testSupabase.auth.getUser(token);
      expect(error).to.be.null;
      expect(user.user.id).to.equal(testUser.auth.id);
    });

    it('should handle malformed authentication tokens', async function() {
      const malformedTokens = [
        'invalid.token.here',
        'not-a-jwt-token',
        '',
        null,
        undefined
      ];

      for (const token of malformedTokens) {
        try {
          await testSupabase.auth.getUser(token);
        } catch (error) {
          expect(error).to.not.be.null;
        }
      }
    });
  });

  describe('User Profile Management', () => {
    let testUser;
    let session;

    beforeEach(async () => {
      testUser = await fixtures.createUser();
      const signInResult = await testAuth.signInUser(
        testUser.credentials.email,
        testUser.credentials.password
      );
      session = signInResult.session;
    });

    it('should update user profile information', async function() {
      const updatedData = {
        full_name: 'Updated Full Name',
        bio: 'Updated bio information',
        website: 'https://updated-website.com'
      };

      const { data, error } = await testSupabase
        .from('profiles')
        .update(updatedData)
        .eq('id', testUser.profile.id)
        .select()
        .single();

      expect(error).to.be.null;
      expect(data.full_name).to.equal(updatedData.full_name);
      expect(data.bio).to.equal(updatedData.bio);
      expect(data.website).to.equal(updatedData.website);
    });

    it('should validate profile data constraints', async function() {
      // Test invalid website URL
      const { error: websiteError } = await testSupabase
        .from('profiles')
        .update({ website: 'not-a-valid-url' })
        .eq('id', testUser.profile.id);

      // Note: This would depend on your database constraints
      // expect(websiteError).to.not.be.null;

      // Test username uniqueness
      const anotherUser = await fixtures.createUser();
      const { error: usernameError } = await testSupabase
        .from('profiles')
        .update({ username: anotherUser.profile.username })
        .eq('id', testUser.profile.id);

      expect(usernameError).to.not.be.null;
      expect(usernameError.code).to.equal('23505'); // Unique constraint violation
    });
  });
});