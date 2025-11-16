import { FastifyInstance } from 'fastify';
import { prisma } from '@frequency-tracker/database';
import webpush from 'web-push';
import { z } from 'zod';

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

// Initialize VAPID configuration
function initVapid() {
  if (process.env.VAPID_SUBJECT && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
  }
}

export default async function notificationRoutes(fastify: FastifyInstance) {
  // Configure web-push with VAPID details when routes are registered
  initVapid();
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

  // Diagnostic endpoint for troubleshooting notifications
  fastify.get('/diagnostic', async (request, reply) => {
    try {
      await request.jwtVerify();
      const userId = (request.user as any).userId;

      // Get user data
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          pushSubscriptions: true,
        },
      });

      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }

      // Get server time info
      const now = new Date();
      const serverTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      // Calculate when next notification would be sent
      const userTime = user.notificationTime || '08:00';
      const [targetHour, targetMinute] = userTime.split(':').map(Number);
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      const isTimeToSend = currentHour === targetHour && Math.abs(currentMinute - targetMinute) <= 1;

      // Calculate next scheduled time
      let nextSend = new Date();
      nextSend.setHours(targetHour, targetMinute, 0, 0);
      if (nextSend <= now) {
        nextSend.setDate(nextSend.getDate() + 1);
      }

      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          timezone: user.timezone,
          notificationTime: user.notificationTime,
          enableDailyNotifications: user.enableDailyNotifications,
        },
        subscriptions: {
          count: user.pushSubscriptions.length,
          subscriptions: user.pushSubscriptions.map(sub => ({
            id: sub.id,
            endpoint: sub.endpoint.substring(0, 50) + '...',
            createdAt: sub.createdAt,
          })),
        },
        server: {
          currentTime: now.toISOString(),
          currentTimeLocal: now.toString(),
          serverTimezone,
          currentHour,
          currentMinute,
        },
        scheduling: {
          userNotificationTime: userTime,
          targetHour,
          targetMinute,
          isTimeToSendNow: isTimeToSend,
          nextScheduledSend: nextSend.toISOString(),
          nextScheduledSendLocal: nextSend.toString(),
          minutesUntilNext: Math.round((nextSend.getTime() - now.getTime()) / 60000),
        },
        issues: {
          noSubscriptions: user.pushSubscriptions.length === 0,
          notificationsDisabled: !user.enableDailyNotifications,
          vapidConfigured: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT),
        },
      };
    } catch (error) {
      console.error('Error in diagnostic endpoint:', error);
      reply.code(500).send({ error: 'Failed to get diagnostic info' });
    }
  });
}
