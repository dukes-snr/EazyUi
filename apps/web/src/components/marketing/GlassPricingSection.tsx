import { Check } from 'lucide-react';

type GlassPricingSectionProps = {
    className?: string;
    onGetStarted?: () => void;
};

const TIERS = [
    {
        plan: 'Free Plan',
        price: 'Free',
        features: [
            'Send up to 2 transfers per month',
            'Basic transaction history',
            'Email support',
            'Limited currency support (USD, EUR, GBP)',
            'Basic security features',
        ],
        emphasized: false,
    },
    {
        plan: 'Standard Plan',
        price: '$9.99/m',
        features: [
            'Unlimited transfers',
            'Transaction history with export options',
            'Priority email support',
            'Expanded currency support',
            'Advanced security features',
        ],
        emphasized: true,
    },
    {
        plan: 'Premium Plan',
        price: '$19.99/m',
        features: [
            'Unlimited transfers with priority processing',
            'Comprehensive transaction analytics',
            '24/7 priority support',
            'Full currency support',
            'Enhanced security features',
        ],
        emphasized: false,
    },
] as const;

export function GlassPricingSection({ className = '', onGetStarted }: GlassPricingSectionProps) {
    return (
        <section className={`relative ${className}`}>
            <div className="pointer-events-none absolute inset-x-0 -top-6 text-center select-none">
                <h2 className="text-[72px] md:text-[170px] leading-none tracking-[-0.05em] font-black text-white/90">Pricing</h2>
            </div>

            <div className="relative z-10 mx-auto max-w-[1180px] pt-16 md:pt-24">
                <div className="grid gap-4 md:grid-cols-3">
                    {TIERS.map((tier, index) => (
                        <article
                            key={tier.plan}
                            className="relative overflow-hidden rounded-[28px] border border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(8,10,16,0.86)_24%,rgba(6,8,12,0.98)_100%)] backdrop-blur-xl"
                        >
                            <div className="pointer-events-none absolute -top-10 left-10 h-20 w-20 rounded-full bg-white/35 blur-2xl" />
                            <div className="pointer-events-none absolute -top-10 right-10 h-20 w-20 rounded-full bg-white/30 blur-2xl" />

                            <div className="p-8 pb-6 border-b border-white/10">
                                <p className="text-[14px] text-slate-300">{tier.plan}</p>
                                <h3 className="mt-3 text-[56px] md:text-[62px] leading-none tracking-[-0.03em] font-semibold text-white">
                                    {tier.price}
                                </h3>
                            </div>

                            <ul className="px-8 py-6 space-y-4 min-h-[265px]">
                                {tier.features.map((feature) => (
                                    <li key={feature} className="text-[14px] text-slate-300 inline-flex items-center gap-3">
                                        <span className="h-8 w-8 rounded-full border border-white/14 bg-white/8 inline-flex items-center justify-center text-white/90 shrink-0">
                                            <Check size={13} />
                                        </span>
                                        {feature}
                                    </li>
                                ))}
                            </ul>

                            <div className="px-8 pb-8">
                                <button
                                    type="button"
                                    onClick={onGetStarted}
                                    className={`h-12 w-full rounded-full text-[14px] font-semibold transition-colors ${tier.emphasized
                                        ? 'bg-white text-[#070a12] hover:bg-slate-200'
                                        : 'bg-black/55 text-white border border-white/18 hover:bg-black/70'
                                        }`}
                                >
                                    Get Started
                                </button>
                            </div>

                            <div className={`pointer-events-none absolute inset-0 rounded-[28px] ${index === 1 ? 'ring-1 ring-white/28' : ''}`} />
                        </article>
                    ))}
                </div>

                <div className="mt-8 flex items-center gap-3 text-slate-300">
                    <div className="h-7 w-12 rounded-full border border-white/20 bg-white/8 p-1">
                        <div className="h-5 w-5 rounded-full bg-white" />
                    </div>
                    <span className="text-[20px] font-medium">Billed Yearly</span>
                </div>
            </div>
        </section>
    );
}
