import { prisma } from '@frequency-tracker/database';

export const FREE_TIER_ACTIVITY_TYPE_LIMIT = 5;

export async function canCreateActivityType(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      subscriptionTier: true,
      _count: {
        select: { activityTypes: true },
      },
    },
  });

  if (!user) {
    return { allowed: false, reason: 'User not found' };
  }

  // Premium users have unlimited activity types
  if (user.subscriptionTier === 'premium') {
    return { allowed: true };
  }

  // Free users are limited to 5 activity types
  if (user._count.activityTypes >= FREE_TIER_ACTIVITY_TYPE_LIMIT) {
    return {
      allowed: false,
      reason: `Free tier is limited to ${FREE_TIER_ACTIVITY_TYPE_LIMIT} activity types. Upgrade to Premium for unlimited activity types.`,
    };
  }

  return { allowed: true };
}
