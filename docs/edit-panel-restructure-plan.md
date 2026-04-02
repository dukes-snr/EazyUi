# Edit Panel Restructure Plan

## Goal

Restructure edit mode so non-technical users can manipulate generated HTML/Tailwind screens using plain-language controls instead of CSS concepts.

The new editing model should let a user do things like:
- move this up a bit
- center this button
- make this card wider
- add more space between these items
- replace this image
- bring this to the front

without needing to know:
- margin vs padding
- absolute vs relative
- gap vs justify vs align-self
- width mode vs fit-content
- raw Tailwind utility names

## Core Product Decision

The editor should stop treating HTML/CSS as the primary user-facing model.

Instead:
- user intent becomes the main editing API
- HTML + Tailwind become the implementation layer
- advanced CSS-style controls remain available, but behind an `Advanced` section

## Current Constraints

Current local patching is too primitive for layman editing.

Today the patch engine supports only:
- `set_text`
- `set_style`
- `set_attr`
- `set_classes`
- `delete_node`

Current system strengths:
- stable `data-uid` targeting
- immediate patch preview inside iframe
- patch history with undo/redo
- editable HTML generated with Tailwind utilities and semantic tokens

Current gaps:
- no semantic edit operations
- no structural operations like reorder, duplicate, insert, wrap, unwrap
- no Tailwind-aware mutation strategy
- no layout-intent model
- panel is organized around implementation details instead of user tasks

## Current Codebase Findings

Researching the current implementation shows the redesign should be incremental, not a greenfield rewrite.

### What exists today

- `EditPanel.tsx` is currently a large inspector-style panel with raw controls for width, height, rotation, layout mode, position type, offsets, padding, margin, z-index, typography, colors, and image/link attributes
- the current panel writes directly to low-level patches such as `set_text`, `set_style`, `set_attr`, `set_classes`, and `delete_node`
- `EditWorkspaceOverlay.tsx` already gives the app a strong shell for a Figma-like layout: canvas in the middle, layers drawer on the left, editor panel on the right
- `LayersPanel.tsx` already parses the editable HTML tree and supports layer selection by `data-uid`
- `DeviceNode.tsx` already posts useful selection metadata back to the app: `elementType`, `classList`, `attributes`, `inlineStyle`, computed styles, bounding rect, and breadcrumbs
- `htmlToFigmaScene.ts` already performs meaningful scene/layout inference from rendered HTML, including bounds, flex direction, gap, padding, margin, overflow, width mode, height mode, and a `safeAutoLayout` heuristic

### What is missing in the current implementation

- `SelectedElementInfo` does not include parent uid, sibling order, child order, inferred role, repeated-set membership, scroll behavior, or constraint intent
- the iframe patch application path in `DeviceNode.tsx` mirrors the same primitive patch set as `htmlPatcher.ts`, so structural edits need support in both places
- the current panel is monolithic, which makes it harder to ship a beginner-first `Quick Edit` path while preserving existing dev controls
- the app already has a separate shared patch model in `packages/shared/src/types/patch.ts`; the HTML edit patch system should stay clearly separated unless there is a deliberate unification later

### Product implication

The fastest path is:

1. preserve today's inspector as `Advanced`
2. extract a much simpler `Quick Edit` shell on top
3. expand selection metadata and design-graph inference incrementally
4. add structural patch ops only when the UX needs them
5. reuse existing scene/layout inference where possible instead of rebuilding it from zero

## Figma-Like Requirement

The editing experience should behave more like a design tool than a CSS inspector.

For generated screens like the provided budgeting example, the editor should interpret HTML/Tailwind as a design tree made of:
- frames
- stacks / auto-layout containers
- text nodes
- icons
- buttons
- cards
- scroll groups
- fixed bars
- progress indicators

The user should manipulate those design objects directly.

