# Onboarding Guide Implementation Plan

## Goal

Add a first-run guide system that helps new users understand what to click and why when they first encounter important parts of the app.

The guide should:
- show only when useful
- point at real UI targets
- work across workspace, chat, edit, and assets flows
- persist per device so users are not repeatedly interrupted

## Product Scope

Start with small contextual guides instead of one long product tour.

Recommended first guides:
- `workspace-first-run`
- `chat-first-run`
- `edit-panel-first-run`
- `assets-first-run`

Each guide should stay between 2 and 4 steps.

## Implementation Approach

### 1. Add onboarding state management

Create:
- `apps/web/src/stores/onboarding-store.ts`

Use Zustand with `localStorage`, following the same pattern already used in `ui-store.ts`.

State should include:
- active guide id
- current step index
- completed guide ids
- skipped guide ids
- dismissed guide ids if needed

Actions should include:
- `startGuide`
- `nextStep`
- `prevStep`
- `completeGuide`
- `skipGuide`
- `resetGuide`
- `resetAllGuides` for testing

Suggested storage keys:
- `eazyui:onboarding:completed`
- `eazyui:onboarding:skipped`

### 2. Add a guide definition file

Create:
- `apps/web/src/constants/onboardingGuides.ts`

Define guides as data, not inline logic.

Suggested step shape:

```ts
type GuideStep = {
  id: string;
  route: string;
  targetId: string;
  title: string;
  body: string;
  placement?: 'top' | 'right' | 'bottom' | 'left';
  requireClick?: boolean;
  requireRoute?: string;
};
```

### 3. Mark real UI targets

Use stable attributes:
- `data-guide-id="workspace-project-list"`
- `data-guide-id="chat-composer"`
- `data-guide-id="edit-assets-tab"`

Do not rely on class names or text content.

Initial targets to tag:
- `ProjectWorkspacePage.tsx`
- `ChatPanel.tsx`
- `EditPanel.tsx`
- asset-related tabs and buttons

### 4. Build one reusable overlay component

Create:
- `apps/web/src/components/ui/CoachmarkOverlay.tsx`

Responsibilities:
- find the current target by `data-guide-id`
- measure it with `getBoundingClientRect()`
- render a dim overlay
- highlight the target area
- place a tooltip card near it
- handle `Next`, `Back`, `Skip`, and `Done`
- remeasure on resize and scroll

Optional visual pieces:
- spotlight mask
- arrow/pointer
- pulse ring around target

### 5. Add a lightweight guide host

Create:
- `apps/web/src/components/ui/OnboardingHost.tsx`

Mount this once near the app shell so guides can work across routes and panels.

Responsibilities:
- read onboarding state
- read current route
- render `CoachmarkOverlay` when a guide is active
- advance or close the guide

### 6. Trigger guides contextually

Do not launch every guide on app load.

Recommended triggers:
- first visit to workspace -> `workspace-first-run`
- first time opening chat composer in app flow -> `chat-first-run`
- first time opening edit panel -> `edit-panel-first-run`
- first time opening assets tab -> `assets-first-run`

Only trigger when:
- the guide has not been completed
- the target route is active
- the target element exists

### 7. Support action-based steps

Some steps should wait for the user to do the real thing.

Examples:
- click `Assets`
- click `Create Project`
- click `Generate`

For those steps:
- do not auto-advance on `Next`
- listen for the expected action
- then move to the next step

### 8. Add a manual reopen entry point

Users should be able to reopen guides later.

Recommended locations:
- profile menu
- help menu
- empty states

Suggested actions:
- `Show workspace guide`
- `Show editor guide`
- `Show assets guide`

### 9. Add analytics hooks later

Useful events:
- guide started
- guide completed
- guide skipped
- step viewed
- step action completed

This can wait until the base system works.

## Suggested Rollout Order

### Phase 1
- onboarding store
- guide definitions
- reusable overlay
- workspace first-run guide

### Phase 2
- chat first-run guide
- edit panel first-run guide

### Phase 3
- assets-specific guide
- manual guide relaunch
- analytics

## File Plan

New files:
- `apps/web/src/stores/onboarding-store.ts`
- `apps/web/src/constants/onboardingGuides.ts`
- `apps/web/src/components/ui/CoachmarkOverlay.tsx`
- `apps/web/src/components/ui/OnboardingHost.tsx`

Existing files likely to change:
- `apps/web/src/stores/index.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/components/marketing/ProjectWorkspacePage.tsx`
- `apps/web/src/components/chat/ChatPanel.tsx`
- `apps/web/src/components/edit/EditPanel.tsx`

## Practical UX Rules

- always include `Skip`
- never block the whole app for too long
- keep copy short and direct
- avoid more than one guide auto-starting in a session
- do not show a guide for hidden or collapsed UI
- prefer context-specific guides over product-wide tours

## Recommended First Deliverable

Implement:
- shared onboarding store
- guide host
- spotlight overlay
- workspace first-run guide with 3 steps
- chat first-run guide with 3 steps

That is enough to validate the system before expanding it to the edit and assets flows.
