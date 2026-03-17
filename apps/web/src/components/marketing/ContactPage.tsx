import { useState, useRef, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, Mail, MessageSquareText, Send, ShieldCheck } from 'lucide-react';
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
    const [form, setForm] = useState({
        name: '',
        email: '',
        company: '',
        reason: 'sales',
        message: '',
    });
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [statusKind, setStatusKind] = useState<'success' | 'error' | null>(null);

    const handleChange = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

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

            <main className="px-4 pb-24 pt-10 md:px-6 md:pt-14">
                <section className="mx-auto grid w-full max-w-[1120px] gap-8 lg:grid-cols-[0.9fr_1.1fr]">
                    <div className="pt-2">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--ui-primary)]">Contact</p>
                        <h1 className="mt-4 max-w-[10ch] text-[42px] font-semibold leading-[0.98] tracking-[-0.06em] text-[var(--ui-text)] md:text-[68px]">
                            Reach the team with the right context.
                        </h1>
                        <p className="mt-5 max-w-[54ch] text-[15px] leading-8 text-[var(--ui-text-muted)] md:text-[17px]">
                            Use the form for sales, enterprise rollout, billing, support, or partnership requests. This page sends through the existing Resend-backed email flow so your request lands as an actual message, not a dead form entry.
                        </p>

                        <div className="mt-8 grid gap-4">
                            <article className="rounded-[1.4rem] border border-[color:color-mix(in_srgb,var(--ui-primary)_12%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-surface-2)_70%,white)] p-5 dark:bg-[color:color-mix(in_srgb,var(--ui-surface-2)_88%,transparent)]">
                                <p className="inline-flex items-center gap-2 text-[12px] font-medium text-[var(--ui-primary)]">
                                    <Mail size={14} />
                                    Email route
                                </p>
                                <p className="mt-3 text-[14px] leading-7 text-[var(--ui-text-muted)]">
                                    Your message is delivered through the same Resend infrastructure already used for the site newsletter and welcome emails.
                                </p>
                            </article>
                            <article className="rounded-[1.4rem] border border-[color:color-mix(in_srgb,var(--ui-primary)_12%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-surface-2)_70%,white)] p-5 dark:bg-[color:color-mix(in_srgb,var(--ui-surface-2)_88%,transparent)]">
                                <p className="inline-flex items-center gap-2 text-[12px] font-medium text-[var(--ui-primary)]">
                                    <ShieldCheck size={14} />
                                    Helpful details
                                </p>
                                <p className="mt-3 text-[14px] leading-7 text-[var(--ui-text-muted)]">
                                    The most useful requests explain your company, the reason for contact, and what you are trying to achieve with EazyUI.
                                </p>
                            </article>
                            <article className="rounded-[1.4rem] border border-[color:color-mix(in_srgb,var(--ui-primary)_12%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-surface-2)_70%,white)] p-5 dark:bg-[color:color-mix(in_srgb,var(--ui-surface-2)_88%,transparent)]">
                                <p className="inline-flex items-center gap-2 text-[12px] font-medium text-[var(--ui-primary)]">
                                    <MessageSquareText size={14} />
                                    Faster replies
                                </p>
                                <p className="mt-3 text-[14px] leading-7 text-[var(--ui-text-muted)]">
                                    If this is about enterprise rollout or billing, include expected team size, timeline, or the decision you need help making.
                                </p>
                            </article>
                        </div>

                        <div className="mt-8 flex flex-wrap gap-3">
                            <button
                                type="button"
                                onClick={onOpenApp}
                                className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--ui-primary)] px-5 text-[12px] font-semibold uppercase tracking-[0.12em] text-white shadow-[0_16px_40px_color-mix(in_srgb,var(--ui-primary)_28%,transparent)] transition-all hover:bg-[var(--ui-primary-hover)]"
                            >
                                Open app
                                <ArrowRight size={14} />
                            </button>
                            <button
                                type="button"
                                onClick={() => onNavigate('/pricing')}
                                className="inline-flex h-11 items-center gap-2 rounded-full border border-[color:color-mix(in_srgb,var(--ui-primary)_20%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-primary)_6%,var(--ui-surface-2))] px-5 text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--ui-text)] transition-colors hover:border-[color:color-mix(in_srgb,var(--ui-primary)_40%,transparent)] hover:text-[var(--ui-primary)]"
                            >
                                Back to pricing
                            </button>
                        </div>
                    </div>

                    <div className="rounded-[2rem] border border-[color:color-mix(in_srgb,var(--ui-primary)_14%,var(--ui-border))] bg-[color:color-mix(in_srgb,var(--ui-surface-2)_72%,white)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)] dark:bg-[color:color-mix(in_srgb,var(--ui-surface-2)_92%,transparent)] dark:shadow-[0_24px_60px_rgba(2,6,23,0.18)] md:p-7">
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
                                        className="mt-2 h-12 w-full rounded-[1rem] border border-[color:color-mix(in_srgb,var(--ui-primary)_14%,var(--ui-border))] bg-[var(--ui-surface-1)] px-4 text-[14px] text-[var(--ui-text)] outline-none transition-colors placeholder:text-[var(--ui-text-subtle)] focus:border-[var(--ui-primary)]"
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
                                        className="mt-2 h-12 w-full rounded-[1rem] border border-[color:color-mix(in_srgb,var(--ui-primary)_14%,var(--ui-border))] bg-[var(--ui-surface-1)] px-4 text-[14px] text-[var(--ui-text)] outline-none transition-colors placeholder:text-[var(--ui-text-subtle)] focus:border-[var(--ui-primary)]"
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
                                        className="mt-2 h-12 w-full rounded-[1rem] border border-[color:color-mix(in_srgb,var(--ui-primary)_14%,var(--ui-border))] bg-[var(--ui-surface-1)] px-4 text-[14px] text-[var(--ui-text)] outline-none transition-colors placeholder:text-[var(--ui-text-subtle)] focus:border-[var(--ui-primary)]"
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-[12px] font-medium uppercase tracking-[0.12em] text-[var(--ui-text-subtle)]">Reason</span>
                                    <select
                                        value={form.reason}
                                        onChange={(event) => handleChange('reason', event.target.value)}
                                        className="mt-2 h-12 w-full rounded-[1rem] border border-[color:color-mix(in_srgb,var(--ui-primary)_14%,var(--ui-border))] bg-[var(--ui-surface-1)] px-4 text-[14px] text-[var(--ui-text)] outline-none transition-colors focus:border-[var(--ui-primary)]"
                                    >
                                        {REASON_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
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
                                    className="mt-2 w-full rounded-[1.1rem] border border-[color:color-mix(in_srgb,var(--ui-primary)_14%,var(--ui-border))] bg-[var(--ui-surface-1)] px-4 py-3 text-[14px] leading-7 text-[var(--ui-text)] outline-none transition-colors placeholder:text-[var(--ui-text-subtle)] focus:border-[var(--ui-primary)]"
                                />
                            </label>

                            {status ? (
                                <div className={`rounded-[1rem] border px-4 py-3 text-[13px] leading-6 ${statusKind === 'success'
                                    ? 'border-emerald-400/24 bg-emerald-400/10 text-emerald-300'
                                    : 'border-rose-400/24 bg-rose-400/10 text-rose-300'
                                    }`}
                                >
                                    {statusKind === 'success' ? <CheckCircle2 size={16} className="mr-2 inline-block" /> : null}
                                    {status}
                                </div>
                            ) : null}

                            <button
                                type="submit"
                                disabled={busy || !form.name.trim() || !form.email.trim() || !form.message.trim()}
                                className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--ui-primary)] px-5 text-[12px] font-semibold uppercase tracking-[0.12em] text-white shadow-[0_16px_40px_color-mix(in_srgb,var(--ui-primary)_28%,transparent)] transition-all hover:bg-[var(--ui-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
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