This means:
- selecting a card should feel like selecting a Figma frame
- moving an item in a vertical list should prefer reorder and spacing changes, not raw margin edits
- changing spacing in a flex container should behave like auto-layout gap editing
- resizing a pill/button/card should behave like design resizing, not arbitrary CSS tweaking
- fixed nav bars and anchored sections should retain constraints during edits
- repeated structures should support "edit this one" and later "edit all similar"

## Research Principles From Figma

The redesign should borrow the interaction model that makes Figma feel easy, while translating it into layman language.

### Principle 1: selection drives the UI

Figma's right sidebar changes based on what is selected. This app should do the same.

- selecting text should prioritize text editing, emphasis, alignment, and sizing
- selecting an image should prioritize replace, fit, crop intent, roundness, and caption/alt content
- selecting a stack/list should prioritize reorder, spacing between items, alignment, and distribution
- selecting a card/frame should prioritize fill, padding, size, radius, border, and shadow
- selecting a progress bar should prioritize value, label, and fill appearance instead of raw width utilities

### Principle 2: auto-layout behavior should be the default mental model

Figma makes repeated UI easier by treating containers as layout systems. The app should infer that model for generated Tailwind screens.

- buttons should resize with text
- lists should reorder as list items, not as arbitrary positioned DOM nodes
- stack spacing should be edited at the container level
- fill, hug, and fixed sizing should be first-class editing concepts

### Principle 3: the canvas should stay primary

The panel should support the canvas, not replace it.

- double click text to edit inline
- click image to replace
- drag within a stack to reorder
- drag resize handles for size changes
- use arrow keys for nudge actions
- show a lightweight floating toolbar near the selection for common actions

### Principle 4: advanced mechanics should be progressively disclosed

Figma keeps powerful detail controls available, but the first interaction is rarely a CSS-like inspector. This app should do the same.

- default to plain-language outcomes
- expose raw controls only in `Advanced`
- explain ambiguous actions in simple language before falling back to AI

### Principle 5: layer order must respect layout context

Figma treats layer order differently inside auto-layout containers than in free positioning. The app should match that principle.

- inside inferred stacks, move before/after should reorder siblings
- outside stacked layout, bring forward/send backward should affect overlap order
- the UI should explain which behavior is happening

## Product Architecture

Introduce a 4-layer editing system:

### 1. Intent Layer

User-facing controls in plain language.

Examples:
- Move
- Align
- Size
- Space
- Content
- Style
- Layer Order
- Images

This layer should never expose CSS vocabulary by default.

### 2. Semantic Operation Layer

Translate user actions into semantic edit commands.

Examples:
- `nudge_element`
- `align_in_parent`
- `set_size_mode`
- `set_space_around`
- `set_space_within`
- `set_space_between_children`
- `reorder_within_parent`
- `bring_forward`
- `send_backward`
- `replace_image`
- `set_text_content`
- `set_theme_style`

This is the main abstraction the app should own.

### 3. HTML/Tailwind Mutation Layer

Resolve each semantic command into the safest possible DOM/class/style patch sequence.

This layer decides whether to:
- add/remove Tailwind classes
- update inline styles
- reorder DOM nodes
- create wrapper containers
- fall back to AI edit when the intent cannot be applied safely with deterministic rules

### 4. Design Graph Layer

Between semantic intent and raw mutation, add a design graph layer that interprets generated HTML as editable design objects.

Suggested responsibilities:
- infer frame/container roles from DOM + Tailwind classes
- infer auto-layout direction from `flex`, `grid`, `gap`, `justify-*`, `items-*`
- infer sizing behavior such as hug, fill, fixed
- infer constraints such as top, bottom, left, right anchoring
- infer repeated sibling patterns for component-like collections
- infer scroll direction from `overflow-x-auto`, `overflow-y-auto`, fixed widths, and sibling layout
- expose parent/child/sibling relationships in a design-tool-friendly shape

This layer is the key to making HTML feel like a Figma document instead of a DOM tree.

### Implementation note: reuse existing scene inference

