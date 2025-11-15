import { FastifyInstance } from 'fastify';
import { prisma } from '@frequency-tracker/database';
import webpush from 'web-push';
import { z } from 'zod';

// Configure web-push with VAPID details
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

const subscriptionSchema = z.object({
  endpoint: z.string(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string(),
});

export default async function notificationRoutes(fastify: FastifyInstance) {
  // Get VAPID public key
  fastify.get('/vapid-public-key', async (request, reply) => {
    return { publicKey: process.env.VAPID_PUBLIC_KEY };
  });

  // Subscribe to push notifications
  fastify.post('/subscribe', async (request, reply) => {
    try {
      await request.jwtVerify();
      const userId = (request.user as any).userId;

      const subscription = subscriptionSchema.parse(request.body);

      // Check if subscription already exists
      const existingSubscription = await prisma.pushSubscription.findUnique({
        where: { endpoint: subscription.endpoint },
      });

      if (existingSubscription) {
        // Update existing subscription
        await prisma.pushSubscription.update({
          where: { endpoint: subscription.endpoint },
          data: {
            userId,
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
          },
        });
      } else {
        // Create new subscription
        await prisma.pushSubscription.create({
          data: {
            userId,
            endpoint: subscription.endpoint,
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
          },
        });
      }

      return { success: true, message: 'Subscription saved successfully' };
    } catch (error) {
      console.error('Error saving subscription:', error);
      reply.code(500).send({ error: 'Failed to save subscription' });
    }
  });

  // Unsubscribe from push notifications
  fastify.post('/unsubscribe', async (request, reply) => {
    try {
      await request.jwtVerify();
      const userId = (request.user as any).userId;

      const { endpoint } = unsubscribeSchema.parse(request.body);

      await prisma.pushSubscription.deleteMany({
        where: {
          userId,
          endpoint,
        },
      });

      return { success: true, message: 'Unsubscribed successfully' };
    } catch (error) {
      console.error('Error unsubscribing:', error);
      reply.code(500).send({ error: 'Failed to unsubscribe' });
    }
  });

  // Send notification to specific user (internal/testing)
  fastify.post('/send-test', async (request, reply) => {
    try {
      await request.jwtVerify();
      const userId = (request.user as any).userId;

      const subscriptions = await prisma.pushSubscription.findMany({
        where: { userId },
      });

      if (subscriptions.length === 0) {
        return reply.code(404).send({ error: 'No subscriptions found for user' });
      }

      const payload = JSON.stringify({
        title: 'Test Notification',
        body: 'This is a test notification from Frequency Tracker!',
        icon: '/icon-192.png',
        data: {
          url: '/?tab=recommendations',
        },
      });

      const sendPromises = subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
              },
            },
            payload
          );
        } catch (error: any) {
          // If subscription is no longer valid, delete it
          if (error.statusCode === 410) {
            await prisma.pushSubscription.delete({
              where: { id: subscription.id },
            });
          }
          throw error;
        }
      });

      await Promise.all(sendPromises);

      return { success: true, message: `Sent test notification to ${subscriptions.length} device(s)` };
    } catch (error) {
      console.error('Error sending test notification:', error);
      reply.code(500).send({ error: 'Failed to send test notification' });
    }
  });
}
