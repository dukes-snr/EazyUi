import { PostHog } from 'posthog-node';

const POSTHOG_API_KEY = String(process.env.POSTHOG_API_KEY || process.env.VITE_POSTHOG_KEY || '').trim();
const POSTHOG_HOST = String(process.env.POSTHOG_HOST || process.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com').trim();

let posthogClient: PostHog | null = null;

function getPostHogClient(): PostHog | null {
    if (!POSTHOG_API_KEY) return null;
    if (!posthogClient) {
        posthogClient = new PostHog(POSTHOG_API_KEY, {
            host: POSTHOG_HOST,
        });
    }
    return posthogClient;
}

export function captureServerAnalyticsEvent(input: {
    distinctId: string;
    event: string;
    properties?: Record<string, unknown>;
}) {
    const client = getPostHogClient();
    const distinctId = input.distinctId.trim();
    if (!client || !distinctId) return;

    client.capture({
        distinctId,
        event: input.event,
        properties: input.properties,
    });
}

export async function shutdownPostHog() {
    if (!posthogClient) return;

    const client = posthogClient as PostHog & { _shutdown?: (shutdownTimeoutMs?: number) => Promise<void> };
    posthogClient = null;

    if (typeof client._shutdown === 'function') {
        await client._shutdown(5000);
    }
}
