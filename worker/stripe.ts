import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripe(secretKey: string): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(secretKey, {
      apiVersion: "2025-08-27.basil",
      httpClient: Stripe.createFetchHttpClient(),
    });
  }
  return stripeClient;
}

export async function listPricesAndProducts(stripe: Stripe) {
  const prices = await stripe.prices.list({
    active: true,
    expand: ["data.product"],
  });
  return prices.data.map((price) => {
    const product = price.product as Stripe.Product;
    return {
      id: price.id,
      unitAmount: price.unit_amount,
      currency: price.currency,
      recurring: price.recurring ? { interval: price.recurring.interval } : null,
      product: {
        name: product.name,
        description: product.description,
      },
    };
  });
}

export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  webhookSecret: string,
  stripeSecretKey: string,
): Promise<Stripe.Event | null> {
  try {
    const stripe = getStripe(stripeSecretKey);
    return await stripe.webhooks.constructEventAsync(payload, signature, webhookSecret);
  } catch {
    return null;
  }
}

export async function getOrCreateStripeCustomer(
  stripe: Stripe,
  existingCustomerId: string | null | undefined,
  email: string,
  userId: string,
): Promise<string> {
  if (existingCustomerId) {
    return existingCustomerId;
  }
  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });
  return customer.id;
}

export async function createCheckoutSession(
  stripe: Stripe,
  params: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    trialDays?: number;
    quantity?: number;
    metadata?: Record<string, string>;
  },
): Promise<string> {
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: params.customerId,
    line_items: [
      {
        price: params.priceId,
        quantity: params.quantity ?? 1,
      },
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    subscription_data:
      params.trialDays && params.trialDays > 0
        ? { trial_period_days: params.trialDays, metadata: params.metadata }
        : { metadata: params.metadata },
    metadata: params.metadata,
  });
  if (!session.url) {
    throw new Error("Stripe Checkout session missing URL");
  }
  return session.url;
}

export async function createPortalSession(
  stripe: Stripe,
  customerId: string,
  returnUrl: string,
): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return session.url;
}

export const WEBHOOK_EVENTS = {
  CHECKOUT_COMPLETED: "checkout.session.completed",
  SUBSCRIPTION_UPDATED: "customer.subscription.updated",
  SUBSCRIPTION_DELETED: "customer.subscription.deleted",
  INVOICE_PAYMENT_FAILED: "invoice.payment_failed",
  INVOICE_PAYMENT_SUCCEEDED: "invoice.payment_succeeded",
} as const;
