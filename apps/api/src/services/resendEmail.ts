import { Resend } from 'resend';

const RESEND_API_KEY = String(process.env.RESEND_API_KEY || '').trim();
const RESEND_FROM_EMAIL = String(process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev').trim();
const RESEND_AUDIENCE_EMAIL = String(process.env.RESEND_AUDIENCE_EMAIL || 'davisdukes18@gmail.com').trim();

let resendClient: Resend | null = null;

function getResendClient(): Resend {
    if (!RESEND_API_KEY) {
        throw new Error('RESEND_API_KEY is not configured. Replace re_xxxxxxxxx with your real API key.');
    }
    if (!resendClient) {
        resendClient = new Resend(RESEND_API_KEY);
    }
    return resendClient;
}

export function getResendConfigSummary() {
    return {
        configured: Boolean(RESEND_API_KEY),
        fromEmail: RESEND_FROM_EMAIL,
        audienceEmail: RESEND_AUDIENCE_EMAIL,
    };
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function inferDisplayName(email: string): string {
    const local = email.split('@')[0] || 'there';
    const normalized = local.replace(/[._-]+/g, ' ').trim();
    if (!normalized) return 'there';
    return normalized
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function renderEmailShell(params: {
    eyebrow: string;
    title: string;
    intro: string;
    bullets: string[];
    closing: string;
}) {
    const bulletsHtml = params.bullets
        .map((bullet) => `<li style="margin:0 0 10px;">${escapeHtml(bullet)}</li>`)
        .join('');

    return `
        <div style="margin:0;background:#0b0d12;padding:32px 16px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#e8ecf2;">
            <div style="max-width:620px;margin:0 auto;border:1px solid #2A3140;border-radius:24px;overflow:hidden;background:linear-gradient(180deg,#171717 0%,#111318 100%);">
                <div style="padding:28px 28px 12px;background:radial-gradient(circle at top right, rgba(99,102,241,0.26), rgba(23,23,23,0) 38%);">
                    <div style="display:inline-block;padding:7px 12px;border:1px solid rgba(255,255,255,0.08);border-radius:999px;background:rgba(255,255,255,0.04);font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8B95A5;">
                        ${escapeHtml(params.eyebrow)}
                    </div>
                    <h1 style="margin:18px 0 12px;font-size:34px;line-height:1.02;letter-spacing:-0.05em;color:#E8ECF2;">
                        ${escapeHtml(params.title)}
                    </h1>
                    <p style="margin:0;font-size:15px;line-height:1.8;color:#c8d0db;">
                        ${escapeHtml(params.intro)}
                    </p>
                </div>
                <div style="padding:10px 28px 28px;">
                    <div style="margin-top:14px;padding:18px 18px 8px;border-radius:18px;background:#1b1b1b;border:1px solid rgba(255,255,255,0.05);">
                        <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.7;color:#dbe3ee;">
                            ${bulletsHtml}
                        </ul>
                    </div>
                    <p style="margin:18px 0 0;font-size:14px;line-height:1.8;color:#9ca7b6;">
                        ${escapeHtml(params.closing)}
                    </p>
                    <div style="margin-top:22px;padding-top:18px;border-top:1px solid rgba(255,255,255,0.06);font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#5A6472;">
                        EazyUI
                    </div>
                </div>
            </div>
        </div>
    `;
}

export async function sendNewsletterSignupEmail(email: string) {
    const resend = getResendClient();
    const cleanEmail = email.trim().toLowerCase();
    const displayName = inferDisplayName(cleanEmail);

    const [ownerDelivery] = await Promise.all([
        resend.emails.send({
            from: RESEND_FROM_EMAIL,
            to: RESEND_AUDIENCE_EMAIL,
            subject: 'New EazyUI newsletter signup',
            html: `
                <p>A new newsletter signup was submitted from the landing page.</p>
                <p><strong>Email:</strong> ${cleanEmail}</p>
            `,
        }),
        resend.emails.send({
            from: RESEND_FROM_EMAIL,
            to: cleanEmail,
            subject: `${displayName}, you’re on the EazyUI list`,
            html: renderEmailShell({
                eyebrow: 'Newsletter',
                title: `Welcome, ${displayName}`,
                intro: 'You are officially subscribed to EazyUI updates. We will send sharper product news, design workflow drops, and meaningful releases instead of inbox filler.',
                bullets: [
                    'Major feature launches and product changes',
                    'Better prompting and UI generation workflow ideas',
                    'Selected experiments, references, and launch notes from the team',
                ],
                closing: 'Thanks for joining early. We will keep the emails useful.',
            }),
        }),
    ]);

    return ownerDelivery;
}

export async function sendAccountCreationWelcomeEmail(email: string) {
    const resend = getResendClient();
    const cleanEmail = email.trim().toLowerCase();
    const displayName = inferDisplayName(cleanEmail);

    return resend.emails.send({
        from: RESEND_FROM_EMAIL,
        to: cleanEmail,
        subject: `Welcome to EazyUI, ${displayName}`,
        html: renderEmailShell({
            eyebrow: 'Account Created',
            title: `Your EazyUI account is ready`,
            intro: 'You can now start generating screens, exploring directions faster, and turning rough product ideas into stronger UI first passes.',
            bullets: [
                'Start with a plain-language prompt and generate your first concepts',
                'Use references to push output closer to your product direction',
                'Iterate quickly across mobile, tablet, and desktop layouts',
            ],
            closing: 'Thanks for creating an account. We built EazyUI to help you move faster without lowering your design bar.',
        }),
    });
}