Do not build the design graph from scratch if existing utilities already solve part of the problem.

- use `DeviceNode.tsx` selection metadata as the live per-selection entry point
- extend that payload with structural context needed by quick actions
- reuse or adapt `htmlToFigmaScene.ts` layout inference for bounds, layout mode, padding, margin, overflow, and size-mode signals
- add a lighter `buildDesignGraph` layer that is optimized for editing decisions, not export fidelity
- keep export-oriented scene types and edit-oriented graph types separate even if they share helper functions

## UX Restructure

## New Edit Mode Layout

Edit mode should have two primary modes:
- `Quick Edit` as the default
- `Advanced` for dev-style editing

### Quick Edit sections

- `Content`
- `Layout`
- `Space`
- `Style`
- `Images`
- `Arrange`

### Advanced sections

- raw spacing
- raw position
- z-index
- flex/grid details
- width/height internals
- class-level tuning
- raw URL/src/href fields

## Quick Edit behavior

Quick Edit should be adaptive. The panel should not show the same controls for every selected node.

### Content

Expose:
- edit text
- rename button label
- replace image
- edit link target with friendly language

Prefer:
- inline canvas editing for text
- direct image click to replace

Also support:
- plain-language rename for buttons, tabs, labels, and chips
- simple link editing like "Open this when clicked"
- semantic controls for known components like progress values and nav labels

### Layout

Expose:
- Move Up / Down / Left / Right
- Align Left / Center / Right
- Align Top / Middle / Bottom
- Full Width
- Hug Content
- Make Bigger / Smaller

Do not expose:
- margin
- padding
- position type
- flex direction
- align-self

### Space

Expose:
- More space around this
- Less space around this
- More space inside this
- Less space inside this
- More space between items
- Less space between items

The app should infer whether this maps to:
- margin
- padding
- gap

### Arrange

Expose:
- Bring Forward
- Send Backward
- Move Before
- Move After
- Duplicate
- Delete

Do not force users to think in DOM order or z-index first.

### Style

Expose:
- Fill
- Text Color
- Corner Roundness
- Border
- Shadow
- Emphasis presets

Use presets where possible:
- Flat
- Soft
- Elevated
- Pill
- Outline

### Role-based Quick Edit cards

Instead of one giant generic form, Quick Edit should compose small cards based on inferred role.

- `TextQuickActions`: edit copy, tone/emphasis, align, text size presets
- `ImageQuickActions`: replace, fit mode, roundness, alt/caption helpers
- `FrameQuickActions`: size, fill, padding, radius, shadow, border
- `StackQuickActions`: reorder, space between, align children, distribute
- `ProgressQuickActions`: value, label, fill/track style
- `NavQuickActions`: reorder items, preserve pinning, maintain safe-area behavior

The user should feel like they selected "a thing with relevant actions", not "an element with every possible field."

## Manipulation Model

## Design Graph Requirements For Generated HTML

For generated Tailwind screens, every selected node should expose more than current DOM info.

The editor should know:
- parent uid
- sibling index
- sibling count
- child order
- child uids
- inferred role: frame, text, icon, button, image, list, card, nav, progress, chip
- inferred layout mode: none, row, column, grid
- inferred primary axis
- inferred scroll behavior: static, horizontal-scroll, vertical-scroll
- inferred size mode: hug, fill, fixed
- inferred constraints relative to parent
- whether node belongs to a repeated pattern set
- repeated pattern signature id
- whether node is part of a semantic control like progress bar or tab chip group
- whether node is safe for reorder, resize, align, and direct text edit
- which quick-action cards should be shown for the selection

Current `buildInfo` in the canvas only exposes basic computed styles and rects. That is not enough for Figma-like manipulation.

The design graph layer should extend selection metadata so semantic edits can resolve predictably.

## Rule 1: Prefer direct manipulation over inspector input

Whenever possible:
- drag to move
- drag resize handles to resize
- double click to edit text
- click image to replace
- keyboard arrow keys to nudge

