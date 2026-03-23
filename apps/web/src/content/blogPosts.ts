const blogCoverModules = import.meta.glob('../assets/blog-img/*.{jpg,jpeg,png,webp,avif}', {
    eager: true,
    import: 'default',
}) as Record<string, string>;

function hashString(value: string) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function createSeededRandom(seed: number) {
    let state = seed >>> 0 || 1;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function shuffleWithSeed<T>(items: T[], seed: number) {
    const random = createSeededRandom(seed);
    const output = [...items];
    for (let index = output.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
    }
    return output;
}

const BLOG_COVER_POOL = (() => {
    const covers = Object.entries(blogCoverModules)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([, src]) => src)
        .filter(Boolean);

    if (covers.length === 0) return [];
    const seed = covers.reduce((accumulator, src, index) => (
        accumulator ^ hashString(`${src}:${index}`)
    ), 0x9e3779b9);
    return shuffleWithSeed(covers, seed);
})();

function getCoverImageForIndex(index: number) {
    if (BLOG_COVER_POOL.length === 0) return '';
    return BLOG_COVER_POOL[index % BLOG_COVER_POOL.length];
}

export type BlogCategory = 'Prompting' | 'Workflow' | 'Comparisons' | 'SEO';

export type BlogSection = {
    heading: string;
    paragraphs: string[];
};

export type BlogPost = {
    slug: string;
    title: string;
    seoTitle: string;
    seoDescription: string;
    coverImage: string;
    category: BlogCategory;
    excerpt: string;
    readTime: string;
    publishedAt: string;
    eyebrow: string;
    status: string;
    accent: {
        a: string;
        b: string;
        c: string;
        d: string;
    };
    tags: string[];
    sections: BlogSection[];
};

