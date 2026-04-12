import Stripe from 'stripe';
let stripeClient: Stripe | null = null;
export function getStripe(secretKey: string): Stripe {
    if (!stripeClient) {
        stripeClient = new Stripe(secretKey, {
            apiVersion: '2025-02-24.acacia',
            httpClient: Stripe.createFetchHttpClient(),
        });
    }
    return stripeClient;
}
export async function listPricesAndProducts(stripe: Stripe) {
    const prices = await stripe.prices.list({
        active: true,
        expand: ['data.product'],
    });
    return prices.data.map(price => {
        const product = price.product as Stripe.Product;
        return {
            id: price.id,
            unitAmount: price.unit_amount,
            currency: price.currency,
            recurring: price.recurring ? { interval: price.recurring.interval } : null,
            product: {
                name: product.name,
                description: product.description,
            }
        };
    });
}
export async function verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
): Promise<Stripe.Event | null> {
    try {
        const stripe = new Stripe(secret, {
            apiVersion: '2025-02-24.acacia',
            httpClient: Stripe.createFetchHttpClient(),
        });
        return await stripe.webhooks.constructEventAsync(payload, signature, secret);
    } catch (err) {
        return null;