import { useEffect, useState, useRef, type FormEvent } from 'react';
import { CheckCircle2, ChevronDown, Send } from 'lucide-react';
import { MarketingHeader } from './MarketingHeader';
import { apiClient } from '../../api/client';

type ContactPageProps = {
    onNavigate: (path: string) => void;
    onOpenApp: () => void;
};

const REASON_OPTIONS = [
    { value: 'sales', label: 'Sales question' },
    { value: 'enterprise', label: 'Enterprise rollout' },
    { value: 'support', label: 'Support request' },
    { value: 'partnership', label: 'Partnership' },
    { value: 'billing', label: 'Billing question' },
    { value: 'other', label: 'Other' },
] as const;

export function ContactPage({ onNavigate, onOpenApp }: ContactPageProps) {
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const reasonMenuRef = useRef<HTMLDivElement | null>(null);
    const [form, setForm] = useState({
        name: '',
        email: '',
        company: '',
        reason: 'sales',
        message: '',
    });
    const [isReasonMenuOpen, setIsReasonMenuOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [statusKind, setStatusKind] = useState<'success' | 'error' | null>(null);

    const handleChange = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const selectedReasonLabel = REASON_OPTIONS.find((option) => option.value === form.reason)?.label ?? 'Select reason';

    useEffect(() => {
        const handlePointerDown = (event: MouseEvent) => {
            if (!reasonMenuRef.current) return;
            if (reasonMenuRef.current.contains(event.target as Node)) return;
            setIsReasonMenuOpen(false);
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsReasonMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleEscape);
        };
    }, []);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (busy) return;

        try {
            setBusy(true);
            setStatus(null);
            setStatusKind(null);
            await apiClient.submitContactRequest({
                name: form.name.trim(),
                email: form.email.trim(),
                company: form.company.trim(),
                reason: form.reason,
                message: form.message.trim(),
            });
            setStatusKind('success');
            setStatus('Your message was sent. Check your inbox for the confirmation email.');
            setForm({
                name: '',
                email: '',
                company: '',
                reason: 'sales',
                message: '',
            });
        } catch (error) {
            setStatusKind('error');
            setStatus((error as Error).message || 'Could not send your message.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div ref={scrollContainerRef} className="h-screen w-screen overflow-y-auto bg-[var(--ui-surface-1)] text-[var(--ui-text)]">
            <MarketingHeader onNavigate={onNavigate} onOpenApp={onOpenApp} scrollContainerRef={scrollContainerRef} />

            <main className="px-4 pb-24 pt-12 md:px-6 md:pt-20">
                <section className="mx-auto grid w-full max-w-[1120px] gap-12 lg:grid-cols-[0.88fr_1.12fr] lg:gap-16">
                    <div className="pt-2">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--ui-primary)]">Contact</p>
                        <h1 className="mt-4 max-w-[10ch] text-[42px] font-semibold leading-[0.98] tracking-[-0.06em] text-[var(--ui-text)] md:text-[66px]">
                            Contact the team with clarity.
                        </h1>
                        <p className="mt-5 max-w-[54ch] text-[15px] leading-8 text-[var(--ui-text-muted)] md:text-[17px]">
                            Use the form for sales, enterprise rollout, billing, support, or partnership requests. Keep it short, specific, and tied to the decision or outcome you need help with.
                        </p>

                        <div className="mt-10 space-y-8">
                            <div>
                                <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--ui-text-subtle)]">Best for</p>
                                <p className="mt-2 max-w-[46ch] text-[15px] leading-8 text-[var(--ui-text-muted)]">
                                    Sales conversations, enterprise rollout planning, support issues, billing questions, and partnerships.
                                </p>
                            </div>
                            <div>
                                <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--ui-text-subtle)]">Helpful context</p>
                                <p className="mt-2 max-w-[46ch] text-[15px] leading-8 text-[var(--ui-text-muted)]">
                                    Include your company, team size, timeline, and the exact decision or blocker you want help with.
                                </p>
                            </div>
                        </div>

                        <div className="mt-10 flex flex-wrap gap-5 text-[13px] font-medium">
                            <button
                                type="button"
                                onClick={onOpenApp}
                                className="inline-flex items-center rounded-full border border-[color:color-mix(in_srgb,var(--ui-border)_72%,transparent)] bg-[var(--ui-surface-2)] px-4 py-2 text-[var(--ui-text)] transition-colors hover:border-[var(--ui-primary)] hover:text-[var(--ui-primary)]"
                            >
                                Open app
                            </button>
                            <button
                                type="button"
                                onClick={() => onNavigate('/pricing')}
                                className="inline-flex items-center rounded-full border border-[color:color-mix(in_srgb,var(--ui-border)_72%,transparent)] bg-[var(--ui-surface-2)] px-4 py-2 text-[var(--ui-text-muted)] transition-colors hover:border-[var(--ui-primary)] hover:text-[var(--ui-primary)]"
                            >
                                Back to pricing
                            </button>
                        </div>
                    </div>

                    <div className="rounded-[2rem] border border-[color:color-mix(in_srgb,var(--ui-border)_78%,transparent)] bg-[var(--ui-surface-2)] p-6 md:p-8">
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="grid gap-5 md:grid-cols-2">
                                <label className="block">
                                    <span className="text-[12px] font-medium uppercase tracking-[0.12em] text-[var(--ui-text-subtle)]">Name</span>
                                    <input
                                        type="text"
                                        value={form.name}
                                        onChange={(event) => handleChange('name', event.target.value)}
                                        placeholder="Your full name"
                                        required
                                        className="mt-3 h-12 w-full border-0 bg-transparent px-0 text-[14px] text-[var(--ui-text)] outline-none transition-colors placeholder:text-[var(--ui-text-subtle)]"
                                        style={{ border: 'none', background: 'transparent', boxShadow: 'none', borderRadius: 0, paddingLeft: 0, paddingRight: 0 }}
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-[12px] font-medium uppercase tracking-[0.12em] text-[var(--ui-text-subtle)]">Email</span>
                                    <input
                                        type="email"
                                        value={form.email}
                                        onChange={(event) => handleChange('email', event.target.value)}
                                        placeholder="name@company.com"
                                        required
                                        className="mt-3 h-12 w-full border-0 bg-transparent px-0 text-[14px] text-[var(--ui-text)] outline-none transition-colors placeholder:text-[var(--ui-text-subtle)]"
                                        style={{ border: 'none', background: 'transparent', boxShadow: 'none', borderRadius: 0, paddingLeft: 0, paddingRight: 0 }}
                                    />
                                </label>
                            </div>

                            <div className="grid gap-5 md:grid-cols-2">
                                <label className="block">
                                    <span className="text-[12px] font-medium uppercase tracking-[0.12em] text-[var(--ui-text-subtle)]">Company</span>
                                    <input
                                        type="text"
                                        value={form.company}
                                        onChange={(event) => handleChange('company', event.target.value)}
                                        placeholder="Company or team"
                                        className="mt-3 h-12 w-full border-0 bg-transparent px-0 text-[14px] text-[var(--ui-text)] outline-none transition-colors placeholder:text-[var(--ui-text-subtle)]"
                                        style={{ border: 'none', background: 'transparent', boxShadow: 'none', borderRadius: 0, paddingLeft: 0, paddingRight: 0 }}
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-[12px] font-medium uppercase tracking-[0.12em] text-[var(--ui-text-subtle)]">Reason</span>
                                    <div ref={reasonMenuRef} className="relative mt-3">
                                        <button
                                            type="button"
                                            onClick={() => setIsReasonMenuOpen((current) => !current)}
                                            className={`flex h-12 w-full items-center justify-between border-0 border-b bg-transparent px-0 text-left text-[14px] outline-none transition-colors ${isReasonMenuOpen ? 'border-[var(--ui-primary)] text-[var(--ui-text)]' : 'border-[var(--ui-border)] text-[var(--ui-text)]'}`}
                                            aria-haspopup="listbox"
                                            aria-expanded={isReasonMenuOpen}
                                        >
                                            <span>{selectedReasonLabel}</span>
                                            <ChevronDown
                                                size={16}
                                                className={`shrink-0 text-[var(--ui-text-subtle)] transition-transform ${isReasonMenuOpen ? 'rotate-180' : ''}`}
                                            />
                                        </button>
                                        {isReasonMenuOpen ? (
                                            <div
                                                className="absolute left-0 right-0 top-[calc(100%+0.75rem)] z-20 overflow-hidden rounded-[1.15rem] border border-[color:color-mix(in_srgb,var(--ui-border)_72%,transparent)] bg-[var(--ui-surface-1)]"
                                                role="listbox"
                                                aria-label="Contact reason"
                                            >
                                                {REASON_OPTIONS.map((option) => {
                                                    const isSelected = option.value === form.reason;
                                                    return (
                                                        <button
                                                            key={option.value}
                                                            type="button"
                                                            onClick={() => {
                                                                handleChange('reason', option.value);
                                                                setIsReasonMenuOpen(false);
                                                            }}
                                                            className={`flex w-full items-center justify-between px-4 py-3 text-left text-[14px] transition-colors ${isSelected
                                                                ? 'bg-[var(--ui-surface-2)] text-[var(--ui-text)]'
                                                                : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]'
                                                                }`}
                                                            role="option"
                                                            aria-selected={isSelected}
                                                        >
                                                            <span>{option.label}</span>
                                                            {isSelected ? <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--ui-primary)]">Selected</span> : null}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ) : null}
                                    </div>
                                </label>
                            </div>

                            <label className="block">
                                <span className="text-[12px] font-medium uppercase tracking-[0.12em] text-[var(--ui-text-subtle)]">Message</span>
                                <textarea
                                    value={form.message}
                                    onChange={(event) => handleChange('message', event.target.value)}
                                    placeholder="Tell us what you need, what stage your team is at, and what outcome you want."
                                    required
                                    rows={8}
                                    className="mt-3 w-full resize-none border-0 bg-transparent px-0 py-3 text-[14px] leading-7 text-[var(--ui-text)] outline-none transition-colors placeholder:text-[var(--ui-text-subtle)]"
                                    style={{ border: 'none', background: 'transparent', boxShadow: 'none', borderRadius: 0, paddingLeft: 0, paddingRight: 0 }}
                                />
                            </label>

                            {status ? (
                                <div className={`px-0 py-1 text-[13px] leading-6 ${statusKind === 'success'
                                    ? 'text-emerald-400'
                                    : 'text-rose-400'
                                    }`}
                                >
                                    {statusKind === 'success' ? <CheckCircle2 size={16} className="mr-2 inline-block" /> : null}
                                    {status}
                                </div>
                            ) : null}

                            <button
                                type="submit"
                                disabled={busy || !form.name.trim() || !form.email.trim() || !form.message.trim()}
                                className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--ui-primary)] px-5 text-[12px] font-semibold uppercase tracking-[0.12em] text-white transition-colors hover:bg-[var(--ui-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <Send size={14} />
                                {busy ? 'Sending...' : 'Send message'}
                            </button>
                        </form>
                    </div>
                </section>
            </main>
        </div>
    );
}
