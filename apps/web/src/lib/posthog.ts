import posthog from 'posthog-js';

const POSTHOG_KEY = (import.meta.env.VITE_POSTHOG_KEY as string | undefined)?.trim();
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined)?.trim() || 'https://us.i.posthog.com';

let initialized = false;
let lastTrackedUrl = '';

function getClient() {
    if (!POSTHOG_KEY || typeof window === 'undefined') return null;
    if (!initialized) {
        posthog.init(POSTHOG_KEY, {
            api_host: POSTHOG_HOST,
            autocapture: true,
            capture_pageleave: true,
            capture_pageview: false,
            person_profiles: 'identified_only',
        });
        initialized = true;
    }
    return posthog;
}

export function initPostHog() {
    getClient();
}

export function capturePostHogPageview() {
    const client = getClient();
    if (!client || typeof window === 'undefined') return;

    const url = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (lastTrackedUrl === url) return;
    lastTrackedUrl = url;

    client.capture('$pageview', {
        $current_url: window.location.href,
        hash: window.location.hash,
        pathname: window.location.pathname,
        search: window.location.search,
    });
}

export function capturePostHogEvent(eventName: string, properties?: Record<string, unknown>) {
    const client = getClient();
    if (!client) return;
    client.capture(eventName, properties);
}

export function identifyPostHogUser(userId: string, properties?: Record<string, unknown>) {
    const client = getClient();
    if (!client) return;
    client.identify(userId, properties);
}

export function resetPostHogUser() {
    const client = getClient();
    if (!client) return;
    client.reset();
}