The side panel should support and refine the action, not be the only path.

## Rule 2: Use intent-specific controls, not CSS property controls

Examples:

Instead of:
- `margin-top`
- `top`
- `translateY`

show:
- `Move Up`
- `Nudge`
- `Closer To Above`

Instead of:
- `padding`
- `gap`

show:
- `More space inside`
- `More space between items`

## Rule 3: Make the engine choose the implementation

The engine should resolve intent based on context.

Example for `Move Up`:
- if absolute/fixed: adjust offsets
- if flex/grid child: prefer reorder or parent alignment depending on context
- if normal flow block: adjust outer spacing
- if a tiny visual nudge is needed: use translate fallback only if safe

The user should not choose the CSS mechanism.

## Semantic Operation Model

Add a new semantic edit operation schema in shared/client code.

Suggested shape:

```ts
type BaseSemanticEditOp =
  | { type: 'move'; uid: string; direction: 'up' | 'down' | 'left' | 'right'; amount: 'xs' | 'sm' | 'md' | 'lg' }
  | { type: 'align'; uid: string; axis: 'x' | 'y'; value: 'start' | 'center' | 'end' | 'stretch' }
  | { type: 'space'; uid: string; target: 'around' | 'inside' | 'between-children'; amount: 'less' | 'more' }
  | { type: 'size'; uid: string; dimension: 'width' | 'height' | 'both'; mode: 'hug' | 'fill' | 'fixed'; amount?: 'sm' | 'md' | 'lg' }
  | { type: 'reorder'; uid: string; mode: 'before' | 'after' | 'bring-forward' | 'send-backward' }
  | { type: 'duplicate'; uid: string }
  | { type: 'replace-image'; uid: string; src: string }
  | { type: 'set-text'; uid: string; text: string }
  | { type: 'set-link'; uid: string; href: string }
  | { type: 'set-image-fit'; uid: string; fit: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down' }
  | { type: 'set-progress-value'; uid: string; value: number }
  | { type: 'style-preset'; uid: string; preset: 'flat' | 'soft' | 'elevated' | 'pill' | 'outline' }

type SemanticEditOp =
  | BaseSemanticEditOp
  | { type: 'apply-to-similar'; uid: string; sourceOp: BaseSemanticEditOp }
```

The UI should only produce semantic ops in Quick Edit.

Notes:

- component-aware ops are necessary if the product wants progress bars, repeated cards, chips, and nav groups to feel editable like design objects
- `apply-to-similar` should not ship first, but the graph and resolver should reserve room for it

## Tailwind + HTML Mutation Strategy

Generated screens use Tailwind utilities and semantic token rules. The mutation layer must preserve that system instead of fighting it.

For the provided sample HTML specifically, the mutation strategy must preserve:
- theme/token definitions in `<head>`
- semantic Tailwind color tokens like `bg-surface`, `text-text`, `border-stroke`
- custom Tailwind radii like `rounded-card`, `rounded-control`, `rounded-pill`
- custom shadows like `shadow-soft`
- safe-area and fixed-nav behavior
- horizontal scroll groups using `overflow-x-auto`
- repeated card structures with shared composition
- progress bar track/fill relationships

### Principle 1: Prefer valid Tailwind utility mutations for common spacing/layout changes

Examples:
- `mt-2` -> `mt-4`
- `gap-4` -> `gap-6`
- `rounded-2xl` -> `rounded-3xl`
- `justify-start` -> `justify-center`
- `items-start` -> `items-center`
- `w-full` / `w-fit`

### Principle 2: Use inline styles only for values not cleanly representable as approved utilities

Examples:
- custom nudge preview during drag
- temporary transforms during manipulation
- values not on the spacing scale

### Principle 3: normalize before mutating

Before applying a semantic op:
- inspect class list
- inspect inline style
- inspect computed style
- inspect parent layout context

Then resolve the canonical edit path.

