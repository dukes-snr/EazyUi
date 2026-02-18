import { BookOpen, Clock3, PlayCircle, Rocket, School } from 'lucide-react';
import { MarketingHeader } from './MarketingHeader';

type LearnPageProps = {
    onNavigate: (path: string) => void;
    onOpenApp: () => void;
};

const TRACKS = [
    { title: 'Prompt Engineering for UI', level: 'Beginner', duration: '35 min' },
    { title: 'Design Systems with EazyUI', level: 'Intermediate', duration: '50 min' },
    { title: 'From Draft to Production', level: 'Advanced', duration: '42 min' },
] as const;

export function LearnPage({ onNavigate, onOpenApp }: LearnPageProps) {
    return (
        <div className="h-screen w-screen overflow-y-auto bg-[#060913] text-white">
            <div className="pointer-events-none fixed inset-0">
                <div className="absolute inset-0 bg-[radial-gradient(72%_40%_at_82%_0%,rgba(96,171,255,0.2),rgba(6,9,19,0)_70%),linear-gradient(180deg,#060913_0%,#05070f_100%)]" />
            </div>

            <MarketingHeader onNavigate={onNavigate} onOpenApp={onOpenApp} />

            <main className="relative z-10 mx-auto max-w-[1180px] px-4 md:px-6 pt-10 pb-20">
                <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
                    <article className="rounded-[28px] border border-white/10 bg-white/[0.03] p-7 md:p-9">
                        <p className="inline-flex items-center gap-2 rounded-full border border-indigo-300/40 bg-indigo-300/10 px-3 py-1 text-[11px] uppercase tracking-[0.1em] text-indigo-100">
                            <BookOpen size={12} /> Learning Hub
                        </p>
                        <h1 className="mt-4 text-[38px] md:text-[54px] leading-[1.04] tracking-[-0.03em] font-semibold max-w-[13ch]">
                            Learn practical workflows that improve every screen.
                        </h1>
                        <p className="mt-4 text-[15px] text-slate-300 max-w-[56ch]">
                            Step-by-step modules for designers and frontend teams. Focused on real product scenarios, not theory.
                        </p>
                        <div className="mt-6 grid grid-cols-3 gap-2">
                            <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-center">
                                <p className="text-[24px] font-semibold text-indigo-100">120+</p>
                                <p className="text-[11px] uppercase tracking-[0.1em] text-slate-400">Guides</p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-center">
                                <p className="text-[24px] font-semibold text-cyan-100">45</p>
                                <p className="text-[11px] uppercase tracking-[0.1em] text-slate-400">Lessons</p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-center">
                                <p className="text-[24px] font-semibold text-emerald-100">18m</p>
                                <p className="text-[11px] uppercase tracking-[0.1em] text-slate-400">Avg time</p>
                            </div>
                        </div>
                    </article>

                    <aside className="rounded-[28px] border border-white/10 bg-[#0a1120]/75 p-6 md:p-8">
                        <p className="text-[12px] uppercase tracking-[0.1em] text-slate-400">Popular tracks</p>
                        <div className="mt-4 space-y-3">
                            {TRACKS.map((track) => (
                                <div key={track.title} className="rounded-xl border border-white/10 bg-black/30 p-4">
                                    <p className="text-[17px] font-semibold">{track.title}</p>
                                    <div className="mt-2 flex items-center gap-3 text-[12px] text-slate-300">
                                        <span className="inline-flex items-center gap-1"><School size={12} /> {track.level}</span>
                                        <span className="inline-flex items-center gap-1"><Clock3 size={12} /> {track.duration}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </aside>
                </section>

                <section className="mt-8 rounded-[26px] border border-white/10 bg-gradient-to-r from-indigo-500/15 via-cyan-500/10 to-transparent p-6 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.1em] text-indigo-100/90">Ready to apply</p>
                        <h2 className="mt-2 text-[28px] leading-[1.1] font-semibold max-w-[22ch]">
                            Open the app and practice with guided prompts now.
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onOpenApp}
                        className="h-10 rounded-full bg-white px-4 text-[11px] uppercase tracking-[0.1em] text-[#0d1321] font-semibold hover:bg-slate-200 transition-colors inline-flex items-center gap-2"
                    >
                        <PlayCircle size={14} /> Start learning
                    </button>
                </section>

                <section className="mt-6 grid gap-3 md:grid-cols-2">
                    <article className="rounded-2xl border border-white/10 bg-black/30 p-5">
                        <h3 className="text-[20px] font-semibold inline-flex items-center gap-2"><Rocket size={16} className="text-emerald-200" /> Weekly Build Clinics</h3>
                        <p className="mt-2 text-[14px] text-slate-300">Join live teardowns of real interfaces and see how prompts become implementation decisions.</p>
                    </article>
                    <article className="rounded-2xl border border-white/10 bg-black/30 p-5">
                        <h3 className="text-[20px] font-semibold inline-flex items-center gap-2"><BookOpen size={16} className="text-cyan-200" /> Team Playbooks</h3>
                        <p className="mt-2 text-[14px] text-slate-300">Reusable frameworks for PM, design, and frontend handoff that reduce rework.</p>
                    </article>
                </section>
            </main>
        </div>
    );
}
