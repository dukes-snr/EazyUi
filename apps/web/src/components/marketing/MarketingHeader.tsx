type MarketingHeaderProps = {
    onNavigate: (path: string) => void;
    onOpenApp: () => void;
};

const NAV_ITEMS = [
    { label: 'Templates', path: '/templates' },
    { label: 'Pricing', path: '/pricing' },
    { label: 'Learn', path: '/learn' },
] as const;

export function MarketingHeader({ onNavigate, onOpenApp }: MarketingHeaderProps) {
    return (
        <header className="relative z-10 h-14 border-b border-white/5">
            <div className="mx-auto h-full max-w-[1160px] px-6 flex items-center justify-between">
                <button
                    type="button"
                    onClick={() => onNavigate('/')}
                    className="inline-flex items-center gap-2 text-left"
                >
                    <span className="h-6 w-6 rounded-full bg-white/10 text-[11px] flex items-center justify-center text-white/80">E</span>
                    <span className="text-[12px] font-semibold tracking-[0.08em] uppercase text-gray-200">EazyUI</span>
                </button>
                <div className="hidden lg:flex items-center gap-2">
                    {NAV_ITEMS.map((item) => {
                        return (
                            <button
                                key={item.label}
                                type="button"
                                onClick={() => onNavigate(item.path)}
                                className="h-8 rounded-full px-3 text-[11px] uppercase tracking-[0.08em] text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                            >
                                {item.label}
                            </button>
                        );
                    })}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onOpenApp}
                        className="hidden sm:inline-flex h-8 items-center rounded-full border border-white/15 px-3 text-[11px] uppercase tracking-[0.08em] text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                    >
                        Try now
                    </button>
                    <button
                        type="button"
                        onClick={onOpenApp}
                        className="h-8 rounded-full bg-white px-3 text-[11px] uppercase tracking-[0.08em] text-[#0b1020] font-semibold hover:bg-gray-200 transition-colors"
                    >
                        Open app
                    </button>
                </div>
            </div>
        </header>
    );
}