### Principle 4: keep generated Tailwind clean

Avoid:
- piling conflicting utilities
- mixing multiple contradictory layout models
- adding invented classes
- growing long inline style blobs for common operations

## Tailwind Resolver Layer

Create a resolver that understands a safe subset of utility groups.

Suggested first groups:
- spacing: `m*`, `p*`, `gap-*`, `space-y-*`, `space-x-*`
- sizing: `w-*`, `h-*`, `min-w-*`, `min-h-*`
- layout: `flex`, `grid`, `block`, `inline-flex`
- alignment: `justify-*`, `items-*`, `self-*`
- radius: `rounded-*`
- shadows: `shadow-*`
- position: `relative`, `absolute`, `fixed`, `sticky`
- inset: `top-*`, `left-*`, `right-*`, `bottom-*`
- typography: `text-*`, `font-*`, `tracking-*`, `leading-*`

Suggested resolver responsibilities:
- read active utility in a group
- remove conflicting utilities
- upgrade/downgrade to nearest allowed token
- fall back to inline style when no safe utility match exists

Add resolver support for generated design-specific groups:
- semantic colors: `bg-bg`, `bg-surface`, `bg-surface2`, `text-text`, `text-muted`, `border-stroke`, `bg-accent`, `text-accent`
- semantic radius tokens: `rounded-card`, `rounded-control`, `rounded-pill`
- effect tokens: `shadow-soft`, `shadow-glow`
- arbitrary values that are common in generation output: `w-[66%]`, `text-[10px]`, `text-[18px]`, `min-w-[140px]`

The resolver should not blindly strip arbitrary utilities. It should classify and preserve valid generated tokens.

## New Deterministic Patch Types

Extend the low-level patch model to support structure.

Suggested new patch ops:
- `insert_node`
- `duplicate_node`
- `move_node`
- `wrap_node`
- `unwrap_node`
- `replace_node`
- `batch`

Suggested shape:

```ts
type HtmlPatch =
  | existing ops
  | { op: 'move_node'; uid: string; parentUid: string; index: number }
  | { op: 'duplicate_node'; uid: string; newUidMap?: Record<string, string> }
  | { op: 'insert_node'; parentUid: string; index: number; html: string }
  | { op: 'replace_node'; uid: string; html: string }
  | { op: 'batch'; patches: HtmlPatch[] };
```

These are required for:
- layman reorder controls
- duplicate
- insert reusable blocks
- safer structure changes without full AI edits

Implementation requirement:

- `htmlPatcher.ts` and the iframe patch application inside `DeviceNode.tsx` must be updated together
- undo/redo in `edit-store.ts` should treat grouped semantic actions as one logical history step

Add one more deterministic layer above raw patches:

```ts
type DesignMutationPlan = {
  semanticOp: SemanticEditOp;
  targetUid: string;
  patches: HtmlPatch[];
  selectionBehavior?: 'preserve' | 'select-new-node' | 'select-parent';
  previewOnly?: boolean;
}
```

This helps gestures behave like design-tool actions instead of isolated DOM mutations.

## Decision Engine

Add a deterministic resolver:

`resolveSemanticEditOp(selectedElement, screenHtml, op) -> HtmlPatch[] | aiFallback`

Resolution order:

1. inspect selected node
2. inspect parent layout context
3. inspect current utility classes
4. choose safe deterministic strategy
5. emit batch patch
6. if confidence is low, offer AI-assisted fallback phrased in plain language

Examples:

### `space: between-children`

If parent is flex/grid:
- update `gap-*`

Else if parent is vertical stack with repeated margins:
- normalize to `space-y-*` or sibling margin strategy

Else:
- do not guess silently
- offer "Convert to stack spacing" action or AI fallback

### `align center`

If child in flex/grid parent:
- set `self-center` or parent alignment depending on target mode

If block element in normal flow:
- use auto margins for horizontal centering

If inline text:
- adjust `text-center`

### `move in stack`

