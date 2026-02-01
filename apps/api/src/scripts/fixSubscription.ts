import { prisma } from '@frequency-tracker/database';

/**
 * Temporary script to manually upgrade a user to premium
 * Run with: npx tsx src/scripts/fixSubscription.ts <email>
 */

async function fixSubscription() {
  const email = process.argv[2];

  if (!email) {
    console.error('Usage: npx tsx src/scripts/fixSubscription.ts <email>');
    process.exit(1);
  }

  try {
    const user = await prisma.user.update({
      where: { email },
      data: {
        subscriptionTier: 'premium',
        subscriptionStatus: 'active',
        subscriptionStartDate: new Date(),
      },
      select: {
        id: true,
        email: true,
        subscriptionTier: true,
        subscriptionStatus: true,
      },
    });

    console.log('✅ User updated successfully:');
    console.log(user);
  } catch (error) {
    console.error('❌ Error updating user:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fixSubscription();
