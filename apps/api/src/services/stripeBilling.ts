import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

function resolveStripeSecretKey(): string {
    return String(process.env.STRIPE_SECRET_KEY || '').trim();
}

export function getStripeClient(): Stripe | null {
    if (stripeClient) return stripeClient;
    const secret = resolveStripeSecretKey();
    if (!secret) return null;
    stripeClient = new Stripe(secret, {
        apiVersion: '2024-06-20',
    });
    return stripeClient;
}

export function isStripeConfigured(): boolean {
    return Boolean(resolveStripeSecretKey());
}

export function getStripePublishableKey(): string {
    return String(process.env.STRIPE_PUBLISHABLE_KEY || '').trim();
}

export async function createStripeCheckoutSession(params: {
    customerId?: string;
    mode: 'payment' | 'subscription';
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    uid: string;
    productKey: 'pro' | 'team' | 'topup_1000';
}): Promise<Stripe.Checkout.Session> {
    const stripe = getStripeClient();
    if (!stripe) {
        throw new Error('Stripe is not configured. Missing STRIPE_SECRET_KEY.');
    }
    return stripe.checkout.sessions.create({
        mode: params.mode,
        customer: params.customerId,
        line_items: [{ price: params.priceId, quantity: 1 }],
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        allow_promotion_codes: true,
        ...(params.mode === 'payment' ? { invoice_creation: { enabled: true } } : {}),
        metadata: {
            uid: params.uid,
            productKey: params.productKey,
        },
    });
}

export async function createStripeBillingPortalSession(params: {
    customerId: string;
    returnUrl: string;
}): Promise<Stripe.BillingPortal.Session> {
    const stripe = getStripeClient();
    if (!stripe) {
        throw new Error('Stripe is not configured. Missing STRIPE_SECRET_KEY.');
    }
    return stripe.billingPortal.sessions.create({
        customer: params.customerId,
        return_url: params.returnUrl,
    });
}

export function constructStripeWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const stripe = getStripeClient();
    if (!stripe) {
        throw new Error('Stripe is not configured. Missing STRIPE_SECRET_KEY.');
    }
    const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
    if (!webhookSecret) {
        throw new Error('Stripe webhook secret missing. Set STRIPE_WEBHOOK_SECRET.');
    }
    return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

export async function retrieveCheckoutSessionWithLineItems(sessionId: string): Promise<Stripe.Checkout.Session> {
    const stripe = getStripeClient();
    if (!stripe) {
        throw new Error('Stripe is not configured. Missing STRIPE_SECRET_KEY.');
    }
    return stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['line_items.data.price', 'subscription', 'invoice'],
    });
}
