import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { apiClient, type BillingCatalogPrice, type BillingCatalogResponse, type BillingCatalogProductKey, type BillingCreditPackProductKey } from '../../api/client';

type GlassPricingSectionProps = {
    className?: string;
    onGetStarted?: () => void;
    onSelectPlan?: (productKey: BillingCatalogProductKey) => void;
};

type BillingCadence = 'monthly' | 'annual';
type TierKey = 'pro' | 'team';

const FALLBACK_PRICE_CENTS: Record<TierKey, { monthly?: number; oneTime?: number; currency: string }> = {
    pro: { monthly: 2400, currency: 'USD' },
    team: { monthly: 7900, currency: 'USD' },
};

const FALLBACK_CREDIT_PACKS: Record<BillingCreditPackProductKey, { credits: number; oneTime: number; currency: string }> = {
    credits_1000: { credits: 1000, oneTime: 1000, currency: 'USD' },
    credits_5000: { credits: 5000, oneTime: 4000, currency: 'USD' },
    credits_10000: { credits: 10000, oneTime: 7000, currency: 'USD' },
};

const TIER_CONTENT: Record<TierKey, {
    title: string;
    label: string;
    description: string;
    features: string[];
    cta: string;
    featured?: boolean;
}> = {
    pro: {
        title: 'Pro',
        label: 'Best for solo builders',
        description: 'For designers and founders who need sharper first passes, faster iterations, and a stronger refinement loop.',
        features: [
            '3,000 monthly credits',
            'Voice input and inline URL references',
            'All style controls and model modes',
            'Priority support',
        ],
        cta: 'Choose Pro',
        featured: true,
    },
    team: {
        title: 'Team',
        label: 'Best for product teams',
        description: 'For teams running multiple flows at once, sharing direction, and keeping product quality high under tighter timelines.',
        features: [
            '15,000 monthly credits',
            'Shared team rollout capacity',
            'Rollover support on paid usage',
            'Faster team-wide iteration',
        ],
        cta: 'Choose Team',
    },
};

function formatMoney(amountCents: number | null, currency: string | null, options?: Intl.NumberFormatOptions): string {
    if (amountCents === null || Number.isNaN(amountCents)) return 'Contact';
    return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: (currency || 'USD').toUpperCase(),
        maximumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
        ...options,
    }).format(amountCents / 100);
}

function getFallbackDisplayPrice(productKey: TierKey, cadence: BillingCadence): {
    amount: string;
    cadenceLabel: string;
    note: string;
} {
    const fallback = FALLBACK_PRICE_CENTS[productKey];
    if (fallback.monthly) {
        if (cadence === 'annual') {
            return {
                amount: formatMoney(fallback.monthly * 12, fallback.currency),
                cadenceLabel: '/yr',
                note: `${formatMoney(fallback.monthly, fallback.currency)} per month, billed annually`,
            };
        }
        return {
            amount: formatMoney(fallback.monthly, fallback.currency),
            cadenceLabel: '/mo',
            note: 'Standard pricing',
        };
    }

    return {
        amount: formatMoney(fallback.oneTime ?? null, fallback.currency),
        cadenceLabel: '',
        note: 'Standard one-time price',
    };
}

function getDisplayPrice(productKey: TierKey, price: BillingCatalogPrice | null | undefined, cadence: BillingCadence): {
    amount: string;
    cadenceLabel: string;
    note: string;
} {
    if (!price?.configured || !price.active || price.unitAmount === null) {
        return getFallbackDisplayPrice(productKey, cadence);
    }

    if (price.type === 'recurring') {
        const monthlyAmount = price.interval === 'year' && price.intervalCount ? Math.round(price.unitAmount / (12 * price.intervalCount)) : price.unitAmount;
        const annualAmount = monthlyAmount * 12;
        if (cadence === 'annual') {
            return {
                amount: formatMoney(annualAmount, price.currency),
                cadenceLabel: '/yr',
                note: `${formatMoney(monthlyAmount, price.currency)} per month, billed annually`,
            };
        }
        return {
            amount: formatMoney(monthlyAmount, price.currency),
            cadenceLabel: '/mo',
            note: 'Live billing price',
        };
    }

    return {
        amount: formatMoney(price.unitAmount, price.currency),
        cadenceLabel: '',
        note: 'One-time purchase',
    };
}