If selected node is inside a vertical or horizontal auto-layout container:
- prefer reorder among siblings
- show insertion preview line during drag
- update DOM index with `move_node`

Do not simulate this with margin nudges when the design intent is clearly reorder.

### `resize card`

If node uses a tokenized width/height class:
- move to the nearest valid token or arbitrary utility value

If node is in auto-layout and should fill:
- prefer `w-full`, `self-stretch`, or parent-compatible fill behavior

If node is a horizontally scrolling card with `min-w-*`:
- resize by adjusting `min-w-*` or corresponding inline width rules, not unrelated padding hacks

### `edit repeated card`

If multiple siblings share the same structural signature:
- treat them as a repeated set
- default to editing only the selected item
- later support "apply to all similar items"

### Confidence and fallback rules

The resolver should score whether an action is safe to apply deterministically.

- high confidence: apply immediately
- medium confidence: apply with a short explanatory hint in the UI
- low confidence: do not guess silently; offer AI or a clearer user choice

Examples of low-confidence situations:

- mixed flex + absolute positioning in the same parent
- a repeated list where siblings have materially different structure
- stacked spacing that comes from a combination of margins, transforms, and wrapper divs
- a node that visually looks like a component but lacks a stable structural signature

## Quick Edit Controls To Ship First

The first shipped Quick Edit controls should cover the majority of common edits:

- Edit Text
- Replace Image
- Move Up / Down / Left / Right
- Make Bigger / Smaller
- More Space Around
- Less Space Around
- More Space Inside
- Less Space Inside
- Align Left / Center / Right
- Full Width / Hug Content
- Bring Forward / Send Backward
- Duplicate
- Delete

These solve most beginner editing needs without showing CSS.

Add two more low-risk controls if they can be supported cleanly:

- Edit Link
- Fit Image

## Canvas Interaction Additions

Add direct controls on the preview:

- selection toolbar near element
- arrow-key nudge
- drag move handles
- resize handles
- duplicate action
- bring forward / send backward actions

Suggested rules:
- drag interactions preview visually first
- commit semantic operation on pointer up
- preserve undo as one logical action per gesture

## How The Sample HTML Should Be Interpreted

Using the provided budgeting screen as a reference fixture:

- `body-budget` should behave as the root frame
- `header-budget` should behave as a top frame with horizontal auto-layout
- `chips-container` should behave as a horizontally scrolling chip row
- `main-budget` should behave as the main vertical stack
- `hero-budget-chart` should behave as a card/frame
- `master-progress-track` + `master-progress-fill` should behave as one progress component
- `list-categories` should behave as a vertical repeated-card list
- each `cat-item-*` should behave as a card instance
- `list-bills` should behave as a horizontal scroll list of cards
- each `bill-item-*` should behave as a repeated card instance
- `btn-add-bill` should behave like a variant/CTA card in the same list
- `bottom-nav-budget` should behave as a fixed bottom frame constrained to screen width

Expected editing behavior on this sample:
- dragging `cat-item-2` upward should reorder cards, not add margin-top
- "more space between categories" should update the parent stack spacing on `list-categories`
- "make bill cards wider" should update the horizontal card sizing on `bill-item-*`
- editing the budget progress should expose a percentage/value control, not only raw width utility editing
- moving bottom nav content should preserve the nav bar's fixed-bottom behavior
- editing a chip should preserve pill styling unless the user intentionally changes style preset

This sample should become a canonical fixture for resolver tests and interaction QA.

## Panel Restructure

## Proposed component split

Create a new edit panel structure:

- `QuickEditPanel`
- `AdvancedEditPanel`
- `SelectionSummaryCard`
- `ContentQuickActions`
- `LayoutQuickActions`
- `SpaceQuickActions`
- `ArrangeQuickActions`
- `StyleQuickActions`
- `ImagesQuickActions`

Keep the existing advanced controls, but move them behind an explicit toggle:
- `Advanced`

