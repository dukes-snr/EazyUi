import { Polar } from '@polar-sh/sdk';
import { validateEvent, WebhookVerificationError } from '@polar-sh/sdk/webhooks';

export type BillingProviderName = 'polar' | 'stripe' | 'none';
export type BillingCatalogProductKey = 'pro' | 'team' | 'topup_1000';

export type BillingCatalogPrice = {
    productKey: BillingCatalogProductKey;
    productId: string | null;
    priceId: string | null;
    configured: boolean;
    active: boolean;
    currency: string | null;
    unitAmount: number | null;
    type: 'one_time' | 'recurring' | null;
    interval: 'day' | 'week' | 'month' | 'year' | null;
    intervalCount: number | null;
};

let polarClient: Polar | null = null;

function resolvePolarAccessToken(): string {
    return String(process.env.POLAR_ACCESS_TOKEN || '').trim();
}

function resolvePolarWebhookSecret(): string {
    return String(process.env.POLAR_WEBHOOK_SECRET || '').trim();
}

export function isPolarConfigured(): boolean {
    return Boolean(resolvePolarAccessToken());
}

export function getPolarClient(): Polar | null {
    if (polarClient) return polarClient;
    const accessToken = resolvePolarAccessToken();
    if (!accessToken) return null;
    polarClient = new Polar({ accessToken });
    return polarClient;
}

export function resolveBillingProviderName(stripeConfigured: boolean): BillingProviderName {
    const configured = String(process.env.BILLING_PROVIDER || '').trim().toLowerCase();
    if (configured === 'polar') return 'polar';
    if (configured === 'stripe') return 'stripe';
    if (isPolarConfigured()) return 'polar';
    if (stripeConfigured) return 'stripe';
    return 'none';
}

export function resolvePolarProductId(productKey: BillingCatalogProductKey): string {
    if (productKey === 'pro') return String(process.env.POLAR_PRODUCT_PRO_ID || '').trim();
    if (productKey === 'team') return String(process.env.POLAR_PRODUCT_TEAM_ID || '').trim();
    return String(process.env.POLAR_PRODUCT_TOPUP_1000_ID || '').trim();
}

export function resolvePlanFromPolarProductId(productId: string | null | undefined): 'pro' | 'team' | null {
    const normalized = String(productId || '').trim();
    if (!normalized) return null;
    if (normalized === resolvePolarProductId('pro')) return 'pro';
    if (normalized === resolvePolarProductId('team')) return 'team';
    return null;
}

export function resolveTopupCreditsForPolarProductId(productId: string | null | undefined): number {
    const normalized = String(productId || '').trim();
    if (!normalized) return 0;
    return normalized === resolvePolarProductId('topup_1000') ? 1000 : 0;
}

function derivePolarCatalogPrice(
    productKey: BillingCatalogProductKey,
    product: any | null,
): BillingCatalogPrice {
    const productId = resolvePolarProductId(productKey) || null;
    if (!product) {
        return {
            productKey,
            productId,
            priceId: null,
            configured: Boolean(productId),
            active: false,
            currency: null,
            unitAmount: null,
            type: null,
            interval: null,
            intervalCount: null,
        };
    }

    const activePrice = Array.isArray(product.prices)
        ? product.prices.find((price: any) => !price?.isArchived && typeof price?.priceAmount === 'number')
        : null;
    const isRecurring = Boolean(product.isRecurring);

    return {
        productKey,
        productId: product.id || productId,
        priceId: activePrice?.id || null,
        configured: Boolean(productId),
        active: !product.isArchived && Boolean(activePrice),
        currency: activePrice?.priceCurrency || null,
        unitAmount: typeof activePrice?.priceAmount === 'number' ? activePrice.priceAmount : null,
        type: isRecurring ? 'recurring' : 'one_time',
        interval: isRecurring ? (product.recurringInterval || null) : null,
        intervalCount: isRecurring ? (product.recurringIntervalCount || 1) : null,
    };
}

export async function getPolarPricingCatalog(): Promise<Record<BillingCatalogProductKey, BillingCatalogPrice>> {
    const productIds: Record<BillingCatalogProductKey, string> = {
        pro: resolvePolarProductId('pro'),
        team: resolvePolarProductId('team'),
        topup_1000: resolvePolarProductId('topup_1000'),
    };

    const fallback = (productKey: BillingCatalogProductKey): BillingCatalogPrice => ({
        productKey,
        productId: productIds[productKey] || null,
        priceId: null,
        configured: Boolean(productIds[productKey]),
        active: false,
        currency: null,
        unitAmount: null,
        type: null,
        interval: null,
        intervalCount: null,
    });

    const polar = getPolarClient();
    if (!polar) {
        return {
            pro: fallback('pro'),
            team: fallback('team'),
            topup_1000: fallback('topup_1000'),
        };
    }

    const entries = await Promise.all((Object.entries(productIds) as Array<[BillingCatalogProductKey, string]>).map(async ([productKey, productId]) => {
        if (!productId) return [productKey, fallback(productKey)] as const;
        try {
            const product = await polar.products.get({ id: productId });
            return [productKey, derivePolarCatalogPrice(productKey, product)] as const;
        } catch {
            return [productKey, fallback(productKey)] as const;
        }
    }));

    return Object.fromEntries(entries) as Record<BillingCatalogProductKey, BillingCatalogPrice>;
}

export async function createPolarCheckoutSession(params: {
    productId: string;
    successUrl: string;
    cancelUrl: string;
    uid: string;
    email?: string | null;
    name?: string | null;
    ipAddress?: string | null;
    productKey: BillingCatalogProductKey;
}): Promise<any> {
    const polar = getPolarClient();
    if (!polar) {
        throw new Error('Polar is not configured. Missing POLAR_ACCESS_TOKEN.');
    }

    return polar.checkouts.create({
        products: [params.productId],
        successUrl: params.successUrl,
        returnUrl: params.cancelUrl,
        externalCustomerId: params.uid,
        customerEmail: params.email || undefined,
        customerName: params.name || params.email || params.uid,
        customerIpAddress: params.ipAddress || undefined,
        metadata: {
            uid: params.uid,
            productKey: params.productKey,
        },
    });
}

export async function createPolarCustomerPortalSession(params: {
    uid: string;
    returnUrl: string;
}): Promise<any> {
    const polar = getPolarClient();
    if (!polar) {
        throw new Error('Polar is not configured. Missing POLAR_ACCESS_TOKEN.');
    }

    return polar.customerSessions.create({
        externalCustomerId: params.uid,
        returnUrl: params.returnUrl,
    });
}

export async function retrievePolarCheckoutSession(checkoutId: string): Promise<any> {
    const polar = getPolarClient();
    if (!polar) {
        throw new Error('Polar is not configured. Missing POLAR_ACCESS_TOKEN.');
    }
    return polar.checkouts.get({ id: checkoutId });
}

export function constructPolarWebhookEvent(rawBody: Buffer, headers: Record<string, unknown>): any {
    const webhookSecret = resolvePolarWebhookSecret();
    if (!webhookSecret) {
        throw new Error('Polar webhook secret missing. Set POLAR_WEBHOOK_SECRET.');
    }
    const normalizedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers || {})) {
        if (Array.isArray(value)) {
            if (value[0] != null) normalizedHeaders[key] = String(value[0]);
            continue;
        }
        if (value != null) {
            normalizedHeaders[key] = String(value);
        }
    }
    return validateEvent(rawBody, normalizedHeaders, webhookSecret);
}

export { WebhookVerificationError };
