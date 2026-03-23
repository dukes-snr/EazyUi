import { useMemo, useRef, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { MarketingHeader } from './MarketingHeader';
import { getBlogPostBySlug, getRelatedBlogPosts } from '../../content/blogPosts';

type BlogDetailPageProps = {
    slug: string;
    onNavigate: (path: string) => void;
    onOpenApp: () => void;
};

function getAccentStyle(post: NonNullable<ReturnType<typeof getBlogPostBySlug>>) {
    return {
        ['--blog-accent-a' as string]: post.accent.a,
        ['--blog-accent-b' as string]: post.accent.b,
        ['--blog-accent-c' as string]: post.accent.c,
        ['--blog-accent-d' as string]: post.accent.d,
    } as CSSProperties;
}

export function BlogDetailPage({ slug, onNavigate, onOpenApp }: BlogDetailPageProps) {
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const post = getBlogPostBySlug(slug);
    const relatedPosts = useMemo(() => getRelatedBlogPosts(slug, 3), [slug]);

    if (!post) {
        return (
            <div ref={scrollContainerRef} className="h-screen w-screen overflow-y-auto bg-[var(--ui-bg)] text-[var(--ui-text)]">
                <MarketingHeader onNavigate={onNavigate} onOpenApp={onOpenApp} scrollContainerRef={scrollContainerRef} tone="surface" />
                <main className="blog-page-shell">
                    <section className="blog-page-section">
                        <div className="blog-page-inner">
                            <div className="blog-empty-state">
                                <p className="blog-page-kicker">Blog</p>
                                <h1 className="blog-page-title">Article not found</h1>
                                <p className="blog-page-copy">
                                    The article you requested does not exist or has moved. You can go back to the blog index and continue browsing.
                                </p>
                                <button type="button" onClick={() => onNavigate('/blog')} className="blog-detail-back blog-detail-back-inline">
                                    <ArrowLeft size={15} />
                                    Back to blog
                                </button>
                            </div>
                        </div>
                    </section>
                </main>
            </div>
        );
    }

    return (
        <div ref={scrollContainerRef} className="h-screen w-screen overflow-y-auto bg-[var(--ui-bg)] text-[var(--ui-text)]">
            <MarketingHeader onNavigate={onNavigate} onOpenApp={onOpenApp} scrollContainerRef={scrollContainerRef} tone="surface" />

            <main className="blog-page-shell">
                <section className="blog-page-section blog-detail-section">
                    <div className="blog-page-inner blog-detail-inner">
                        <button type="button" onClick={() => onNavigate('/blog')} className="blog-detail-back">
                            <ArrowLeft size={15} />
                            Blog
                        </button>

                        <div className="blog-detail-hero" style={getAccentStyle(post)}>
                            <div className="blog-detail-hero__surface">
                                <img src={post.coverImage} alt={post.title} className="blog-card-image blog-detail-hero__image" />
                                <div className="blog-detail-hero__content">
                                    <div className="blog-detail-hero__meta">
                                        <span>{post.eyebrow}</span>
                                        <span>{post.category}</span>
                                        <span>{post.readTime}</span>
                                        <span>{post.publishedAt}</span>
                                    </div>
                                    <h1 className="blog-detail-title">{post.title}</h1>
                                    <p className="blog-detail-excerpt">{post.excerpt}</p>
                                    <div className="blog-detail-tags">
                                        {post.tags.map((tag) => (
                                            <span key={tag} className="blog-detail-tag">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <article className="blog-article">
                            {post.sections.map((section) => (
                                <section key={section.heading} className="blog-article-section">
                                    <h2>{section.heading}</h2>
                                    {section.paragraphs.map((paragraph, index) => (
                                        <p key={`${section.heading}-${index}`}>{paragraph}</p>
                                    ))}
                                </section>
                            ))}
                        </article>

                        <section className="blog-related">
                            <div className="blog-related__header">
                                <div>
                                    <p className="blog-page-kicker">Keep Reading</p>
                                    <h2 className="blog-related__title">More from the EazyUI blog</h2>
                                </div>
                                <button type="button" onClick={onOpenApp} className="blog-filter-cta">
                                    Open app
                                    <ArrowRight size={14} />
                                </button>
                            </div>

                            <div className="blog-grid">
                                {relatedPosts.map((item) => (
                                    <button
                                        key={item.slug}
                                        type="button"
                                        onClick={() => onNavigate(`/blog/${item.slug}`)}
                                        className="blog-grid-card"
                                    >
                                        <div className="blog-grid-card__visual" style={getAccentStyle(item)}>
                                            <img src={item.coverImage} alt={item.title} className="blog-card-image blog-grid-card__image" />
                                            <div className="blog-grid-card__label-row">
                                                <span>{item.eyebrow}</span>
                                                <span>{item.readTime}</span>
                                            </div>
                                            <div className="blog-grid-card__visual-footer">
                                                <p>{item.category}</p>
                                                <span className="blog-grid-card__play" aria-hidden="true">
                                                    <ArrowRight size={15} />
                                                </span>
                                            </div>
                                        </div>
                                        <div className="blog-grid-card__body">
                                            <h3 className="blog-grid-card__title">{item.title}</h3>
                                            <p className="blog-grid-card__excerpt">{item.excerpt}</p>
                                            <p className="blog-grid-card__date">{item.publishedAt}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </section>
                    </div>
                </section>
            </main>
        </div>
    );
}
