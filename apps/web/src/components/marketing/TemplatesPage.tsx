import { useRef, useState } from 'react';
import { ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { MarketingHeader } from './MarketingHeader';
import { apiClient } from '../../api/client';

type TemplatesPageProps = {
    onNavigate: (path: string) => void;
    onOpenApp: () => void;
};

export function TemplatesPage({ onNavigate, onOpenApp }: TemplatesPageProps) {
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<string | null>(null);

    const handleNotify = async () => {
        const cleanEmail = email.trim();
        if (!cleanEmail || busy) return;

        try {
            setBusy(true);
            setStatus(null);
            await apiClient.subscribeToNewsletter(cleanEmail);
            setEmail('');
            setStatus('You are on the list. We will email you when templates go live.');
        } catch (error) {
            setStatus((error as Error).message || 'Could not sign you up right now.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div ref={scrollContainerRef} className="h-screen w-screen overflow-y-auto bg-[var(--ui-surface-1)] text-[var(--ui-text)]">
            <MarketingHeader onNavigate={onNavigate} onOpenApp={onOpenApp} scrollContainerRef={scrollContainerRef} />

            <main className="relative min-h-[calc(100vh-56px)] overflow-hidden bg-[var(--ui-surface-1)] px-4 pb-12 pt-6 md:px-6 md:pb-16 md:pt-10">
                <div className="pointer-events-none absolute inset-0 overflow-hidden">
                    <div className="absolute -left-10 top-[16%] h-40 w-40 rounded-[45%] bg-[radial-gradient(circle_at_35%_30%,rgba(97,195,120,0.95),rgba(75,141,88,0.78)_58%,rgba(75,141,88,0)_72%)] blur-[1px] md:h-56 md:w-56" />
                    <div className="absolute -left-2 top-[20%] h-32 w-20 rotate-[-24deg] rounded-[55%] bg-[linear-gradient(180deg,rgba(152,206,143,0.96),rgba(90,155,93,0.86))] blur-[2px] md:h-40 md:w-24" />
                    <div className="absolute bottom-[14%] left-[2%] h-24 w-24 rounded-full bg-[radial-gradient(circle_at_35%_30%,rgba(255,228,94,0.98),rgba(255,185,62,0.92)_64%,rgba(255,155,0,0.2)_78%)] shadow-[0_18px_50px_rgba(255,184,0,0.18)] md:h-32 md:w-32" />
                    <div className="absolute bottom-[12%] left-[5%] h-14 w-14 rounded-[42%] border border-white/30 bg-[radial-gradient(circle_at_45%_35%,rgba(255,201,86,0.98),rgba(255,140,36,0.9)_68%)] md:h-16 md:w-16" />

                    <div className="absolute right-[4%] top-[13%] h-5 w-5 rotate-[18deg] rounded-[35%] bg-[radial-gradient(circle_at_35%_35%,rgba(224,65,52,0.98),rgba(158,17,9,0.94))] shadow-[0_10px_24px_rgba(158,17,9,0.18)] md:h-6 md:w-6" />
                    <div className="absolute right-[8%] top-[16%] h-4 w-4 rounded-full bg-[radial-gradient(circle_at_35%_35%,rgba(255,98,82,0.96),rgba(190,30,23,0.92))] md:h-5 md:w-5" />
                    <div className="absolute right-[6%] top-[20%] h-16 w-2 rotate-[34deg] rounded-full bg-[linear-gradient(180deg,rgba(173,18,18,0.98),rgba(113,5,5,0.92))] md:h-20 md:w-3" />

                    <div className="absolute bottom-[10%] right-[-4%] h-32 w-36 rotate-[12deg] rounded-[2.5rem] bg-[linear-gradient(135deg,rgba(255,230,112,0.98),rgba(255,197,73,0.92))] shadow-[0_24px_60px_rgba(255,190,74,0.2)] md:h-44 md:w-52" />
                    <div className="absolute bottom-[13%] right-[3%] h-28 w-6 rotate-[20deg] rounded-full bg-[linear-gradient(180deg,rgba(245,255,229,0.96),rgba(227,239,211,0.88))] md:h-40 md:w-8" />
                    <div className="absolute bottom-[18%] right-[1%] h-10 w-10 rounded-full bg-white/70 blur-[6px]" />
                </div>

                <section className="relative mx-auto flex min-h-[calc(100vh-120px)] max-w-[1040px] flex-col items-center justify-center text-center">
                    <div className="max-w-[760px]">
                        <div className="inline-flex items-center gap-2 rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_18%,transparent)] bg-[color:color-mix(in_srgb,var(--ui-primary)_7%,transparent)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--ui-primary)]">
                            <Sparkles size={12} />
                            Coming Soon
                        </div>

                        <h1 className="mx-auto mt-6 max-w-[10ch] text-[48px] font-semibold leading-[0.94] tracking-[-0.06em] text-[var(--ui-text)] md:text-[84px]">
                            Hey!
                            <br />
                            We are cooking it up...
                        </h1>

                        <p className="mx-auto mt-5 max-w-[42ch] text-[16px] leading-8 text-[var(--ui-text-muted)] md:text-[18px]">
                            The template library is almost ready. We are polishing the first set so they feel worth starting from, not just nice to browse.
                        </p>

                        <div className="mx-auto mt-10 flex w-full max-w-[560px] flex-col gap-3 sm:flex-row sm:items-stretch">
                            <label className="flex-1">
                                <span className="sr-only">Email address</span>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            event.preventDefault();
                                            void handleNotify();
                                        }
                                    }}
                                    placeholder="Enter your email"
                                    className="h-14 w-full rounded-[1.1rem] border border-[color:color-mix(in_srgb,var(--ui-primary)_16%,var(--ui-border))] bg-white px-5 text-[15px] text-[var(--ui-text)] outline-none transition-colors placeholder:text-[var(--ui-text-subtle)] focus:border-[var(--ui-primary)] dark:bg-[var(--ui-surface-2)]"
                                />
                            </label>
                            <button
                                type="button"
                                onClick={() => void handleNotify()}
                                disabled={busy || !email.trim()}
                                className="inline-flex h-14 min-w-[180px] items-center justify-center gap-2 rounded-[1.1rem] bg-[var(--ui-primary)] px-6 text-[13px] font-semibold uppercase tracking-[0.14em] text-white shadow-[0_18px_40px_color-mix(in_srgb,var(--ui-primary)_30%,transparent)] transition-all hover:bg-[var(--ui-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {busy ? <Loader2 size={16} className="animate-spin" /> : null}
                                Notify Me
                            </button>
                        </div>

                        {status ? (
                            <p className="mx-auto mt-4 max-w-[38ch] text-[13px] leading-6 text-[var(--ui-text-muted)]">
                                {status}
                            </p>
                        ) : null}

                        <div className="mt-14 flex flex-col items-center justify-between gap-5 text-[12px] text-[var(--ui-text-subtle)] md:flex-row">
                            <button type="button" onClick={() => onNavigate('/blog')} className="transition-colors hover:text-[var(--ui-text)]">
                                Privacy Policy
                            </button>
                            <p>Made with EazyUI</p>
                            <button
                                type="button"
                                onClick={onOpenApp}
                                className="inline-flex items-center gap-2 transition-colors hover:text-[var(--ui-primary)]"
                            >
                                Open app
                                <ArrowRight size={13} />
                            </button>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
