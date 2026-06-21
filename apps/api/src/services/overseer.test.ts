import assert from 'node:assert/strict';
import test from 'node:test';
import {
    OverseerDecisionSchema,
    enforceOverseerDecision,
    issueActionTicket,
    overseeTurn,
    verifyActionTicket,
} from './overseer.js';

const baseInput = {
    message: '',
    projectExists: true,
    screenNames: ['Dashboard', 'Profile', 'Settings'],
    selectedScreenNames: [] as string[],
};

function decision(overrides: Record<string, unknown>) {
    return OverseerDecisionSchema.parse({
        intent: 'casual_chat',
        action: 'respond',
        confidence: 0.95,
        reason: 'test',
        targets: { screenNames: [] },
        resources: {
            needsScreenHtml: false,
            needsImages: false,
            needsWebContext: false,
            needsDesignPlanner: false,
            maximumScreens: 0,
        },
        confirmationRequired: false,
        ...overrides,
    });
}

test('nullable optional model fields parse as absent values', () => {
    const parsed = OverseerDecisionSchema.parse({
        intent: 'design_advice',
        action: 'respond',
        confidence: 0.9,
        reason: 'advice request',
        assistantResponse: '[p]Use clear hierarchy.[/p]',
        clarificationQuestion: null,
        targets: { screenNames: [] },
        resources: {
            needsScreenHtml: false,
            needsImages: false,
            needsWebContext: false,
            needsDesignPlanner: false,
            maximumScreens: 0,
        },
        confirmationRequired: false,
    });
    assert.equal(parsed.clarificationQuestion, undefined);
});

test('exact greetings respond without model or resources', async () => {
    const result = await overseeTurn({ ...baseInput, message: 'high' });
    assert.equal(result.source, 'deterministic');
    assert.equal(result.decision.action, 'respond');
    assert.deepEqual(result.decision.resources, {
        needsScreenHtml: false,
        needsImages: false,
        needsWebContext: false,
        needsDesignPlanner: false,
        maximumScreens: 0,
    });
});

test('model cannot mutate when user only asks for advice', () => {
    const result = enforceOverseerDecision(
        { ...baseInput, message: 'How should my dashboard hierarchy work?' },
        decision({ intent: 'generate_screens', action: 'generate', resources: { maximumScreens: 2 } }),
    );
    assert.equal(result.action, 'clarify');
    assert.equal(result.resources.maximumScreens, 0);
});

test('explicit generation uses the requested count and preserves requested new screen names', () => {
    const result = enforceOverseerDecision(
        { ...baseInput, message: 'Create a profile screen now' },
        decision({
            intent: 'generate_screens',
            action: 'generate',
            confidence: 0.96,
            targets: { screenNames: ['New Profile'] },
            resources: { maximumScreens: 4 },
        }),
    );
    assert.equal(result.action, 'generate');
    assert.deepEqual(result.targets.screenNames, ['New Profile']);
    assert.equal(result.resources.maximumScreens, 1);
});

test('direct design command overrides an assistant-style under-classification', () => {
    const result = enforceOverseerDecision(
        { ...baseInput, message: 'Okay, I need you to design one screen. It should be the splash screen of a recipe generator app.' },
        decision({
            intent: 'design_advice',
            action: 'respond',
            confidence: 0.91,
            assistantResponse: 'I can help you plan that.',
        }),
    );
    assert.equal(result.intent, 'generate_screens');
    assert.equal(result.action, 'generate');
    assert.equal(result.resources.maximumScreens, 1);
});

test('design questions remain read-only', () => {
    const result = enforceOverseerDecision(
        { ...baseInput, message: 'How should I design a dashboard screen?' },
        decision({ intent: 'design_advice', action: 'respond', assistantResponse: 'Use a clear hierarchy.' }),
    );
    assert.equal(result.action, 'respond');
});

test('short approval inherits the preceding explicit generation request', () => {
    const result = enforceOverseerDecision(
        {
            ...baseInput,
            message: 'surprise me',
            recentMessages: [
                { role: 'user', content: 'Design one splash screen for a recipe generator app.' },
                { role: 'assistant', content: 'Do you have a visual preference?' },
            ],
        },
        decision({ intent: 'clarify', action: 'clarify', clarificationQuestion: 'What style?' }),
    );
    assert.equal(result.action, 'generate');
    assert.equal(result.resources.maximumScreens, 1);
});

test('edit needs an exact existing target', () => {
    const missing = enforceOverseerDecision(
        { ...baseInput, message: 'Edit the screen spacing' },
        decision({ intent: 'edit_screens', action: 'edit', confidence: 0.95, targets: { screenNames: ['Unknown'] } }),
    );
    assert.equal(missing.action, 'clarify');

    const exact = enforceOverseerDecision(
        { ...baseInput, message: 'Edit the Profile screen spacing' },
        decision({ intent: 'edit_screens', action: 'edit', confidence: 0.95, targets: { screenNames: ['profile'] } }),
    );
    assert.equal(exact.action, 'edit');
    assert.deepEqual(exact.targets.screenNames, ['Profile']);
});

test('explicit commands override low model confidence and batch edits require confirmation', () => {
    const low = enforceOverseerDecision(
        { ...baseInput, message: 'Create a settings screen' },
        decision({ intent: 'generate_screens', action: 'generate', confidence: 0.4, resources: { maximumScreens: 1 } }),
    );
    assert.equal(low.action, 'generate');

    const batch = enforceOverseerDecision(
        { ...baseInput, message: 'Edit Dashboard and Profile typography' },
        decision({ intent: 'edit_screens', action: 'edit', confidence: 0.96, targets: { screenNames: ['Dashboard', 'Profile'] } }),
    );
    assert.equal(batch.action, 'edit');
    assert.equal(batch.confirmationRequired, true);
});

test('plan-only mode authorizes planning but never project mutation', () => {
    const result = enforceOverseerDecision(
        { ...baseInput, message: 'Create a checkout flow', requestedMode: 'plan' },
        decision({ intent: 'generate_screens', action: 'generate', confidence: 0.99, resources: { maximumScreens: 3 } }),
    );
    assert.equal(result.intent, 'plan_screens');
    assert.equal(result.action, 'plan');
    assert.equal(result.resources.needsDesignPlanner, true);
    assert.equal(result.resources.maximumScreens, 0);
    assert.equal(result.confirmationRequired, false);
});

test('signed tickets bind user, scope, and resource cap', () => {
    process.env.OVERSEER_TICKET_SECRET = 'test-secret-that-is-long-enough-for-hmac';
    const approved = decision({
        intent: 'generate_screens',
        action: 'generate',
        confidence: 1,
        resources: { maximumScreens: 2 },
    });
    const ticket = issueActionTicket('user-1', 'Create two screens', approved);
    assert.ok(ticket);
    const payload = verifyActionTicket(ticket!, 'user-1', 'generate');
    assert.equal(payload.maximumScreens, 2);
    assert.throws(() => verifyActionTicket(ticket!, 'user-2', 'generate'));
    assert.throws(() => verifyActionTicket(ticket!, 'user-1', 'generate_image'));
});
