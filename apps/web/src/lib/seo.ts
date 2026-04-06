type MetaSelector = {
    tag: 'meta' | 'link';
    attr: 'name' | 'property' | 'rel';
    value: string;
};

export type SeoConfig = {
    title: string;
    description: string;
    path: string;
    robots?: string;
    ogType?: 'website' | 'article';
    ogImage?: string;
    jsonLd?: Array<Record<string, unknown>>;
};

const DEFAULT_DESCRIPTION = 'EazyUI is an AI UI design workspace for creating product screens, dashboards, web app interfaces, and design systems from prompts.';

function normalizeSiteUrl(raw?: string | null) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return '';
    return trimmed.replace(/\/+$/, '');
}

export function getSiteUrl() {
    const envUrl = normalizeSiteUrl(import.meta.env.VITE_SITE_URL as string | undefined);
    if (envUrl) return envUrl;
    if (typeof window !== 'undefined' && window.location.origin) {
        return normalizeSiteUrl(window.location.origin);
    }
    return 'http://localhost:5173';
}

function ensureHeadElement<T extends HTMLMetaElement | HTMLLinkElement>(
    selector: MetaSelector
): T {
    const query = `${selector.tag}[${selector.attr}="${selector.value}"]`;
    let element = document.head.querySelector(query) as T | null;
    if (element) return element;

    element = document.createElement(selector.tag) as T;
    element.setAttribute(selector.attr, selector.value);
    document.head.appendChild(element);
    return element;
}

function setMeta(name: string, content: string) {
    const meta = ensureHeadElement<HTMLMetaElement>({ tag: 'meta', attr: 'name', value: name });
    meta.content = content;
}

function setPropertyMeta(property: string, content: string) {
    const meta = ensureHeadElement<HTMLMetaElement>({ tag: 'meta', attr: 'property', value: property });
    meta.content = content;
}

function setLink(rel: string, href: string) {
    const link = ensureHeadElement<HTMLLinkElement>({ tag: 'link', attr: 'rel', value: rel });
    link.href = href;
}

function setOptionalVerification() {
    const verification = String(import.meta.env.VITE_GOOGLE_SITE_VERIFICATION || '').trim();
    if (!verification) return;
    setMeta('google-site-verification', verification);
}

function setStructuredData(items: Array<Record<string, unknown>>) {
    const existing = Array.from(document.head.querySelectorAll('script[data-eazyui-seo-jsonld="true"]'));
    existing.forEach((element) => element.remove());

    items.forEach((item, index) => {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.dataset.eazyuiSeoJsonld = 'true';
        script.dataset.eazyuiSeoJsonldIndex = String(index);
        script.text = JSON.stringify(item);
        document.head.appendChild(script);
    });
}

export function applySeo(config: SeoConfig) {
    const siteUrl = getSiteUrl();
    const canonicalUrl = `${siteUrl}${config.path === '/' ? '' : config.path}`;
    const title = config.title;
    const description = config.description || DEFAULT_DESCRIPTION;
    const robots = config.robots || 'index,follow';
    const ogType = config.ogType || 'website';
    const ogImage = config.ogImage ? (config.ogImage.startsWith('http') ? config.ogImage : `${siteUrl}${config.ogImage}`) : `${siteUrl}/OG-image.png`;

    document.title = title;

    setMeta('description', description);
    setMeta('robots', robots);
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', title);
    setMeta('twitter:description', description);
    setMeta('twitter:image', ogImage);
    setMeta('theme-color', '#101010');

    setPropertyMeta('og:title', title);
    setPropertyMeta('og:description', description);
    setPropertyMeta('og:type', ogType);
    setPropertyMeta('og:url', canonicalUrl);
    setPropertyMeta('og:image', ogImage);
    setPropertyMeta('og:site_name', 'EazyUI');

    setLink('canonical', canonicalUrl);
    setOptionalVerification();
    setStructuredData(config.jsonLd || []);
}
