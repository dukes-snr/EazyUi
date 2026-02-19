import { useState } from 'react';
import { Boxes, ChevronDown, Globe, Shield, Sparkles, Zap } from 'lucide-react';
import { MarketingHeader } from './MarketingHeader';
import { GlassPricingSection } from './GlassPricingSection';
import appLogo from '../../assets/Ui-logo.png';

type PricingPageProps = {
    onNavigate: (path: string) => void;
    onOpenApp: () => void;
};

const TRUST_BADGES = [
    { label: 'Secure infra', icon: Shield },
    { label: 'Fast rendering', icon: Zap },
    { label: 'Global access', icon: Globe },
    { label: 'AI optimized', icon: Sparkles },
    { label: 'Component-ready', icon: Boxes },
] as const;

const FAQ_ITEMS = [
    {
        q: 'Is there a free trial available?',
        a: 'Yes. You can start with the free tier and upgrade anytime. Paid plans also include a 14-day refund window for first-time upgrades.',
    },
    {
        q: 'Can I change my plan later?',
        a: 'Yes. Upgrade or downgrade at any time. Changes are prorated automatically in your next billing cycle.',
    },
    {
        q: 'What is your cancellation policy?',
        a: 'You can cancel whenever you want. Your plan remains active until the end of the current billing period.',
    },
    {
        q: 'Can billing details be added to an invoice?',
        a: 'Yes. Add company name, tax ID, and billing address in workspace billing settings before invoice generation.',
    },
    {
        q: 'How does billing work?',
        a: 'Billing is monthly or yearly based on your selected cadence. Team seats and overages are reflected on the same invoice.',
    },
    {
        q: 'How do I change my account email?',
        a: 'From account settings, update your login email and confirm via verification link.',
    },
] as const;

export function PricingPage({ onNavigate, onOpenApp }: PricingPageProps) {
    const [openFaq, setOpenFaq] = useState<number>(0);

    return (
        <div className="h-screen w-screen overflow-y-auto bg-[#050608] text-white">
            <div className="pointer-events-none fixed inset-0">
                <div className="absolute inset-0 bg-[radial-gradient(55%_45%_at_50%_-10%,rgba(255,255,255,0.18),rgba(5,6,8,0)_66%),linear-gradient(180deg,#050608_0%,#040507_100%)]" />
            </div>

            <MarketingHeader onNavigate={onNavigate} onOpenApp={onOpenApp} />

            <main className="relative z-10 px-4 md:px-6 pt-8 pb-24">
                <GlassPricingSection className="mx-auto" onGetStarted={onOpenApp} />

                <section className="mx-auto mt-10 max-w-[980px]">
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                        {TRUST_BADGES.map((item) => {
                            const Icon = item.icon;
                            return (
                                <article key={item.label} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 flex items-center gap-2 justify-center">
                                    <Icon size={14} className="text-slate-200" />
                                    <span className="text-[12px] text-slate-300">{item.label}</span>
                                </article>
                            );
                        })}
                    </div>
                </section>

                <section className="mx-auto mt-20 max-w-[920px]">
                    <div className="text-center">
                        <h2 className="text-[34px] md:text-[48px] leading-[1.06] tracking-[-0.03em] font-semibold">Frequently asked questions</h2>
                        <p className="mt-2 text-[14px] text-slate-400">Everything you need to know about plans and billing.</p>
                    </div>

                    <div className="mt-8 space-y-3">
                        {FAQ_ITEMS.map((item, index) => {
                            const isOpen = openFaq === index;
                            return (
                                <article key={item.q} className="rounded-2xl border border-white/10 bg-[#0a0f1a]/85">
                                    <button
                                        type="button"
                                        onClick={() => setOpenFaq((prev) => (prev === index ? -1 : index))}
                                        className="w-full px-5 py-4 flex items-center justify-between text-left"
                                    >
                                        <span className="text-[14px] text-slate-100">{item.q}</span>
                                        <ChevronDown size={16} className={`text-slate-300 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                    {isOpen && (
                                        <p className="px-5 pb-5 text-[13px] text-slate-300 leading-relaxed">
                                            {item.a}
                                        </p>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                </section>

                <section className="mx-auto mt-14 max-w-[980px]">
                    <div className="relative overflow-hidden rounded-[18px] border border-white/10 bg-[linear-gradient(130deg,rgba(20,28,48,0.92),rgba(10,12,18,0.96))] p-6 md:p-8">
                        <div className="pointer-events-none absolute -right-14 -top-10 h-56 w-56 rounded-full border-[26px] border-white/5" />
                        <div className="pointer-events-none absolute -right-2 bottom-0 h-28 w-28 rounded-full border-[16px] border-white/5" />
                        <p className="text-[34px] md:text-[42px] tracking-[-0.03em] leading-[1.04] font-semibold">Still have questions?</p>
                        <p className="mt-2 text-[14px] text-slate-300">Reach out to our team if you need help choosing the right plan.</p>
                        <button
                            type="button"
                            onClick={onOpenApp}
                            className="mt-5 h-10 rounded-full bg-white px-4 text-[12px] font-semibold text-[#0a1020] hover:bg-slate-200 transition-colors"
                        >
                            Get in touch
                        </button>
                    </div>
                </section>

                <footer className="mx-auto mt-14 max-w-[1180px] border-t border-white/10 pt-8">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between text-[12px] text-slate-400">
                        <div className="flex items-center gap-4">
                            <button type="button" onClick={() => onNavigate('/')} className="hover:text-slate-200">Features</button>
                            <button type="button" onClick={() => onNavigate('/learn')} className="hover:text-slate-200">About the app</button>
                            <button type="button" onClick={() => onNavigate('/pricing')} className="hover:text-slate-200">Dark mode</button>
                        </div>
                        <div className="inline-flex items-center gap-2">
                            <img src={appLogo} alt="EazyUI logo" className="h-4 w-4 object-contain" />
                            <p>©2026 EazyUI</p>
                        </div>
                    </div>
                </footer>
            </main>
        </div>
    );
}


