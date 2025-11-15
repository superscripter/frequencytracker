import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/index';
import { FastifyInstance } from 'fastify';
import { prisma } from '@frequency-tracker/database';
import { subDays, startOfDay } from 'date-fns';

describe('Recommendations API', () => {
  let server: FastifyInstance;
  let authToken: string;
  let userId: string;
  let activityTypeId1: string;
  let activityTypeId2: string;
  let activityTypeId3: string;

  beforeAll(async () => {
    server = await buildServer();
    await server.ready();

    // Clean up test data - more thorough cleanup
    const existingUser = await prisma.user.findUnique({ where: { email: 'recommendations@test.com' } });
    if (existingUser) {
      await prisma.activity.deleteMany({ where: { userId: existingUser.id } });
      await prisma.user.delete({ where: { id: existingUser.id } });
    }

    // Clean up any existing activity types from previous test runs
    await prisma.activityType.deleteMany({
      where: {
        name: {
          in: ['Running', 'Swimming', 'Cycling'],
        },
      },
    });

    // Register a test user
    const registerResponse = await server.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'recommendations@test.com',
        password: 'password123',
        name: 'Test User',
      },
    });

    expect(registerResponse.statusCode).toBe(200);
    const registerData = JSON.parse(registerResponse.body);
    authToken = registerData.token;
    userId = registerData.user.id;

    // Create activity types
    const type1 = await prisma.activityType.create({
      data: {
        userId,
        name: 'Running',
        description: 'Running activity',
        desiredFrequency: 2.0, // Every 2 days
      },
    });
    activityTypeId1 = type1.id;

    const type2 = await prisma.activityType.create({
      data: {
        userId,
        name: 'Swimming',
        description: 'Swimming activity',
        desiredFrequency: 7.0, // Every 7 days
      },
    });
    activityTypeId2 = type2.id;

    const type3 = await prisma.activityType.create({
      data: {
        userId,
        name: 'Cycling',
        description: 'Cycling activity',
        desiredFrequency: 3.0, // Every 3 days
      },
    });
    activityTypeId3 = type3.id;

    // Create test activities
    // Use midnight of today to ensure consistent calendar day calculations
    const today = startOfDay(new Date());

    // Running: Last done 1 day ago (ahead of schedule - due in 1 day)
    await prisma.activity.create({
      data: {
        userId,
        typeId: activityTypeId1,
        name: 'Morning Run',
        date: subDays(today, 1),
      },
    });

    // Swimming: Last done 10 days ago (overdue - should have been done 3 days ago)
    await prisma.activity.create({
      data: {
        userId,
        typeId: activityTypeId2,
        name: 'Pool Swim',
        date: subDays(today, 10),
      },
    });

    // Swimming: Second activity 17 days ago
    await prisma.activity.create({
      data: {
        userId,
        typeId: activityTypeId2,
        name: 'Lake Swim',
        date: subDays(today, 17),
      },
    });

    // Cycling: No activities (should show no_data status)
  });

  afterAll(async () => {
    // Clean up
    if (userId) {
      await prisma.activity.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    const typeIdsToDelete = [activityTypeId1, activityTypeId2, activityTypeId3].filter(Boolean);
    if (typeIdsToDelete.length > 0) {
      await prisma.activityType.deleteMany({
        where: {
          id: {
            in: typeIdsToDelete,
          },
        },
      });
    }
    await prisma.$disconnect();
    await server.close();
  });

  it('should require authentication', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/recommendations',
    });

    expect(response.statusCode).toBe(401);
  });

  it('should return recommendations for all activity types', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/recommendations',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body);
    expect(data.recommendations).toBeDefined();
    expect(Array.isArray(data.recommendations)).toBe(true);
    expect(data.recommendations.length).toBe(3);
  });

  it('should calculate days since last activity correctly', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/recommendations',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    const data = JSON.parse(response.body);
    const runningRec = data.recommendations.find(
      (r: any) => r.activityType.name === 'Running'
    );
    const swimmingRec = data.recommendations.find(
      (r: any) => r.activityType.name === 'Swimming'
    );
    const cyclingRec = data.recommendations.find(
      (r: any) => r.activityType.name === 'Cycling'
    );

    expect(runningRec.daysSinceLastActivity).toBe(1);
    expect(swimmingRec.daysSinceLastActivity).toBe(10);
    expect(cyclingRec.daysSinceLastActivity).toBeNull();
  });

  it('should calculate difference correctly', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/recommendations',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    const data = JSON.parse(response.body);
    const runningRec = data.recommendations.find(
      (r: any) => r.activityType.name === 'Running'
    );
    const swimmingRec = data.recommendations.find(
      (r: any) => r.activityType.name === 'Swimming'
    );

    // Running: 1 day since last - 2 desired = -1 (ahead)
    expect(runningRec.difference).toBe(-1);

    // Swimming: 10 days since last - 7 desired = 3 (overdue)
    expect(swimmingRec.difference).toBe(3);
  });

  it('should assign correct status based on difference', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/recommendations',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    const data = JSON.parse(response.body);
    const runningRec = data.recommendations.find(
      (r: any) => r.activityType.name === 'Running'
    );
    const swimmingRec = data.recommendations.find(
      (r: any) => r.activityType.name === 'Swimming'
    );
    const cyclingRec = data.recommendations.find(
      (r: any) => r.activityType.name === 'Cycling'
    );

    // Running: difference -1, |difference| = 1, should be due_soon
    expect(runningRec.status).toBe('due_soon');

    // Swimming: difference 3, |difference| = 3, should be overdue
    expect(swimmingRec.status).toBe('overdue');

    // Cycling: no data
    expect(cyclingRec.status).toBe('no_data');
  });

  it('should calculate 30-day average frequency', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/recommendations',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    const data = JSON.parse(response.body);
    const swimmingRec = data.recommendations.find(
      (r: any) => r.activityType.name === 'Swimming'
    );

    // Swimming has 2 activities: 10 days ago and 17 days ago
    // Difference: 17 - 10 = 7 days average
    expect(swimmingRec.averageFrequency30Days).toBe(7);
  });

  it('should sort recommendations by priority (most overdue first)', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/recommendations',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    const data = JSON.parse(response.body);

    // Swimming (critically overdue) should be first
    expect(data.recommendations[0].activityType.name).toBe('Swimming');

    // Running (due today) should be in middle
    expect(data.recommendations[1].activityType.name).toBe('Running');

    // Cycling (no data) should be last
    expect(data.recommendations[2].activityType.name).toBe('Cycling');
  });

  it('should handle activity types with no activities', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/recommendations',
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    const data = JSON.parse(response.body);
    const cyclingRec = data.recommendations.find(
      (r: any) => r.activityType.name === 'Cycling'
    );

    expect(cyclingRec.daysSinceLastActivity).toBeNull();
    expect(cyclingRec.lastPerformedDate).toBeNull();
    expect(cyclingRec.difference).toBeNull();
    expect(cyclingRec.averageFrequency30Days).toBeNull();
    expect(cyclingRec.status).toBe('no_data');
  });
});
