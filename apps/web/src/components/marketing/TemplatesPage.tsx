import { ArrowRight, Check, LayoutTemplate, PanelsTopLeft, Smartphone } from 'lucide-react';
import { MarketingHeader } from './MarketingHeader';

type TemplatesPageProps = {
    onNavigate: (path: string) => void;
    onOpenApp: () => void;
};

const TEMPLATE_CARDS = [
    { title: 'SaaS Workspace', type: 'Desktop', detail: 'KPI header, command palette, dense data table.' },
    { title: 'Commerce Mobile', type: 'Mobile', detail: 'Product feed, sticky cart rail, fast checkout.' },
    { title: 'Fintech Flow', type: 'Hybrid', detail: 'Wallet summary, transfer flow, card controls.' },
] as const;

export function TemplatesPage({ onNavigate, onOpenApp }: TemplatesPageProps) {
    return (
        <div className="h-screen w-screen overflow-y-auto bg-[#070b12] text-white">
            <div className="pointer-events-none fixed inset-0">
                <div className="absolute inset-0 bg-[radial-gradient(60%_40%_at_18%_0%,rgba(0,214,255,0.18),rgba(7,11,18,0)_64%),radial-gradient(60%_40%_at_84%_12%,rgba(255,194,112,0.15),rgba(7,11,18,0)_70%)]" />
            </div>

            <MarketingHeader onNavigate={onNavigate} onOpenApp={onOpenApp} />

            <main className="relative z-10 mx-auto max-w-[1180px] px-4 md:px-6 pt-10 pb-20">
                <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                    <article className="rounded-[30px] border border-white/10 bg-white/[0.03] p-7 md:p-10">
                        <p className="inline-flex items-center gap-2 rounded-full border border-cyan-300/35 bg-cyan-300/10 px-3 py-1 text-[11px] uppercase tracking-[0.1em] text-cyan-100">
                            <LayoutTemplate size={13} /> Templates
                        </p>
                        <h1 className="mt-4 text-[38px] md:text-[58px] tracking-[-0.03em] leading-[1.02] font-semibold max-w-[12ch]">
                            Production page starters for real shipping teams.
                        </h1>
                        <p className="mt-4 text-[15px] text-slate-300 max-w-[58ch] leading-relaxed">
                            Pick a base, inject your prompt, and instantly reshape layout, hierarchy, and interaction density.
                        </p>
                        <div className="mt-6 grid gap-2">
                            {['Landing, onboarding, dashboard, settings', 'Tuned spacing + typography presets', 'Web + mobile-first structure'].map((line) => (
                                <p key={line} className="text-[13px] text-slate-200 inline-flex items-center gap-2">
                                    <span className="h-5 w-5 rounded-full border border-emerald-300/40 bg-emerald-300/10 inline-flex items-center justify-center text-emerald-100">
                                        <Check size={12} />
                                    </span>
                                    {line}
                                </p>
                            ))}
                        </div>
                    </article>

                    <aside className="rounded-[30px] border border-white/10 bg-[#0b1220]/85 p-6">
                        <p className="text-[11px] uppercase tracking-[0.1em] text-slate-400">Template Match Rate</p>
                        <p className="mt-2 text-[56px] leading-none font-semibold text-cyan-100">93%</p>
                        <p className="mt-2 text-[13px] text-slate-300">First-pass acceptance by teams using prompt + template pairing.</p>
                        <div className="mt-6 h-40 rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-300/15 via-transparent to-amber-200/10 p-4">
                            <p className="text-[11px] uppercase tracking-[0.1em] text-slate-300">Best For</p>
                            <div className="mt-4 grid grid-cols-2 gap-2 text-[12px] text-slate-200">
                                <span className="rounded-full border border-white/15 px-2 py-1 inline-flex items-center gap-1"><PanelsTopLeft size={12} /> SaaS</span>
                                <span className="rounded-full border border-white/15 px-2 py-1 inline-flex items-center gap-1"><Smartphone size={12} /> Mobile</span>
                            </div>
                        </div>
                    </aside>
                </section>

                <section className="mt-8 grid gap-4 md:grid-cols-3">
                    {TEMPLATE_CARDS.map((card) => (
                        <article key={card.title} className="rounded-2xl border border-white/10 bg-black/25 p-5">
                            <p className="inline-flex rounded-full border border-indigo-300/40 bg-indigo-300/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-indigo-100">{card.type}</p>
                            <h3 className="mt-3 text-[22px] leading-[1.15] font-semibold">{card.title}</h3>
                            <p className="mt-2 text-[14px] text-slate-300">{card.detail}</p>
                            <button
                                type="button"
                                onClick={onOpenApp}
                                className="mt-5 h-9 rounded-full bg-white px-4 text-[11px] uppercase tracking-[0.1em] text-[#0b1120] font-semibold hover:bg-slate-200 transition-colors inline-flex items-center gap-1"
                            >
                                Use template <ArrowRight size={12} />
                            </button>
                        </article>
                    ))}
                </section>
            </main>
        </div>
    );
}
