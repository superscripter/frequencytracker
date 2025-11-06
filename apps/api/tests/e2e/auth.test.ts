import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildServer } from '../../src/index';
import { prisma } from '@frequency-tracker/database';
import type { FastifyInstance } from 'fastify';

describe('Auth E2E Tests', () => {
  let app: FastifyInstance;
  const testEmail = 'auth-test@example.com';
  const testPassword = 'password123';
  const testName = 'Auth Test User';
  let testUserId: string;

  beforeAll(async () => {
    // Build the server
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    // Clean up all test users
    await prisma.user.deleteMany({
      where: {
        email: {
          contains: 'auth-test',
        },
      },
    });
    await app.close();
  });

  beforeEach(async () => {
    // Clean up test user before each test
    await prisma.user.deleteMany({
      where: { email: testEmail },
    });
  });

  describe('Registration', () => {
    it('should successfully register a new user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: testEmail,
          password: testPassword,
          name: testName,
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      expect(data.user).toBeDefined();
      expect(data.user.email).toBe(testEmail);
      expect(data.user.name).toBe(testName);
      expect(data.user.id).toBeDefined();
      expect(data.user.createdAt).toBeDefined();

      expect(data.token).toBeDefined();
      expect(typeof data.token).toBe('string');

      // Password should not be in response
      expect(data.user.password).toBeUndefined();

      testUserId = data.user.id;
    });

    it('should reject registration with duplicate email', async () => {
      // First registration
      await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: testEmail,
          password: testPassword,
          name: testName,
        },
      });

      // Attempt duplicate registration
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: testEmail,
          password: 'different-password',
          name: 'Different Name',
        },
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.body);
      expect(data.error).toBe('User already exists');
    });

    it('should reject registration with invalid email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'not-an-email',
          password: testPassword,
          name: testName,
        },
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.body);
      expect(data.error).toBeDefined();
    });

    it('should reject registration with short password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: testEmail,
          password: 'short',
          name: testName,
        },
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.body);
      expect(data.error).toBeDefined();
    });
  });

  describe('Login', () => {
    beforeEach(async () => {
      // Create a user to login with
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: testEmail,
          password: testPassword,
          name: testName,
        },
      });

      const registerData = JSON.parse(registerResponse.body);
      testUserId = registerData.user.id;
    });

    it('should successfully login with correct credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: testEmail,
          password: testPassword,
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      expect(data.user).toBeDefined();
      expect(data.user.email).toBe(testEmail);
      expect(data.user.name).toBe(testName);
      expect(data.user.id).toBe(testUserId);

      expect(data.token).toBeDefined();
      expect(typeof data.token).toBe('string');

      // Password should not be in response
      expect(data.user.password).toBeUndefined();
    });

    it('should reject login with incorrect password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: testEmail,
          password: 'wrong-password',
        },
      });

      expect(response.statusCode).toBe(401);
      const data = JSON.parse(response.body);
      expect(data.error).toBe('Invalid credentials');
    });

    it('should reject login with non-existent email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'nonexistent@example.com',
          password: testPassword,
        },
      });

      expect(response.statusCode).toBe(401);
      const data = JSON.parse(response.body);
      expect(data.error).toBe('Invalid credentials');
    });

    it('should reject login with invalid email format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'not-an-email',
          password: testPassword,
        },
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.body);
      expect(data.error).toBeDefined();
    });
  });

  describe('Token Verification & /me endpoint', () => {
    let authToken: string;

    beforeEach(async () => {
      // Register and get token
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: testEmail,
          password: testPassword,
          name: testName,
        },
      });

      const registerData = JSON.parse(registerResponse.body);
      authToken = registerData.token;
      testUserId = registerData.user.id;
    });

    it('should get current user with valid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      expect(data.user).toBeDefined();
      expect(data.user.email).toBe(testEmail);
      expect(data.user.name).toBe(testName);
      expect(data.user.id).toBe(testUserId);
      expect(data.user.password).toBeUndefined();
    });

    it('should reject /me request without token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
      });

      expect(response.statusCode).toBe(401);
      const data = JSON.parse(response.body);
      expect(data.error).toBe('Unauthorized');
    });

    it('should reject /me request with invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      expect(response.statusCode).toBe(401);
      const data = JSON.parse(response.body);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('Complete Registration and Login Workflow', () => {
    it('should register, login, and access protected route successfully', async () => {
      // Step 1: Register
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: testEmail,
          password: testPassword,
          name: testName,
        },
      });

      expect(registerResponse.statusCode).toBe(200);
      const registerData = JSON.parse(registerResponse.body);
      const registrationToken = registerData.token;
      testUserId = registerData.user.id;

      // Step 2: Verify we can use the registration token
      const meResponse1 = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${registrationToken}`,
        },
      });

      expect(meResponse1.statusCode).toBe(200);

      // Step 3: Login with same credentials
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: testEmail,
          password: testPassword,
        },
      });

      expect(loginResponse.statusCode).toBe(200);
      const loginData = JSON.parse(loginResponse.body);
      const loginToken = loginData.token;

      // Step 4: Verify we can use the login token
      const meResponse2 = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${loginToken}`,
        },
      });

      expect(meResponse2.statusCode).toBe(200);
      const meData = JSON.parse(meResponse2.body);

      expect(meData.user.email).toBe(testEmail);
      expect(meData.user.name).toBe(testName);
      expect(meData.user.id).toBe(testUserId);
    });
  });
});
