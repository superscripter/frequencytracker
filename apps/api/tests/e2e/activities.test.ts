import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildServer } from '../../src/index';
import { prisma } from '@frequency-tracker/database';
import type { FastifyInstance } from 'fastify';

describe('Activities E2E Tests', () => {
  let app: FastifyInstance;
  let authToken: string;
  let userId: string;
  let activityTypeId: string;

  beforeAll(async () => {
    // Build the server
    app = await buildServer();
    await app.ready();

    // Create a test user
    const registerResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      },
    });

    const registerData = JSON.parse(registerResponse.body);
    authToken = registerData.token;
    userId = registerData.user.id;

    // Create or get a test activity type (activity types are global, not user-specific)
    const existingType = await prisma.activityType.findFirst({
      where: { name: 'Running' },
    });

    if (existingType) {
      activityTypeId = existingType.id;
    } else {
      const activityType = await prisma.activityType.create({
        data: {
          name: 'Running',
          description: 'Running activities',
        },
      });
      activityTypeId = activityType.id;
    }
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.activity.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    // Note: We don't delete activityType as it's shared across all users
    await app.close();
  });

  beforeEach(async () => {
    // Clean up activities before each test
    await prisma.activity.deleteMany({ where: { userId } });
  });

  it('should create, get, and delete an activity', async () => {
    // Step 1: Create an activity
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/activities',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
      payload: {
        typeId: activityTypeId,
        name: 'Morning Run',
        date: new Date().toISOString(),
        duration: 30,
        distance: 5.2,
        notes: 'Great run!',
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const createData = JSON.parse(createResponse.body);
    expect(createData.activity).toBeDefined();
    expect(createData.activity.name).toBe('Morning Run');
    expect(createData.activity.duration).toBe(30);
    expect(createData.activity.distance).toBe(5.2);
    expect(createData.activity.notes).toBe('Great run!');

    const activityId = createData.activity.id;

    // Step 2: Get the activity by ID
    const getResponse = await app.inject({
      method: 'GET',
      url: `/api/activities/${activityId}`,
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(getResponse.statusCode).toBe(200);
    const getData = JSON.parse(getResponse.body);
    expect(getData.activity).toBeDefined();
    expect(getData.activity.id).toBe(activityId);
    expect(getData.activity.name).toBe('Morning Run');
    expect(getData.activity.type.name).toBe('Running');

    // Step 3: Get all activities (should have 1)
    const getAllResponse = await app.inject({
      method: 'GET',
      url: '/api/activities',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(getAllResponse.statusCode).toBe(200);
    const getAllData = JSON.parse(getAllResponse.body);
    expect(getAllData.activities).toHaveLength(1);
    expect(getAllData.activities[0].id).toBe(activityId);

    // Step 4: Delete the activity
    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/activities/${activityId}`,
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(deleteResponse.statusCode).toBe(204);

    // Step 5: Verify activity is deleted (should get 404)
    const getDeletedResponse = await app.inject({
      method: 'GET',
      url: `/api/activities/${activityId}`,
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(getDeletedResponse.statusCode).toBe(404);

    // Step 6: Verify list is empty
    const getAllAfterDeleteResponse = await app.inject({
      method: 'GET',
      url: '/api/activities',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(getAllAfterDeleteResponse.statusCode).toBe(200);
    const getAllAfterDeleteData = JSON.parse(getAllAfterDeleteResponse.body);
    expect(getAllAfterDeleteData.activities).toHaveLength(0);
  });

  it('should return 401 when accessing activities without auth token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/activities',
    });

    expect(response.statusCode).toBe(401);
  });

  it('should return 404 when getting non-existent activity', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/activities/non-existent-id',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(response.statusCode).toBe(404);
  });
});
