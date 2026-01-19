import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '@frequency-tracker/database';

const createOffTimeSchema = z.object({
  tagId: z.string().min(1).optional(),
  activityTypeId: z.string().min(1).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD date string
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),   // YYYY-MM-DD date string
}).refine(
  (data) => data.tagId || data.activityTypeId,
  { message: "Either tagId or activityTypeId must be provided" }
);

const updateOffTimeSchema = z.object({
  tagId: z.string().min(1).optional().nullable(),
  activityTypeId: z.string().min(1).optional().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const offTimeRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all off times for the authenticated user
  fastify.get('/', async (request, reply) => {
    await request.jwtVerify();

    try {
      const offTimes = await prisma.offTime.findMany({
        where: { userId: request.user.userId },
        orderBy: { startDate: 'desc' },
        include: {
          tag: true,
          activityType: true,
        },
      });
      return reply.send(offTimes);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Get off time by ID
  fastify.get('/:id', async (request, reply) => {
    await request.jwtVerify();

    try {
      const { id } = request.params as { id: string };

      const offTime = await prisma.offTime.findFirst({
        where: {
          id,
          userId: request.user.userId,
        },
        include: {
          tag: true,
          activityType: true,
        },
      });

      if (!offTime) {
        return reply.status(404).send({ error: 'Off time not found' });
      }

      return reply.send(offTime);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Create off time
  fastify.post('/', async (request, reply) => {
    await request.jwtVerify();

    try {
      const body = createOffTimeSchema.parse(request.body);

      // Validate dates - simple string comparison works for YYYY-MM-DD
      if (body.endDate < body.startDate) {
        return reply.status(400).send({ error: 'End date must be on or after start date' });
      }

      // Verify tag exists and belongs to user (if tagId provided)
      if (body.tagId) {
        const tag = await prisma.tag.findFirst({
          where: {
            id: body.tagId,
            userId: request.user.userId,
          },
        });

        if (!tag) {
          return reply.status(400).send({ error: 'Tag not found' });
        }
      }

      // Verify activity type exists and belongs to user (if activityTypeId provided)
      if (body.activityTypeId) {
        const activityType = await prisma.activityType.findFirst({
          where: {
            id: body.activityTypeId,
            userId: request.user.userId,
          },
        });

        if (!activityType) {
          return reply.status(400).send({ error: 'Activity type not found' });
        }
      }

      // Store dates as UTC midnight - this represents the calendar date
      const startDate = new Date(body.startDate + 'T00:00:00.000Z');
      const endDate = new Date(body.endDate + 'T00:00:00.000Z');

      const offTime = await prisma.offTime.create({
        data: {
          userId: request.user.userId,
          tagId: body.tagId || null,
          activityTypeId: body.activityTypeId || null,
          startDate,
          endDate,
        },
        include: {
          tag: true,
          activityType: true,
        },
      });

      return reply.status(201).send(offTime);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Update off time
  fastify.put('/:id', async (request, reply) => {
    await request.jwtVerify();

    try {
      const { id } = request.params as { id: string };
      const body = updateOffTimeSchema.parse(request.body);

      // Check if off time exists and belongs to user
      const existing = await prisma.offTime.findFirst({
        where: {
          id,
          userId: request.user.userId,
        },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Off time not found' });
      }

      // Build update data
      const updateData: any = {};

      if (body.tagId !== undefined) {
        if (body.tagId) {
          // Verify tag exists and belongs to user
          const tag = await prisma.tag.findFirst({
            where: {
              id: body.tagId,
              userId: request.user.userId,
            },
          });

          if (!tag) {
            return reply.status(400).send({ error: 'Tag not found' });
          }
        }
        updateData.tagId = body.tagId;
      }

      if (body.activityTypeId !== undefined) {
        if (body.activityTypeId) {
          // Verify activity type exists and belongs to user
          const activityType = await prisma.activityType.findFirst({
            where: {
              id: body.activityTypeId,
              userId: request.user.userId,
            },
          });

          if (!activityType) {
            return reply.status(400).send({ error: 'Activity type not found' });
          }
        }
        updateData.activityTypeId = body.activityTypeId;
      }

      if (body.startDate) {
        updateData.startDate = new Date(body.startDate + 'T00:00:00.000Z');
      }

      if (body.endDate) {
        updateData.endDate = new Date(body.endDate + 'T00:00:00.000Z');
      }

      // Validate dates - extract calendar dates for comparison
      const finalStartDate = body.startDate || existing.startDate.toISOString().split('T')[0];
      const finalEndDate = body.endDate || existing.endDate.toISOString().split('T')[0];

      if (finalEndDate < finalStartDate) {
        return reply.status(400).send({ error: 'End date must be on or after start date' });
      }

      const offTime = await prisma.offTime.update({
        where: { id },
        data: updateData,
        include: {
          tag: true,
          activityType: true,
        },
      });

      return reply.send(offTime);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Delete off time
  fastify.delete('/:id', async (request, reply) => {
    await request.jwtVerify();

    try {
      const { id } = request.params as { id: string };

      // Check if off time exists and belongs to user
      const existing = await prisma.offTime.findFirst({
        where: {
          id,
          userId: request.user.userId,
        },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Off time not found' });
      }

      await prisma.offTime.delete({
        where: { id },
      });

      return reply.status(204).send();
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
};
