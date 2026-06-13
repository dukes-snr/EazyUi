import { ChevronDown, LogOut, Menu, X } from 'lucide-react';
import { useEffect, useMemo, useState, type RefObject } from 'react';
import type { User } from 'firebase/auth';

import appLogo from '../../assets/Ui-logo.svg';
import { observeAuthState, sendCurrentUserVerificationEmail, signOutCurrentUser } from '../../lib/auth';

type MarketingHeaderProps = {
    onNavigate: (path: string) => void;
    onOpenApp?: () => void;
    scrollContainerRef?: RefObject<HTMLElement | null>;
    tone?: 'default' | 'surface';
    topStageDark?: boolean;
};

export function MarketingHeader({ onNavigate, onOpenApp }: MarketingHeaderProps) {
    const [authUser, setAuthUser] = useState<User | null>(null);
    const [isNavOpen, setIsNavOpen] = useState(false);
    const [verificationBusy, setVerificationBusy] = useState(false);

    useEffect(() => {
        const unsubscribe = observeAuthState(setAuthUser);
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        setIsNavOpen(false);
    }, [window.location.pathname]);

    const authDisplayName = authUser?.displayName || authUser?.email?.split('@')[0] || 'User';
    const authPhotoUrl = useMemo(() => (
        authUser?.photoURL
        || authUser?.providerData.find((provider) => Boolean(provider?.photoURL))?.photoURL
        || `https://ui-avatars.com/api/?name=${encodeURIComponent(authDisplayName)}&background=111714&color=ffffff&size=128&rounded=true`
    ), [authDisplayName, authUser]);

    const navigate = (path: string) => {
        setIsNavOpen(false);
        onNavigate(path);
    };

    const handleSendVerification = async () => {
        try {
            setVerificationBusy(true);
            await sendCurrentUserVerificationEmail();
        } finally {
            setVerificationBusy(false);
        }
    };

    return (
        <header className="marketing-hero-header">
            <nav className="landing-data-nav" aria-label="Primary navigation">
                <button type="button" className="landing-data-logo" onClick={() => navigate('/')}>
                    <img src={appLogo} alt="" />
                    <span>EazyUI</span>
                </button>

                <div className={`landing-data-nav__links ${isNavOpen ? 'is-open' : ''}`}>
                    <button type="button" onClick={() => navigate('/templates')}>Templates</button>
                    <button type="button" onClick={() => navigate('/')}>
                        Features <ChevronDown size={14} />
                    </button>
                    <button type="button" onClick={() => navigate('/pricing')}>Pricing</button>
                    <button type="button" onClick={() => navigate('/learn')}>Learn</button>
                    <button type="button" onClick={() => navigate('/changelog')}>What's New</button>
                </div>

                <div className="landing-data-nav__actions">
                    {authUser ? (
                        <>
                            {!authUser.emailVerified && (
                                <button
                                    type="button"
                                    className="landing-data-nav__verify"
                                    onClick={() => void handleSendVerification()}
                                    disabled={verificationBusy}
                                >
                                    {verificationBusy ? 'Sending...' : 'Verify email'}
                                </button>
                            )}
                            <button
                                type="button"
                                className="landing-data-nav__profile"
                                onClick={() => (onOpenApp ? onOpenApp() : navigate('/app'))}
                            >
                                <img
                                    src={authPhotoUrl}
                                    alt=""
                                    onError={(event) => {
                                        event.currentTarget.src = appLogo;
                                    }}
                                />
                                <span>{authDisplayName}</span>
                            </button>
                            <button
                                type="button"
                                className="landing-data-nav__icon"
                                onClick={() => void signOutCurrentUser()}
                                aria-label="Sign out"
                            >
                                <LogOut size={15} />
                            </button>
                        </>
                    ) : (
                        <>
                            <button type="button" className="landing-data-nav__signup" onClick={() => navigate('/login')}>Sign Up</button>
                            <button type="button" className="landing-data-nav__login" onClick={() => navigate('/login')}>Log In</button>
                        </>
                    )}
                    <button
                        type="button"
                        className="landing-data-nav__menu"
                        onClick={() => setIsNavOpen((open) => !open)}
                        aria-label={isNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
                        aria-expanded={isNavOpen}
                    >
                        {isNavOpen ? <X size={16} /> : <Menu size={16} />}
                    </button>
                </div>
            </nav>
        </header>
    );
}
