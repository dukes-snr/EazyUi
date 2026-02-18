export type UserFacingError = {
    title: string;
    summary: string;
    actions: string[];
};

function normalizeMessage(input: unknown): string {
    if (input instanceof Error) return input.message || 'Unknown error';
    if (typeof input === 'string') return input;
    if (input && typeof input === 'object' && 'message' in (input as any)) {
        const message = (input as any).message;
        if (typeof message === 'string') return message;
    }
    return 'Unknown error';
}

function contains(text: string, pattern: RegExp): boolean {
    return pattern.test(text);
}

function mapGeminiLikeError(message: string): UserFacingError {
    const lower = message.toLowerCase();

    if (contains(lower, /api key was reported as leaked|reported as leaked/)) {
        return {
            title: 'Your API key is blocked',
            summary: 'This API key was flagged as leaked and can no longer be used.',
            actions: [
                'Create a new Gemini API key in Google AI Studio.',
                'Update your server environment with the new key.',
                'Remove exposed keys from public repos or logs.',
            ],
        };
    }

    if (contains(lower, /api key|gemini_api_key is not configured|unauthorized|invalid api key|permission denied/)) {
        return {
            title: 'API key or access issue',
            summary: 'The model request could not be authorized.',
            actions: [
                'Verify the API key is present and valid.',
                'Ensure the key has access to the requested model/features.',
                'If using tuned/private models, confirm proper authentication.',
            ],
        };
    }

    if (contains(lower, /\b400\b|invalid_argument|malformed|failed_precondition|messages\[\d+\]\.content must be a string/)) {
        return {
            title: 'Request format issue',
            summary: 'The request payload format is invalid for the selected model or endpoint.',
            actions: [
                'Retry with a simpler prompt or fewer attachments.',
                'Check that model and API version support the used features.',
                'If this persists, switch model and retry.',
            ],
        };
    }

    if (contains(lower, /\b403\b|permission_denied/)) {
        return {
            title: 'Permission denied',
            summary: 'Your project or key does not have required permissions for this request.',
            actions: [
                'Check model access in your account/project.',
                'Verify billing/auth setup for restricted features.',
                'Use a model your current key is allowed to call.',
            ],
        };
    }

    if (contains(lower, /\b404\b|not_found/)) {
        return {
            title: 'Requested resource not found',
            summary: 'A model, file, or endpoint parameter in the request could not be found.',
            actions: [
                'Confirm the model id is valid and available.',
                'Check referenced files/images still exist.',
                'Retry after removing invalid references.',
            ],
        };
    }

    if (contains(lower, /\b429\b|resource_exhausted|rate limit|quota/)) {
        return {
            title: 'Rate limit reached',
            summary: 'Too many requests were sent in a short time or quota was exceeded.',
            actions: [
                'Wait a moment and retry.',
                'Switch to a lighter/faster model for now.',
                'Increase quota or use a paid plan if needed.',
            ],
        };
    }

    if (contains(lower, /\b500\b|internal/)) {
        return {
            title: 'Temporary model error',
            summary: 'The model provider returned an internal error.',
            actions: [
                'Retry in a few seconds.',
                'Reduce prompt/context size and retry.',
                'Try another model if available.',
            ],
        };
    }

    if (contains(lower, /\b503\b|unavailable|overloaded/)) {
        return {
            title: 'Service temporarily unavailable',
            summary: 'The model service is temporarily overloaded.',
            actions: [
                'Retry shortly.',
                'Switch to another model temporarily.',
                'Keep prompt shorter while service is under load.',
            ],
        };
    }

    if (contains(lower, /\b504\b|deadline_exceeded|timeout|timed out|econnreset|fetch failed/)) {
        return {
            title: 'Request timed out',
            summary: 'The request took too long or the connection dropped.',
            actions: [
                'Retry the request.',
                'Use a shorter prompt or fewer images.',
                'Try a faster model for this step.',
            ],
        };
    }

    if (contains(lower, /blockedreason|safety|blocked|terms of service/)) {
        return {
            title: 'Request blocked by safety policy',
            summary: 'The provider blocked this request based on safety/policy checks.',
            actions: [
                'Rephrase the prompt with neutral wording.',
                'Remove sensitive or ambiguous phrases.',
                'Retry with a clearer product-design intent.',
            ],
        };
    }

    return {
        title: 'Request failed',
        summary: 'The model could not complete this request.',
        actions: [
            'Retry once.',
            'Try a shorter prompt or fewer attachments.',
            'Switch model and retry if available.',
        ],
    };
}

export function getUserFacingError(error: unknown): UserFacingError {
    const message = normalizeMessage(error);
    return mapGeminiLikeError(message);
}

export function toTaggedErrorMessage(error: unknown): string {
    const mapped = getUserFacingError(error);
    return `[h2]${mapped.title}[/h2]
[p]${mapped.summary}[/p]
[h3]What you can do[/h3]
${mapped.actions.map((item) => `[li]${item}[/li]`).join('\n')}`;
}

