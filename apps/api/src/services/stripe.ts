import Stripe from 'stripe';

// Lazy initialization - only create Stripe instance when needed
let stripeInstance: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeInstance) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY environment variable is not set');
    }
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-11-20.acacia',
      typescript: true,
    });
  }
  return stripeInstance;
}

export { getStripe as stripe };

export async function createStripeCustomer(email: string, userId: string): Promise<string> {
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });
  return customer.id;
}

export async function createCheckoutSession(
  customerId: string,
  priceId: string,
  userId: string
): Promise<string> {
  const stripe = getStripe();

  console.log('[createCheckoutSession] Creating session with userId:', userId);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: `${process.env.FRONTEND_URL}/profile?subscription_success=true`,
    cancel_url: `${process.env.FRONTEND_URL}/profile?subscription_canceled=true`,
    metadata: { userId },
    subscription_data: {
      metadata: { userId }, // This ensures the subscription itself has the userId
    },
  });

  console.log('[createCheckoutSession] Session created:', session.id);

  return session.url!;
}

export async function createCustomerPortalSession(customerId: string): Promise<string> {
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.FRONTEND_URL}/profile`,
  });
  return session.url;
}
