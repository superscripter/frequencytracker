import cron from 'node-cron';
import { prisma } from '@frequency-tracker/database';
import webpush from 'web-push';
import { startOfDay, endOfDay } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

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

interface Recommendation {
  id: string;
  name: string;
  status: string;
  priorityScore: number;
  daysSinceLastActivity: number | null;
}

async function getUserRecommendations(userId: string, userTimezone: string): Promise<Recommendation[]> {
  // Get all activity types for the user
  const activityTypes = await prisma.activityType.findMany({
    where: { userId },
    include: {
      activities: {
        orderBy: { date: 'desc' },
      },
    },
  });

  const now = toZonedTime(new Date(), userTimezone);
  const startOfToday = startOfDay(now);

  const recommendations: Recommendation[] = [];

  for (const activityType of activityTypes) {
    // Get the most recent activity for this type
    const mostRecentActivity = activityType.activities[0];

    // Calculate days since last activity
    let daysSinceLastActivity: number | null = null;
    if (mostRecentActivity) {
      const activityDate = toZonedTime(mostRecentActivity.date, userTimezone);
      const daysDiff = Math.floor(
        (startOfToday.getTime() - startOfDay(activityDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      daysSinceLastActivity = daysDiff;
    }

    // Calculate expected frequency in days
    const expectedFrequencyDays = 7 / activityType.desiredFrequency;

    // Calculate how overdue the activity is
    const daysOverdue = daysSinceLastActivity !== null
      ? daysSinceLastActivity - expectedFrequencyDays
      : 999; // If never done, treat as very overdue

    // Determine status
    let status = 'ahead';
    if (daysOverdue >= 2) {
      status = 'critically_overdue';
    } else if (daysOverdue >= 1) {
      status = 'overdue';
    } else if (daysOverdue >= 0) {
      status = 'due_today';
    } else if (daysOverdue >= -1) {
      status = 'due_soon';
    }

    // Calculate priority score (higher = more urgent)
    const priorityScore = daysSinceLastActivity !== null
      ? daysSinceLastActivity / expectedFrequencyDays
      : 10; // High priority if never done

    recommendations.push({
      id: activityType.id,
      name: activityType.name,
      status,
      priorityScore,
      daysSinceLastActivity,
    });
  }

  // Sort by priority (most urgent first)
  return recommendations.sort((a, b) => b.priorityScore - a.priorityScore);
}

async function sendDailyNotifications() {
  console.log('[Notification Scheduler] Starting daily notification send...');

  try {
    // Get the current time in server timezone
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Get all users with push subscriptions and notifications enabled
    const usersWithSubscriptions = await prisma.user.findMany({
      where: {
        enableDailyNotifications: true,
        pushSubscriptions: {
          some: {},
        },
      },
      include: {
        pushSubscriptions: true,
      },
    });

    console.log(`[Notification Scheduler] Found ${usersWithSubscriptions.length} users with notifications enabled`);

    for (const user of usersWithSubscriptions) {
      try {
        // Send to all users when cron runs (6:00 AM Denver time)
        const userTimezone = user.timezone || 'America/Denver';
        const recommendations = await getUserRecommendations(user.id, userTimezone);

        // Filter for urgent recommendations (due today, overdue, critically overdue)
        const urgentRecommendations = recommendations.filter(
          (rec) => rec.status === 'due_today' || rec.status === 'overdue' || rec.status === 'critically_overdue'
        );

        if (urgentRecommendations.length === 0) {
          console.log(`[Notification Scheduler] No urgent recommendations for user ${user.id}`);
          continue;
        }

        // Create notification message
        const topRecommendations = urgentRecommendations.slice(0, 3);
        let body = '';

        if (topRecommendations.length === 1) {
          body = `Time for: ${topRecommendations[0].name}`;
        } else if (topRecommendations.length === 2) {
          body = `Time for: ${topRecommendations[0].name} and ${topRecommendations[1].name}`;
        } else {
          body = `Time for: ${topRecommendations[0].name}, ${topRecommendations[1].name}, and ${topRecommendations.length - 2} more`;
        }

        const payload = JSON.stringify({
          title: `Good morning${user.name ? ', ' + user.name : ''}! 🌅`,
          body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: 'daily-recommendations',
          requireInteraction: false,
          data: {
            url: '/?tab=recommendations',
          },
        });

        // Send to all user's subscriptions
        const sendPromises = user.pushSubscriptions.map(async (subscription) => {
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
            console.log(`[Notification Scheduler] Sent notification to user ${user.id}`);
          } catch (error: any) {
            console.error(`[Notification Scheduler] Error sending to subscription ${subscription.id}:`, error);

            // If subscription is no longer valid (HTTP 410), delete it
            if (error.statusCode === 410) {
              await prisma.pushSubscription.delete({
                where: { id: subscription.id },
              });
              console.log(`[Notification Scheduler] Deleted invalid subscription ${subscription.id}`);
            }
          }
        });

        await Promise.all(sendPromises);
      } catch (error) {
        console.error(`[Notification Scheduler] Error processing user ${user.id}:`, error);
      }
    }

    console.log('[Notification Scheduler] Daily notification send complete');
  } catch (error) {
    console.error('[Notification Scheduler] Error in sendDailyNotifications:', error);
  }
}

// Initialize the scheduler
export function initializeNotificationScheduler() {
  // Initialize VAPID configuration
  initVapid();

  // Schedule notifications to run every minute
  // This checks each minute if it's time to send notifications to any users based on their preferences
  const cronSchedule = process.env.NOTIFICATION_CRON_SCHEDULE || '* * * * *'; // Every minute

  console.log(`[Notification Scheduler] Scheduling notification checks with cron: ${cronSchedule}`);

  cron.schedule(cronSchedule, sendDailyNotifications, {
    timezone: 'America/New_York', // Server timezone for cron scheduling
  });

  console.log('[Notification Scheduler] Scheduler initialized');

  // For testing: Send immediately if in development and SEND_TEST_NOTIFICATION is set
  if (process.env.NODE_ENV !== 'production' && process.env.SEND_TEST_NOTIFICATION === 'true') {
    console.log('[Notification Scheduler] Sending test notification immediately...');
    setTimeout(sendDailyNotifications, 5000); // Send after 5 seconds
  }
}

// Export for manual testing
export { sendDailyNotifications };
