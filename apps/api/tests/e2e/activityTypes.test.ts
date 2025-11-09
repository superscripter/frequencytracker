import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/index';
import { prisma } from '@frequency-tracker/database';
import type { FastifyInstance } from 'fastify';

describe('Activity Types E2E Tests', () => {
  let app: FastifyInstance;
  let authToken: string;
  let userId: string;
  let activityTypeId: string;

  beforeAll(async () => {
    app = await buildServer();

    // Create a test user and get auth token
    const registerResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: `test-activity-types-${Date.now()}@example.com`,
        password: 'password123',
        name: 'Activity Types Test User',
      },
    });

    const registerData = JSON.parse(registerResponse.body);
    authToken = registerData.token;
    userId = registerData.user.id;
  });

  afterAll(async () => {
    // Clean up test data
    if (activityTypeId) {
      await prisma.activityType.delete({ where: { id: activityTypeId } }).catch(() => {});
    }
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await app.close();
  });

  describe('POST /api/activity-types', () => {
    it('should create a new activity type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/activity-types',
        payload: {
          name: `Test Activity ${Date.now()}`,
          description: 'A test activity type',
          desiredFrequency: 3,
        },
      });

      expect(response.statusCode).toBe(201);
      const data = JSON.parse(response.body);
      expect(data).toHaveProperty('id');
      expect(data.name).toContain('Test Activity');
      expect(data.description).toBe('A test activity type');
      expect(data.desiredFrequency).toBe(3);

      activityTypeId = data.id;
    });

    it('should reject duplicate activity type names', async () => {
      const uniqueName = `Duplicate Test ${Date.now()}`;

      // Create first activity type
      await app.inject({
        method: 'POST',
        url: '/api/activity-types',
        payload: {
          name: uniqueName,
          description: 'First one',
          desiredFrequency: 2,
        },
      });

      // Try to create duplicate
      const response = await app.inject({
        method: 'POST',
        url: '/api/activity-types',
        payload: {
          name: uniqueName,
          description: 'Second one',
          desiredFrequency: 3,
        },
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.body);
      expect(data.error).toContain('already exists');

      // Clean up
      const cleanup = await prisma.activityType.findUnique({ where: { name: uniqueName } });
      if (cleanup) {
        await prisma.activityType.delete({ where: { id: cleanup.id } });
      }
    });

    it('should reject invalid data', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/activity-types',
        payload: {
          name: '',
          desiredFrequency: -1,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should use default frequency if not provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/activity-types',
        payload: {
          name: `Default Freq Test ${Date.now()}`,
          description: 'Testing default frequency',
          desiredFrequency: 1,
        },
      });

      expect(response.statusCode).toBe(201);
      const data = JSON.parse(response.body);
      expect(data.desiredFrequency).toBe(1);

      // Clean up
      await prisma.activityType.delete({ where: { id: data.id } });
    });
  });

  describe('GET /api/activity-types', () => {
    it('should get all activity types', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/activity-types',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    });

    it('should return activity types ordered by name', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/activity-types',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);

      for (let i = 1; i < data.length; i++) {
        expect(data[i].name.localeCompare(data[i - 1].name)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('GET /api/activity-types/:id', () => {
    it('should get a specific activity type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/activity-types/${activityTypeId}`,
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.id).toBe(activityTypeId);
      expect(data).toHaveProperty('_count');
      expect(data._count).toHaveProperty('activities');
    });

    it('should return 404 for non-existent activity type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/activity-types/nonexistent-id',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /api/activity-types/:id', () => {
    it('should update an activity type', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/activity-types/${activityTypeId}`,
        payload: {
          description: 'Updated description',
          desiredFrequency: 5,
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.description).toBe('Updated description');
      expect(data.desiredFrequency).toBe(5);
    });

    it('should update activity type name', async () => {
      const newName = `Updated Name ${Date.now()}`;
      const response = await app.inject({
        method: 'PUT',
        url: `/api/activity-types/${activityTypeId}`,
        payload: {
          name: newName,
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.name).toBe(newName);
    });

    it('should reject duplicate names when updating', async () => {
      const existingName = `Existing ${Date.now()}`;
      const newName = `ToUpdate ${Date.now()}`;

      // Create two activity types
      const existing = await app.inject({
        method: 'POST',
        url: '/api/activity-types',
        payload: {
          name: existingName,
          desiredFrequency: 2,
        },
      });
      const existingData = JSON.parse(existing.body);

      const toUpdate = await app.inject({
        method: 'POST',
        url: '/api/activity-types',
        payload: {
          name: newName,
          desiredFrequency: 3,
        },
      });
      const toUpdateData = JSON.parse(toUpdate.body);

      // Try to update second one with first one's name
      const response = await app.inject({
        method: 'PUT',
        url: `/api/activity-types/${toUpdateData.id}`,
        payload: {
          name: existingName,
        },
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.body);
      expect(data.error).toContain('already exists');

      // Clean up
      await prisma.activityType.delete({ where: { id: existingData.id } });
      await prisma.activityType.delete({ where: { id: toUpdateData.id } });
    });

    it('should return 404 for non-existent activity type', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/activity-types/nonexistent-id',
        payload: {
          desiredFrequency: 4,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/activity-types/:id', () => {
    it('should delete an activity type without activities', async () => {
      // Create a new activity type to delete
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/activity-types',
        payload: {
          name: `To Delete ${Date.now()}`,
          desiredFrequency: 1,
        },
      });
      const createData = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/activity-types/${createData.id}`,
      });

      expect(response.statusCode).toBe(204);

      // Verify it's deleted
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/activity-types/${createData.id}`,
      });
      expect(getResponse.statusCode).toBe(404);
    });

    it('should not delete activity type with associated activities', async () => {
      // Create activity type
      const typeResponse = await app.inject({
        method: 'POST',
        url: '/api/activity-types',
        payload: {
          name: `With Activities ${Date.now()}`,
          desiredFrequency: 2,
        },
      });
      const typeData = JSON.parse(typeResponse.body);

      // Create an activity using this type
      await prisma.activity.create({
        data: {
          userId,
          typeId: typeData.id,
          name: 'Test Activity',
          date: new Date(),
        },
      });

      // Try to delete the type
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/activity-types/${typeData.id}`,
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.body);
      expect(data.error).toContain('associated activities');

      // Clean up
      await prisma.activity.deleteMany({ where: { typeId: typeData.id } });
      await prisma.activityType.delete({ where: { id: typeData.id } });
    });

    it('should return 404 for non-existent activity type', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/activity-types/nonexistent-id',
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
