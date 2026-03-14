import Stripe from 'stripe';

let stripeClient: Stripe | null = null;
export type BillingCatalogProductKey = 'pro' | 'team' | 'topup_1000';

export type BillingCatalogPrice = {
    productKey: BillingCatalogProductKey;
    priceId: string | null;
    configured: boolean;
    active: boolean;
    currency: string | null;
    unitAmount: number | null;
    type: 'one_time' | 'recurring' | null;
    interval: 'day' | 'week' | 'month' | 'year' | null;
    intervalCount: number | null;
};

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

export async function getStripePricingCatalog(): Promise<Record<BillingCatalogProductKey, BillingCatalogPrice>> {
    const configuredPriceIds: Record<BillingCatalogProductKey, string> = {
        pro: String(process.env.STRIPE_PRICE_PRO_MONTHLY || '').trim(),
        team: String(process.env.STRIPE_PRICE_TEAM_MONTHLY || '').trim(),
        topup_1000: String(process.env.STRIPE_PRICE_TOPUP_1000 || '').trim(),
    };

    const fallback = (productKey: BillingCatalogProductKey): BillingCatalogPrice => ({
        productKey,
        priceId: configuredPriceIds[productKey] || null,
        configured: Boolean(configuredPriceIds[productKey]),
        active: false,
        currency: null,
        unitAmount: null,
        type: null,
        interval: null,
        intervalCount: null,
    });

    const stripe = getStripeClient();
    if (!stripe) {
        return {
            pro: fallback('pro'),
            team: fallback('team'),
            topup_1000: fallback('topup_1000'),
        };
    }

    const entries = await Promise.all((Object.entries(configuredPriceIds) as Array<[BillingCatalogProductKey, string]>).map(async ([productKey, priceId]) => {
        if (!priceId) return [productKey, fallback(productKey)] as const;
        try {
            const price = await stripe.prices.retrieve(priceId);
            return [productKey, {
                productKey,
                priceId,
                configured: true,
                active: Boolean(price.active),
                currency: price.currency || null,
                unitAmount: price.unit_amount ?? null,
                type: price.type === 'recurring' ? 'recurring' : 'one_time',
                interval: price.recurring?.interval ?? null,
                intervalCount: price.recurring?.interval_count ?? null,
            }] as const;
        } catch {
            return [productKey, fallback(productKey)] as const;
        }
    }));

    return Object.fromEntries(entries) as Record<BillingCatalogProductKey, BillingCatalogPrice>;
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
