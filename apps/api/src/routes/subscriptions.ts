import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '@frequency-tracker/database';
import { stripe, createStripeCustomer, createCheckoutSession, createCustomerPortalSession } from '../services/stripe.js';
import type Stripe from 'stripe';

const createCheckoutSchema = z.object({
  priceId: z.string(),
});

const redeemPromoSchema = z.object({
  code: z.string().min(1).max(50),
});

export const subscriptionRoutes: FastifyPluginAsync = async (fastify) => {

  // POST /api/subscriptions/create-checkout
  // Creates a Stripe Checkout session for new subscriptions
  fastify.post('/create-checkout', async (request, reply) => {
    await request.jwtVerify();
    const { userId } = request.user as { userId: string };

    try {
      const body = createCheckoutSchema.parse(request.body);

      // Get user from database
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      // Check if user already has an active subscription
      if (user.subscriptionTier === 'premium' && user.subscriptionStatus === 'active') {
        return reply.status(400).send({ error: 'You already have an active subscription' });
      }

      // Create or retrieve Stripe customer
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        customerId = await createStripeCustomer(user.email, userId);
        await prisma.user.update({
          where: { id: userId },
          data: { stripeCustomerId: customerId },
        });
      }

      // Create checkout session, handling case where customer was deleted from Stripe
      let checkoutUrl: string;
      try {
        checkoutUrl = await createCheckoutSession(customerId, body.priceId, userId);
      } catch (stripeError: any) {
        // If customer doesn't exist in Stripe, create a new one and retry
        if (stripeError.code === 'resource_missing' || stripeError.message?.includes('No such customer')) {
          fastify.log.info({ userId, oldCustomerId: customerId }, 'Stripe customer not found, creating new one');
          customerId = await createStripeCustomer(user.email, userId);
          await prisma.user.update({
            where: { id: userId },
            data: { stripeCustomerId: customerId },
          });
          checkoutUrl = await createCheckoutSession(customerId, body.priceId, userId);
        } else {
          throw stripeError;
        }
      }

      return reply.send({ url: checkoutUrl });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      fastify.log.error({ error, errorMessage }, 'Failed to create checkout session');
      return reply.status(500).send({ error: 'Failed to create checkout session', details: errorMessage });
    }
  });

  // POST /api/subscriptions/create-portal
  // Creates a Stripe Customer Portal session for managing subscriptions
  fastify.post('/create-portal', async (request, reply) => {
    await request.jwtVerify();
    const { userId } = request.user as { userId: string };

    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user || !user.stripeCustomerId) {
        return reply.status(400).send({ error: 'No subscription found' });
      }

      const portalUrl = await createCustomerPortalSession(user.stripeCustomerId);

      return reply.send({ url: portalUrl });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to create portal session' });
    }
  });

  // POST /api/subscriptions/redeem-promo
  // Redeems a promo code for free premium access
  fastify.post('/redeem-promo', async (request, reply) => {
    await request.jwtVerify();
    const { userId } = request.user as { userId: string };

    try {
      const body = redeemPromoSchema.parse(request.body);
      const code = body.code.toUpperCase().trim();

      // Find the promo code
      const promoCode = await prisma.promoCode.findUnique({
        where: { code },
      });

      if (!promoCode) {
        return reply.status(400).send({ error: 'Invalid promo code' });
      }

      // Check if code is active
      if (!promoCode.isActive) {
        return reply.status(400).send({ error: 'This promo code is no longer active' });
      }

      // Check if code has expired
      if (promoCode.expiresAt && promoCode.expiresAt < new Date()) {
        return reply.status(400).send({ error: 'This promo code has expired' });
      }

      // Check if code has reached max uses
      if (promoCode.maxUses !== null && promoCode.currentUses >= promoCode.maxUses) {
        return reply.status(400).send({ error: 'This promo code has reached its maximum number of uses' });
      }

      // Check if user has already redeemed this code
      const existingRedemption = await prisma.promoRedemption.findUnique({
        where: {
          userId_promoCodeId: {
            userId,
            promoCodeId: promoCode.id,
          },
        },
      });

      if (existingRedemption) {
        return reply.status(400).send({ error: 'You have already redeemed this promo code' });
      }

      // Calculate subscription end date
      const now = new Date();
      const expiresAt = new Date(now.getTime() + promoCode.durationDays * 24 * 60 * 60 * 1000);

      // Update user and create redemption record in a transaction
      await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: {
            subscriptionTier: 'premium',
            subscriptionStatus: 'active',
            subscriptionStartDate: now,
            subscriptionEndDate: expiresAt,
          },
        }),
        prisma.promoCode.update({
          where: { id: promoCode.id },
          data: {
            currentUses: { increment: 1 },
          },
        }),
        prisma.promoRedemption.create({
          data: {
            userId,
            promoCodeId: promoCode.id,
          },
        }),
      ]);

      fastify.log.info({ userId, code }, 'Promo code redeemed successfully');

      return reply.send({
        success: true,
        expiresAt: expiresAt.toISOString(),
        message: `Premium activated until ${expiresAt.toLocaleDateString()}`,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to redeem promo code' });
    }
  });

  // POST /api/subscriptions/webhook
  // Handles Stripe webhook events (signature verification required)
  fastify.post('/webhook', async (request, reply) => {
    const signature = request.headers['stripe-signature'];

    if (!signature) {
      return reply.status(400).send({ error: 'Missing stripe-signature header' });
    }

    try {
      // Verify webhook signature
      const stripeClient = stripe();
      const event = stripeClient.webhooks.constructEvent(
        (request as any).rawBody!,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      );

      fastify.log.info({ type: event.type }, 'Stripe webhook received');

      // Handle different event types
      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription;
          const userId = subscription.metadata.userId;

          fastify.log.info({
            userId,
            subscriptionId: subscription.id,
            metadata: subscription.metadata,
            hasMetadata: !!subscription.metadata,
            metadataKeys: Object.keys(subscription.metadata || {})
          }, 'Processing subscription event');

          if (!userId) {
            fastify.log.error({ subscription }, 'No userId found in subscription metadata');
            return reply.status(400).send({ error: 'Missing userId in subscription metadata' });
          }

          await prisma.user.update({
            where: { id: userId },
            data: {
              subscriptionTier: 'premium',
              subscriptionStatus: subscription.status,
              stripeSubscriptionId: subscription.id,
              stripePriceId: subscription.items.data[0]?.price.id,
              subscriptionStartDate: subscription.current_period_start
                ? new Date(subscription.current_period_start * 1000)
                : new Date(),
              subscriptionEndDate: subscription.cancel_at
                ? new Date(subscription.cancel_at * 1000)
                : null,
            },
          });

          fastify.log.info({ userId }, 'Successfully updated user subscription');
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          const userId = subscription.metadata.userId;

          await prisma.user.update({
            where: { id: userId },
            data: {
              subscriptionTier: 'free',
              subscriptionStatus: 'canceled',
              subscriptionEndDate: new Date(),
            },
          });
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          const customerId = invoice.customer as string;

          const user = await prisma.user.findUnique({
            where: { stripeCustomerId: customerId },
          });

          if (user) {
            await prisma.user.update({
              where: { id: user.id },
              data: { subscriptionStatus: 'past_due' },
            });
          }
          break;
        }
      }

      return reply.send({ received: true });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(400).send({ error: 'Webhook signature verification failed' });
    }
  });
};