## Suggested panel IA

When an element is selected:

1. Summary
2. Content
3. Layout
4. Space
5. Style
6. Arrange
7. Advanced

When no element is selected:

- show a simple "Select something to edit"
- show top 3 actions
- show keyboard hints

### Suggested summary card content

The summary card should turn technical DOM details into plain language.

Examples:

- "Button in horizontal stack"
- "Card in vertical list"
- "Image inside hero section"
- "Bottom navigation bar pinned to screen"

Helpful metadata to show:

- selection name
- inferred role
- parent context
- whether editing affects only this item or a repeated set
- the top 2 or 3 most likely actions

### Command-style actions

Later, add a small action search box inspired by Figma's actions menu:

- search "center"
- search "make wider"
- search "replace image"
- search "more space"

This can map typed user intent to semantic ops without exposing CSS terms.

## AI Role After Restructure

AI should become the fallback for ambiguous or high-level edits, not the only easy path.

Good AI jobs:
- "make this section feel more premium"
- "turn this into a pricing card"
- "make this header more compact"
- "rewrite this CTA"

Bad AI jobs:
- moving one element 8px
- centering a button
- increasing card radius
- adding more spacing between list rows

Those should be deterministic.

## File Plan

### New files

- `apps/web/src/types/semantic-edit.ts`
- `apps/web/src/types/design-graph.ts`
- `apps/web/src/utils/designGraph.ts`
- `apps/web/src/utils/layoutInference.ts`
- `apps/web/src/utils/tailwindClassResolver.ts`
- `apps/web/src/utils/semanticEditResolver.ts`
- `apps/web/src/components/edit/QuickEditPanel.tsx`
- `apps/web/src/components/edit/AdvancedEditPanel.tsx`
- `apps/web/src/components/edit/SelectionSummaryCard.tsx`
- `apps/web/src/components/edit/quick/ContentQuickActions.tsx`
- `apps/web/src/components/edit/quick/LayoutQuickActions.tsx`
- `apps/web/src/components/edit/quick/SpaceQuickActions.tsx`
- `apps/web/src/components/edit/quick/ArrangeQuickActions.tsx`
- `apps/web/src/components/edit/quick/StyleQuickActions.tsx`
- `apps/web/src/components/edit/quick/ImagesQuickActions.tsx`

### Existing files likely to change

- `apps/web/src/components/edit/EditPanel.tsx`
- `apps/web/src/components/edit/EditWorkspaceOverlay.tsx`
- `apps/web/src/components/edit/LayersPanel.tsx`
- `apps/web/src/components/canvas/DeviceNode.tsx`
- `apps/web/src/stores/edit-store.ts`
- `apps/web/src/utils/htmlPatcher.ts`
- `apps/web/src/utils/htmlToFigmaScene.ts`
- `apps/web/src/utils/editMessaging.ts`
- `packages/shared/src/types/patch.ts` if patch types are shared

### Reuse before adding new abstraction

Before adding entirely new helpers, evaluate whether these can be extended:

- `apps/web/src/utils/htmlToFigmaScene.ts` for layout and size-mode inference
- `apps/web/src/components/canvas/DeviceNode.tsx` for selection metadata capture
- `apps/web/src/components/edit/EditPanel.tsx` as the source of today's advanced controls that should be preserved behind a toggle

### Test fixtures to add

- representative generated screen fixture based on the budgeting example
- stack/list fixture
- horizontal-scroll cards fixture
- fixed-bottom nav fixture
- progress component fixture
- repeated-card collection fixture

## Implementation Phases

## Phase 0: Preparation

- audit the current advanced controls in `EditPanel.tsx` and mark what stays advanced
- define semantic operation schema
- define design graph schema
- define safe Tailwind utility groups
- add test fixtures for representative generated screens, including the budgeting sample shape
- document the current edit/store/iframe patch flow so new quick actions do not bypass undo/redo

Deliverable:
- semantic op type definitions
- design graph type definitions
- mutation rules document

