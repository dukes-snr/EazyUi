import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { MarketingHeader } from './MarketingHeader';
import { BLOG_POSTS, type BlogCategory, type BlogPost } from '../../content/blogPosts';

type BlogPageProps = {
    onNavigate: (path: string) => void;
    onOpenApp: () => void;
};

const FEATURED_POSTS = BLOG_POSTS.slice(0, 2);

function getAccentStyle(post: BlogPost) {
    return {
        ['--blog-accent-a' as string]: post.accent.a,
        ['--blog-accent-b' as string]: post.accent.b,
        ['--blog-accent-c' as string]: post.accent.c,
        ['--blog-accent-d' as string]: post.accent.d,
    } as CSSProperties;
}

type BlogHeroCardProps = {
    post: BlogPost;
    size: 'wide' | 'tall';
    onNavigate: (path: string) => void;
};

function BlogHeroCard({ post, size, onNavigate }: BlogHeroCardProps) {
    return (
        <button
            type="button"
            onClick={() => onNavigate(`/blog/${post.slug}`)}
            className={`blog-hero-card ${size === 'wide' ? 'blog-hero-card-wide' : 'blog-hero-card-tall'}`}
            style={getAccentStyle(post)}
        >
            <div className="blog-hero-card__surface">
                <img src={post.coverImage} alt={post.title} className="blog-card-image blog-hero-card__image" />
                <div className="blog-hero-card__header">
                    <span className="blog-hero-card__eyebrow">{post.eyebrow}</span>
                    <span className="blog-hero-card__status">{post.status}</span>
                </div>
                <div className="blog-hero-card__footer">
                    <p className="blog-hero-card__meta">{post.readTime}</p>
                    <h2 className="blog-hero-card__title">{post.title}</h2>
                    <div className="blog-hero-card__bottom">
                        <p className="blog-hero-card__subcopy">{post.category}</p>
                        <span className="blog-hero-card__action" aria-hidden="true">
                            <ChevronRight size={16} />
                        </span>
                    </div>
                </div>
            </div>
        </button>
    );
}

type BlogGridCardProps = {
    post: BlogPost;
    onNavigate: (path: string) => void;
};

function BlogGridCard({ post, onNavigate }: BlogGridCardProps) {
    return (
        <button
            type="button"
            onClick={() => onNavigate(`/blog/${post.slug}`)}
            className="blog-grid-card"
        >
            <div className="blog-grid-card__visual" style={getAccentStyle(post)}>
                <img src={post.coverImage} alt={post.title} className="blog-card-image blog-grid-card__image" />
                <div className="blog-grid-card__label-row">
                    <span>{post.eyebrow}</span>
                    <span>{post.readTime}</span>
                </div>
                <div className="blog-grid-card__visual-footer">
                    <p>{post.category}</p>
                    <span className="blog-grid-card__play" aria-hidden="true">
                        <ChevronRight size={15} />
                    </span>
                </div>
            </div>
            <div className="blog-grid-card__body">
                <h3 className="blog-grid-card__title">{post.title}</h3>
                <p className="blog-grid-card__excerpt">{post.excerpt}</p>
                <p className="blog-grid-card__date">{post.publishedAt}</p>
            </div>
        </button>
    );
}

export function BlogPage({ onNavigate, onOpenApp }: BlogPageProps) {
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const [activeCategory, setActiveCategory] = useState<'All' | BlogCategory>('All');

    const categories = useMemo(() => (
        ['All', ...Array.from(new Set(BLOG_POSTS.map((post) => post.category)))] as Array<'All' | BlogCategory>
    ), []);

    const visiblePosts = useMemo(() => (
        activeCategory === 'All'
            ? BLOG_POSTS
            : BLOG_POSTS.filter((post) => post.category === activeCategory)
    ), [activeCategory]);

    return (
        <div ref={scrollContainerRef} className="h-screen w-screen overflow-y-auto bg-[var(--ui-bg)] text-[var(--ui-text)]">
            <MarketingHeader onNavigate={onNavigate} onOpenApp={onOpenApp} scrollContainerRef={scrollContainerRef} tone="surface" />

            <main className="blog-page-shell">
                <section className="blog-page-section blog-page-section-hero">
                    <div className="blog-page-inner">
                        <div className="blog-page-heading">
                            <div>
                                <p className="blog-page-kicker">Journal</p>
                                <h1 className="blog-page-title">Recent writing</h1>
                            </div>
                            <p className="blog-page-copy">
                                Detailed notes on UI prompting, design workflows, interface systems, pricing, and turning generated ideas into product-ready work.
                            </p>
                        </div>

                        <div className="blog-hero-grid">
                            <BlogHeroCard post={FEATURED_POSTS[0]} size="wide" onNavigate={onNavigate} />
                            <BlogHeroCard post={FEATURED_POSTS[1]} size="tall" onNavigate={onNavigate} />
                        </div>
                    </div>
                </section>

                <section className="blog-page-section blog-page-section-grid">
                    <div className="blog-page-inner">
                        <div className="blog-filter-row">
                            <div className="blog-filter-tabs" role="tablist" aria-label="Blog categories">
                                {categories.map((category) => (
                                    <button
                                        key={category}
                                        type="button"
                                        role="tab"
                                        aria-selected={activeCategory === category}
                                        onClick={() => setActiveCategory(category)}
                                        className={`blog-filter-tab ${activeCategory === category ? 'is-active' : ''}`}
                                    >
                                        {category}
                                    </button>
                                ))}
                            </div>

                            <button
                                type="button"
                                onClick={onOpenApp}
                                className="blog-filter-cta"
                            >
                                Open app
                                <ArrowRight size={14} />
                            </button>
                        </div>

                        <div className="blog-grid">
                            {visiblePosts.map((post) => (
                                <BlogGridCard key={post.slug} post={post} onNavigate={onNavigate} />
                            ))}
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
