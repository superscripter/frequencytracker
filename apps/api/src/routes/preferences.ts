import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '@frequency-tracker/database';

const updatePreferencesSchema = z.object({
  highlightOverdueActivities: z.boolean().optional(),
  showDetailedCardData: z.boolean().optional(),
  showStreakFlame: z.boolean().optional(),
});

export const preferencesRoutes: FastifyPluginAsync = async (fastify) => {
  // Get user preferences
  fastify.get('/', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      if (!request.user) {
        return reply.status(401).send({ error: 'Unauthorized - no user found' });
      }

      const { userId } = request.user as { userId: string };

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          highlightOverdueActivities: true,
          showDetailedCardData: true,
          showStreakFlame: true,
        },
      });

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      return reply.send({
        preferences: {
          highlightOverdueActivities: user.highlightOverdueActivities,
          showDetailedCardData: user.showDetailedCardData,
          showStreakFlame: user.showStreakFlame,
        },
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Update user preferences
  fastify.patch('/', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      if (!request.user) {
        return reply.status(401).send({ error: 'Unauthorized - no user found' });
      }

      const { userId } = request.user as { userId: string };

      // Validate request body
      const result = updatePreferencesSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({ error: 'Invalid request body', details: result.error });
      }

      const { highlightOverdueActivities, showDetailedCardData, showStreakFlame } = result.data;

      // Build update object with only provided fields
      const updateData: any = {};
      if (highlightOverdueActivities !== undefined) {
        updateData.highlightOverdueActivities = highlightOverdueActivities;
      }
      if (showDetailedCardData !== undefined) {
        updateData.showDetailedCardData = showDetailedCardData;
      }
      if (showStreakFlame !== undefined) {
        updateData.showStreakFlame = showStreakFlame;
      }

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          highlightOverdueActivities: true,
          showDetailedCardData: true,
          showStreakFlame: true,
        },
      });

      return reply.send({
        preferences: {
          highlightOverdueActivities: updatedUser.highlightOverdueActivities,
          showDetailedCardData: updatedUser.showDetailedCardData,
          showStreakFlame: updatedUser.showStreakFlame,
        },
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
};