export const BLOG_POSTS: BlogPost[] = [
    {
        slug: 'prompt-engineering-for-ai-landing-pages',
        title: 'Prompt Engineering for AI Landing Pages That Feel Intentional',
        seoTitle: 'Prompt Engineering for AI Landing Pages | EazyUI Blog',
        seoDescription: 'Learn how to write prompts for AI landing pages that produce stronger hierarchy, sharper messaging, and better first-pass design quality.',
        coverImage: getCoverImageForIndex(0),
        category: 'Prompting',
        excerpt: 'A practical framework for asking AI for structure, hierarchy, tone, and conversion-focused landing page decisions without getting generic output back.',
        readTime: '8 min read',
        publishedAt: 'March 18, 2026',
        eyebrow: 'Prompting guide',
        status: 'Featured',
        accent: {
            a: '#01a6cb',
            b: '#184f7a',
            c: '#2c2244',
            d: '#0f0f0f',
        },
        tags: ['AI landing page builder', 'prompt engineering', 'website design'],
        sections: [
            {
                heading: 'Start with outcome, not adjectives',
                paragraphs: [
                    'Most weak prompts fail before the visual system even begins. The problem is not that the request is too short. The problem is that it is vague in the wrong places. Asking for a landing page that is modern, clean, and premium usually produces a surface-level visual style, but it does not define what the page must accomplish.',
                    'A stronger prompt starts with the job of the page. Is it trying to sell a SaaS product to founders? Is it trying to get demo requests from enterprise teams? Is it positioning a new product category? Once that intent is explicit, the AI has a clearer frame for structuring the hero, feature ordering, trust proof, and call-to-action rhythm.',
                ],
            },
            {
                heading: 'Define hierarchy and content blocks explicitly',
                paragraphs: [
                    'The most reliable way to improve first-pass quality is to describe the information hierarchy you want. Instead of saying design a landing page for an AI tool, say create a landing page with a hero, product proof, workflow explanation, testimonials, pricing, and a final CTA. That tells the model how many sections to plan and how they should relate to each other.',
                    'This matters because layout quality is rarely just a styling issue. It is usually a sequencing issue. Good landing pages feel persuasive because the sections answer objections in the right order. When your prompt includes section priorities, the output tends to feel more like a real marketing page and less like a stitched collection of random blocks.',
                ],
            },
            {
                heading: 'Describe the right constraints',
                paragraphs: [
                    'Prompting gets much better when you include the constraints a human designer would care about. Mention the target device, the audience sophistication, the pricing model, the brand tone, and whether the page should feel quiet and editorial or bold and conversion-driven. These are not cosmetic details. They shape spacing, typography, information density, and CTA intensity.',
                    'A useful mental model is this: the AI is not only styling a page, it is making product-marketing decisions. The more clearly you define the product context, the less it has to guess. That usually means fewer generic gradients, fewer filler headlines, and stronger section logic.',
                ],
            },
            {
                heading: 'Use reference-led prompting when the first pass matters',
                paragraphs: [
                    'If you already know the direction you want, references are one of the fastest ways to raise the floor. A screenshot, a visual system, or a competitor page gives the model a real frame for composition. Used well, references do not limit originality. They reduce ambiguity.',
                    'The goal is not to copy. The goal is to give the AI a clearer sense of rhythm, spacing, emphasis, and density. For marketing teams, this is usually the difference between a rough concept and something serious enough to review with stakeholders.',
                ],
            },
        ],
    },
    {
        slug: 'reference-led-prompts-for-better-ui-first-passes',
        title: 'Reference-Led Prompts for Better UI First Passes',
        seoTitle: 'Reference-Led Prompts for Better AI UI First Passes | EazyUI Blog',
        seoDescription: 'See how screenshots, visual systems, and product references improve the first-pass quality of AI-generated UI and landing pages.',
        coverImage: getCoverImageForIndex(1),
        category: 'Prompting',
        excerpt: 'Why references dramatically improve AI-generated interfaces, and how to use them without flattening originality or brand voice.',
        readTime: '7 min read',
        publishedAt: 'March 16, 2026',
        eyebrow: 'Workflow note',
        status: 'Current',
        accent: {
            a: '#7f2cff',
            b: '#01a6cb',
            c: '#472457',
            d: '#0f0f0f',
        },
        tags: ['AI UI design', 'references', 'first pass quality'],
        sections: [
            {
                heading: 'References reduce ambiguity',
                paragraphs: [
                    'A strong screenshot or interface reference gives the model a concrete answer to questions your prompt may not cover. How dense should the layout feel? How restrained should the typography be? How much contrast should sit between cards and background? These details are difficult to describe well in pure text.',
                    'When a reference is present, the AI has a stronger visual anchor. That does not guarantee quality, but it usually improves consistency. The first pass is less likely to drift into a generic style because the model can infer structure and tone from something specific.',
                ],
            },
            {
                heading: 'Use references for system cues, not visual cloning',
                paragraphs: [
                    'The most effective references are not always the prettiest ones. The best references are the ones that express the design behavior you want: hierarchy, spacing, modularity, pricing layout, card rhythm, and navigation balance. Those cues are more valuable than the exact palette or decorative flourishes.',
                    'This is where teams often get better results by combining a descriptive prompt with one or two targeted references. The prompt says what the product is and what the page needs to do. The references help the model understand how the interface should feel when it solves that job.',
                ],
            },
            {
                heading: 'Build a reusable reference library',
                paragraphs: [
                    'Once you find references that reliably produce better output, save them. Over time, that library becomes part of your workflow system. Product teams that do this well do not start each project from zero. They begin from known patterns that already map to their taste and review standards.',
                    'This also improves cross-functional communication. Designers, PMs, and marketers can point to the same references when discussing what premium, conversion-focused, editorial, or product-heavy actually means in practice.',
                ],
            },
        ],
    },
    {
        slug: 'ai-landing-page-builder-vs-traditional-design-workflow',
        title: 'AI Landing Page Builder vs. Traditional Design Workflow',
        seoTitle: 'AI Landing Page Builder vs Traditional Design Workflow | EazyUI Blog',
        seoDescription: 'A practical comparison of AI landing page builders and traditional design workflows, including where AI speeds teams up and where human judgment still matters most.',
        coverImage: getCoverImageForIndex(2),
        category: 'Comparisons',
        excerpt: 'A grounded comparison of where AI speeds up website design, where it still needs human direction, and how teams can combine both without lowering quality.',
        readTime: '9 min read',
        publishedAt: 'March 14, 2026',
        eyebrow: 'Comparison',
        status: 'Popular',
        accent: {
            a: '#ff4f7a',
            b: '#7a284d',
            c: '#3c4a92',
            d: '#0f0f0f',
        },
        tags: ['AI landing page builder', 'design workflow', 'product teams'],
        sections: [
            {
                heading: 'Where AI clearly wins',
                paragraphs: [
                    'AI is strongest at acceleration. It shortens the time between an idea and a visible direction. That matters in product and marketing because teams rarely need a blank file. They need options to react to. An AI landing page builder can generate hero directions, structure alternatives, pricing treatments, and section flows much faster than a fully manual process.',
                    'This changes the shape of early-stage work. Instead of spending all the time on initial composition, teams can spend more of their time evaluating, editing, and refining. In practical terms, that means a faster first review loop and better decision-making velocity.',
                ],
            },
            {
                heading: 'Where human judgment still matters',
                paragraphs: [
                    'AI does not remove the need for design judgment. It compresses the cost of drafting, but it still benefits from clear priorities, strong references, and someone who can recognize whether the page actually solves the problem. Messaging, conversion strategy, and brand nuance still require human direction.',
                    'That is why the most productive teams do not ask whether AI replaces design. They ask how AI changes what designers and marketers spend their time on. In many cases, the answer is that humans move up the stack into direction, critique, and final polish.',
                ],
            },
            {
                heading: 'The best workflow is hybrid',
                paragraphs: [
                    'The most effective pattern is not AI-only and not manual-only. It is a hybrid workflow where AI handles fast ideation and structured variation, while humans steer positioning, refine hierarchy, and protect brand quality. That gives you speed without surrendering standards.',
                    'This is especially useful for startups and lean teams. You can explore more ideas in the same week, without pretending every output is ready to ship untouched. The real win is not speed alone. It is faster access to better decisions.',
                ],
            },
        ],
    },
    {
        slug: 'turning-ai-ui-outputs-into-build-ready-specs',
        title: 'Turning AI UI Outputs into Build-Ready Specs',
        seoTitle: 'Turn AI UI Outputs into Build-Ready Specs | EazyUI Blog',
        seoDescription: 'Learn how to turn AI-generated UI concepts into build-ready product specs that designers and frontend engineers can actually use.',
        coverImage: getCoverImageForIndex(3),
        category: 'Workflow',
        excerpt: 'How to move from attractive generated screens to something a product team and frontend engineer can actually review, scope, and build.',
        readTime: '10 min read',
        publishedAt: 'March 12, 2026',
        eyebrow: 'Team workflow',
        status: 'Current',
        accent: {
            a: '#00c98d',
            b: '#136f6d',
            c: '#1c3d5c',
            d: '#0f0f0f',
        },
        tags: ['build-ready UI', 'frontend handoff', 'AI workflow'],
        sections: [
            {
                heading: 'A nice mock is not a usable spec',
                paragraphs: [
                    'Generated UI often looks convincing before it becomes operationally useful. The gap usually appears when teams try to answer practical questions. What states exist? Which modules are reusable? What does mobile do differently? How should spacing respond to content changes? These details are what make a screen buildable.',
                    'The handoff step is where a lot of AI-generated work either matures or stalls. If you stop at a polished screenshot, engineering still has to infer the system. If you push the output into a clearer set of decisions, the handoff becomes dramatically more efficient.',
                ],
            },
            {
                heading: 'Capture intent, not just appearance',
                paragraphs: [
                    'A build-ready spec should explain why important parts of the layout exist. What is the primary action? What information is supporting? Which sections are fixed and which are modular? This context helps the frontend team make good implementation decisions without guessing.',
                    'A practical approach is to annotate the generated screen after the first pass. Note the role of each major block, define interaction states, and call out where copy, spacing, or hierarchy are still provisional. That keeps the conversation grounded in decisions instead of surface polish alone.',
                ],
            },
            {
                heading: 'Use AI to accelerate refinement too',
                paragraphs: [
                    'AI is not only helpful at the generation step. It can also help refine the spec itself. Once you know the missing pieces, you can prompt for edge states, responsive variants, improved hierarchy, or more coherent component logic. That turns a static concept into something closer to a system.',
                    'Teams that work this way usually get more value from AI because they use it as an iterative partner, not just a one-shot image machine. The best results come from repeated loops of generation, critique, clarification, and refinement.',
                ],
            },
        ],
    },
    {
        slug: 'seo-friendly-landing-pages-generated-with-ai',
        title: 'How to Create SEO-Friendly Landing Pages with AI',
        seoTitle: 'Create SEO-Friendly Landing Pages with AI | EazyUI Blog',
        seoDescription: 'A practical guide to creating AI-generated landing pages that support search visibility through stronger structure, copy depth, and page intent.',
        coverImage: getCoverImageForIndex(4),
        category: 'SEO',
        excerpt: 'How to use AI to generate landing pages that still support search visibility through clearer intent, better copy, and stronger structure.',
        readTime: '8 min read',
        publishedAt: 'March 10, 2026',
        eyebrow: 'SEO',
        status: 'Featured',
        accent: {
            a: '#f7b733',
            b: '#fc4a1a',
            c: '#614385',
            d: '#0f0f0f',
        },
        tags: ['SEO landing pages', 'AI content', 'search visibility'],
        sections: [
            {
                heading: 'Start with search intent, not only design direction',
                paragraphs: [
                    'A landing page can look excellent and still struggle in search if it does not clearly match what someone is trying to find. This is one of the biggest mistakes in AI-generated marketing work. The page is optimized for visual impression, but not for query intent.',
                    'The fix is straightforward. Before generating the page, define the exact search intent the page should satisfy. Is it about AI landing page pricing, templates, prompt guides, or comparisons? The answer should influence the headline, section order, copy depth, and supporting proof points.',
                ],
            },
            {
                heading: 'Use AI for structure, then add real information',
                paragraphs: [
                    'AI is useful for scaffolding the page. It can propose section flow, CTA rhythm, and headline directions quickly. But search visibility tends to improve when the content includes concrete detail: examples, comparisons, specifics, and clear explanation of what the product actually does.',
                    'That means the best SEO workflow is usually two-step. First, generate the structure and visual system. Then enrich the copy with real detail that answers searcher questions directly. This is how you avoid pages that look polished but say very little.',
                ],
            },
            {
                heading: 'Support discovery with a content system',
                paragraphs: [
                    'One homepage cannot rank for every useful term. That is why AI-generated sites benefit from a supporting content layer. A blog, comparison pages, prompt guides, and practical workflows give the site more surface area to rank for long-tail searches.',
                    'This is where AI becomes powerful again. Once the core positioning is clear, it can help teams generate outlines, first drafts, and design directions for supporting pages faster. The search advantage comes from coverage and specificity, not from stuffing more keywords into one page.',
                ],
            },
        ],
    },
    {
        slug: 'pricing-pages-that-convert-with-ai-design',
        title: 'Pricing Pages That Convert with AI Design Workflows',
        seoTitle: 'Pricing Pages That Convert with AI Design Workflows | EazyUI Blog',
        seoDescription: 'Learn how to design clearer pricing pages with AI by focusing on plan contrast, decision clarity, and the objections buyers actually have.',
        coverImage: getCoverImageForIndex(5),
        category: 'Workflow',
        excerpt: 'A practical look at using AI to design pricing pages that are easier to compare, easier to trust, and better aligned with real buying questions.',
        readTime: '7 min read',
        publishedAt: 'March 8, 2026',
        eyebrow: 'Conversion',
        status: 'Current',
        accent: {
            a: '#21d4fd',
            b: '#b721ff',
            c: '#2b1055',
            d: '#0f0f0f',
        },
        tags: ['pricing page design', 'AI landing page builder', 'conversion'],
        sections: [
            {
                heading: 'Pricing pages fail when choice feels noisy',
                paragraphs: [
                    'A pricing page is a decision page, not just a feature showcase. The core job is to help the right buyer quickly understand which plan matches their situation. AI can generate attractive pricing layouts, but the page performs better when the prompt makes comparison clarity the primary objective.',
                    'That means describing what the buyer needs to understand at a glance: the plan differences, who each plan is for, what is included, and what changes at higher tiers. When those priorities are explicit, the output usually becomes cleaner and more useful.',
                ],
            },
            {
                heading: 'Prompt for objections, not just tiers',
                paragraphs: [
                    'A strong pricing page answers objections before they slow the user down. Is there a free plan? Can credits roll over? Is the product for solo use or team use? Does the page explain what changes as usage increases? These are the practical questions real buyers ask.',
                    'If your prompt includes those concerns, the resulting layout tends to include stronger comparison tables, plan positioning, and supporting explanations. In other words, the AI can structure the persuasion more effectively when you tell it what uncertainty needs to be resolved.',
                ],
            },
            {
                heading: 'Use pricing as part of the whole journey',
                paragraphs: [
                    'Pricing pages rarely work in isolation. They convert better when they inherit trust from the rest of the site. Product proof, testimonials, workflow examples, and cleaner feature narratives all raise confidence before the buyer reaches the plan table.',
                    'That is why pricing should be generated and refined as part of the full site story, not as an isolated artifact. AI can help teams move faster here, but only if the pricing page is treated as one step in a broader conversion journey.',
                ],
            },
        ],
    },
] as const;

export function getBlogPostBySlug(slug: string) {
    return BLOG_POSTS.find((post) => post.slug === slug) || null;
}

export function getRelatedBlogPosts(slug: string, limit = 3) {
    return BLOG_POSTS.filter((post) => post.slug !== slug).slice(0, limit);
}