export function GlassPricingSection({ className = '', onGetStarted, onSelectPlan }: GlassPricingSectionProps) {
    const [cadence, setCadence] = useState<BillingCadence>('monthly');
    const [catalog, setCatalog] = useState<BillingCatalogResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selectedCreditPackKey, setSelectedCreditPackKey] = useState<BillingCreditPackProductKey>('credits_5000');

    useEffect(() => {
        const controller = new AbortController();

        const loadCatalog = async () => {
            try {
                setLoading(true);
                setLoadError(null);
                const response = await apiClient.getBillingCatalog(controller.signal);
                setCatalog(response);
            } catch (error) {
                if (controller.signal.aborted) return;
                setLoadError((error as Error).message || 'Unable to load live pricing.');
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };

        void loadCatalog();
        return () => controller.abort();
    }, []);

    useEffect(() => {
        const defaultProductKey = catalog?.creditPacks.defaultProductKey;
        if (defaultProductKey) {
            setSelectedCreditPackKey(defaultProductKey);
        }
    }, [catalog?.creditPacks.defaultProductKey]);

    const tiers = useMemo(() => {
        const plans = catalog?.plans;
        return (['pro', 'team'] as const).map((key) => {
            const content = TIER_CONTENT[key];
            const price = plans?.[key].price ?? null;
            const display = getDisplayPrice(key, price, cadence);

            return {
                key,
                ...content,
                display,
            };
        });
    }, [cadence, catalog]);

    const creditPackOptions = useMemo(() => {
        if (catalog?.creditPacks.items?.length) return catalog.creditPacks.items;
        return (Object.keys(FALLBACK_CREDIT_PACKS) as BillingCreditPackProductKey[]).map((productKey) => ({
            productKey,
            label: `${FALLBACK_CREDIT_PACKS[productKey].credits.toLocaleString()} credits`,
            credits: FALLBACK_CREDIT_PACKS[productKey].credits,
            price: {
                productKey,
                priceId: null,
                configured: false,
                active: false,
                currency: FALLBACK_CREDIT_PACKS[productKey].currency,
                unitAmount: FALLBACK_CREDIT_PACKS[productKey].oneTime,
                type: 'one_time' as const,
                interval: null,
                intervalCount: null,
            },
        }));
    }, [catalog]);

    const selectedCreditPack = useMemo(() => {
        return creditPackOptions.find((item) => item.productKey === selectedCreditPackKey) || creditPackOptions[0];
    }, [creditPackOptions, selectedCreditPackKey]);

    const creditPackDisplay = useMemo(() => {
        const fallback = FALLBACK_CREDIT_PACKS[selectedCreditPack?.productKey || 'credits_5000'];
        return {
            amount: formatMoney(selectedCreditPack?.price?.unitAmount ?? fallback.oneTime, selectedCreditPack?.price?.currency ?? fallback.currency),
            cadenceLabel: '',
            note: 'One-time purchase',
        };
    }, [selectedCreditPack]);

    const handleTierAction = (productKey: BillingCatalogProductKey) => {
        onSelectPlan?.(productKey);
        if (!onSelectPlan) onGetStarted?.();
    };

    return (
        <section className={`relative ${className}`}>
            <div className="landing-page-section-inner landing-page-section-inner-full">
                <div className="overflow-hidden rounded-[28px] border border-[var(--ui-border)] bg-[var(--ui-surface-1)]">
                    <div className="relative px-5 py-8 md:px-8 md:py-10 lg:px-10">
                        <div className="pointer-events-none absolute inset-0 opacity-70">
                            <div className="absolute inset-y-0 left-1/4 hidden w-px bg-[var(--ui-border)] md:block" />
                            <div className="absolute inset-y-0 left-1/2 hidden w-px bg-[var(--ui-border)] md:block" />
                            <div className="absolute inset-y-0 right-1/4 hidden w-px bg-[var(--ui-border)] md:block" />
                        </div>

                        <div className="relative mx-auto max-w-[760px] text-center">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--ui-text-subtle)]">Pricing</p>
                            <h3 className="mt-3 text-[34px] font-semibold leading-[1.02] tracking-[-0.05em] text-[var(--ui-text)] md:text-[56px]">
                                Clean pricing for
                                <br />
                                every stage of output.
                            </h3>
                            <p className="mx-auto mt-4 max-w-[620px] text-[14px] leading-7 text-[var(--ui-text-muted)] md:text-[15px]">
                                Paid plan amounts come from the active billing provider when available. Annual totals are calculated from the current monthly billing price.
                            </p>

                            <div className="mt-7 inline-flex rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-1">
                                {(['monthly', 'annual'] as const).map((option) => (
                                    <button
                                        key={option}
                                        type="button"
                                        onClick={() => setCadence(option)}
                                        className={`min-w-[110px] rounded-full px-4 py-2 text-[13px] font-medium transition-colors ${cadence === option
                                            ? 'bg-[var(--ui-primary)] text-white shadow-[0_10px_28px_color-mix(in_srgb,var(--ui-primary)_24%,transparent)]'
                                            : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]'
                                            }`}
                                    >
                                        {option === 'monthly' ? 'Monthly' : 'Annually'}
                                    </button>
                                ))}
                            </div>

                            <div className="mt-4 min-h-6 text-[12px] text-[var(--ui-text-subtle)]">
                                {loading ? (
                                    <span className="inline-flex items-center gap-2">
                                        <Loader2 size={13} className="animate-spin" />
                                        Loading live pricing
                                    </span>
                                ) : loadError ? (
                                    <span>{loadError}</span>
                                ) : (
                                    <span>{catalog?.provider?.configured ? 'Using live billing prices where available.' : 'Showing standard pricing.'}</span>
                                )}
                            </div>
                        </div>

                        <div className="relative mt-8 overflow-hidden rounded-[24px] border border-[var(--ui-border)] bg-[var(--ui-surface-2)]">
                            <div className="grid gap-px bg-[var(--ui-border)] lg:grid-cols-3">
                                {tiers.map((tier) => (
                                    <article
                                        key={tier.key}
                                        className={`flex min-h-[34rem] flex-col bg-[var(--ui-surface-1)] p-5 md:p-6 ${tier.featured ? 'bg-[var(--ui-surface-2)]' : ''}`}
                                    >
                                        <div>
                                            <p className="text-[22px] font-semibold tracking-[-0.03em] text-[var(--ui-text)]">{tier.title}</p>
                                            <p className="mt-2 text-[12px] uppercase tracking-[0.14em] text-[var(--ui-text-subtle)]">{tier.label}</p>
                                        </div>

                                        <div className="mt-7">
                                            <div className="flex items-end gap-1.5">
                                                <h4 className="text-[40px] font-semibold leading-none tracking-[-0.05em] text-[var(--ui-text)] md:text-[46px]">{tier.display.amount}</h4>
                                                {tier.display.cadenceLabel ? <span className="pb-1 text-[13px] text-[var(--ui-text-subtle)]">{tier.display.cadenceLabel}</span> : null}
                                            </div>
                                            <p className="mt-2 text-[12px] text-[var(--ui-text-subtle)]">{tier.display.note}</p>
                                            <p className="mt-4 text-[14px] leading-7 text-[var(--ui-text-muted)]">{tier.description}</p>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => handleTierAction(tier.key)}
                                            className={`mt-6 h-11 w-full rounded-[12px] border text-[13px] font-semibold transition-colors ${tier.featured
                                                ? 'border-[var(--ui-text)] bg-[var(--ui-text)] text-[var(--ui-surface-1)] hover:opacity-90'
                                                : 'border-[var(--ui-primary)] bg-[var(--ui-surface-2)] text-[var(--ui-primary)] hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_8%,var(--ui-surface-3))]'
                                                }`}
                                        >
                                            {tier.cta}
                                        </button>

                                        <ul className="mt-7 space-y-3">
                                            {tier.features.map((feature) => (
                                                <li key={feature} className="flex items-start gap-3 text-[13px] leading-6 text-[var(--ui-text-muted)]">
                                                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] text-[var(--ui-text)]">
                                                        <Check size={11} />
                                                    </span>
                                                    <span>{feature}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </article>
                                ))}
                                <article className="flex min-h-[34rem] flex-col bg-[var(--ui-surface-1)] p-5 md:p-6">
                                    <div>
                                        <p className="text-[22px] font-semibold tracking-[-0.03em] text-[var(--ui-text)]">Credit Packs</p>
                                        <p className="mt-2 text-[12px] uppercase tracking-[0.14em] text-[var(--ui-text-subtle)]">Best for bursts and overflow</p>
                                    </div>

                                    <div className="mt-7">
                                        <div className="flex items-end gap-1.5">
                                            <h4 className="text-[40px] font-semibold leading-none tracking-[-0.05em] text-[var(--ui-text)] md:text-[46px]">{creditPackDisplay.amount}</h4>
                                        </div>
                                        <p className="mt-2 text-[12px] text-[var(--ui-text-subtle)]">{creditPackDisplay.note}</p>
                                        <p className="mt-4 text-[14px] leading-7 text-[var(--ui-text-muted)]">One-time credits that stack with your balance and work alongside any active subscription.</p>
                                    </div>

                                    <div className="mt-6 grid grid-cols-3 gap-2">
                                        {creditPackOptions.map((pack) => (
                                            <button
                                                key={pack.productKey}
                                                type="button"
                                                onClick={() => setSelectedCreditPackKey(pack.productKey)}
                                                className={`rounded-[16px] border px-3 py-3 text-left transition-colors ${
                                                    selectedCreditPack?.productKey === pack.productKey
                                                        ? 'border-[var(--ui-primary)] bg-[color:color-mix(in_srgb,var(--ui-primary)_8%,var(--ui-surface-3))]'
                                                        : 'border-[var(--ui-border)] bg-[var(--ui-surface-2)] hover:bg-[var(--ui-surface-3)]'
                                                }`}
                                            >
                                                <div className="text-[13px] font-semibold text-[var(--ui-text)]">{pack.credits.toLocaleString()}</div>
                                                <div className="mt-1 text-[11px] text-[var(--ui-text-subtle)]">credits</div>
                                            </button>
                                        ))}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => handleTierAction(selectedCreditPack?.productKey || 'credits_5000')}
                                        className="mt-6 h-11 w-full rounded-[12px] border border-[var(--ui-primary)] bg-[var(--ui-surface-2)] text-[13px] font-semibold text-[var(--ui-primary)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--ui-primary)_8%,var(--ui-surface-3))]"
                                    >
                                        Buy credits
                                    </button>

                                    <ul className="mt-7 space-y-3">
                                        {[
                                            `${selectedCreditPack?.credits?.toLocaleString() || '0'} additional credits`,
                                            'One-time purchase',
                                            'Stacks with paid plans',
                                            'Good for launches and spikes',
                                        ].map((feature) => (
                                            <li key={feature} className="flex items-start gap-3 text-[13px] leading-6 text-[var(--ui-text-muted)]">
                                                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] text-[var(--ui-text)]">
                                                    <Check size={11} />
                                                </span>
                                                <span>{feature}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </article>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