## Phase 1: Panel split without behavior loss

- extract the existing inspector UI into `AdvancedEditPanel`
- keep current behavior intact for text, image, style, spacing, layout, and z-index controls
- add a new `QuickEditPanel` shell and `SelectionSummaryCard`
- make `Quick Edit` the default, with `Advanced` clearly available

Deliverable:
- panel architecture that supports a beginner-first path without losing current power-user controls

## Phase 2: Quick Edit MVP on top of existing safe patch ops

- ship beginner actions that can already map safely to current patch ops:
  - edit text
  - replace image
  - edit link
  - fit image
  - align left/center/right for safe cases
  - full width / hug content for safe cases
  - more/less space around
  - more/less space inside
  - delete
- keep behavior scoped to deterministic cases only
- explain unsupported cases instead of silently doing the wrong thing

Deliverable:
- default layman-friendly panel for the most common edits

## Phase 3: Semantic engine foundation

- extend `HtmlPatch` with structural patch ops
- add design graph extraction and layout inference
- add deterministic semantic resolver
- add Tailwind class resolver for spacing, size, alignment, radius, shadow
- extend selection metadata in `DeviceNode.tsx`
- reuse `htmlToFigmaScene.ts` helpers where it reduces risk

Deliverable:
- `resolveSemanticEditOp`
- `buildDesignGraph`
- unit tests for common actions

## Phase 4: Structural editing and list behavior

- add `duplicate_node`, `move_node`, and `batch`
- support reorder within inferred stacks/lists
- support duplicate for cards, rows, chips, and buttons
- add repeated-set detection for "this item" vs future "all similar" flows

Deliverable:
- card/list editing that feels much closer to Figma auto layout behavior

## Phase 5: Direct manipulation

- add drag-to-move
- add reorder-on-drag inside inferred stacks
- add keyboard nudging
- add resize handles
- add floating quick toolbar

Deliverable:
- canvas-first editing flow

## Phase 6: Smarter layout actions and component-aware controls

- support reorder within parent
- support distribute/equal spacing actions
- support "match sibling spacing"
- support "convert to stack/row" helpers when deterministic
- add component-aware quick controls for progress, nav groups, chips, and repeated cards

Deliverable:
- better editing of grouped layouts

## Phase 7: AI fallback integration

- connect unresolved semantic intents to AI edit fallback
- show user-friendly explanation before fallback
- preserve selection and history cleanly

Deliverable:
- hybrid deterministic + AI editing model

## Acceptance Criteria

The restructure is successful when a non-technical user can:

- move an element without touching margin/padding/position
- add spacing without knowing CSS terms
- align and resize common elements through presets
- reorder and duplicate blocks without raw DOM knowledge
- replace images and text inline from the canvas
- complete most common edits without opening `Advanced`
- manipulate generated Tailwind screens with frame-like behavior similar to design tools
- edit repeated cards and stack spacing in list-heavy UIs like the budgeting sample without breaking layout
- keep fixed and scrolling regions behaving correctly after edits

## Non-Goals

This plan does not try to:
- build a full Figma clone
- support arbitrary freeform HTML authoring
- eliminate AI editing
- remove advanced CSS-level control for developers

## Recommended First Build Slice

Ship the smallest useful version first:

1. extract current inspector into `AdvancedEditPanel`
2. ship `QuickEditPanel` + `SelectionSummaryCard`
3. map safe beginner actions to existing patch ops:
   - Edit Text
   - Replace Image
   - Edit Link
   - Fit Image
   - Align Left / Center / Right where safe
   - Full Width / Hug Content where safe
   - More Space Around
   - More Space Inside
   - Delete
4. extend selection metadata with parent/sibling/layout context
5. add semantic resolver and structural patches next

That delivers a visible product improvement fast, preserves current advanced controls, and creates a stable path toward more Figma-like editing instead of delaying value until the full engine rewrite is finished.
