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

## Product Architecture

Introduce a 3-layer editing system:

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

## UX Restructure

## New Edit Mode Layout

Edit mode should have two primary modes:
- `Quick Edit` as the default
- `Advanced` for dev-style editing

### Quick Edit sections

- `Content`
- `Layout`
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

### Content

Expose:
- edit text
- rename button label
- replace image
- edit link target with friendly language

Prefer:
- inline canvas editing for text
- direct image click to replace

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

## Manipulation Model

## Design Graph Requirements For Generated HTML

For generated Tailwind screens, every selected node should expose more than current DOM info.

The editor should know:
- parent uid
- sibling index
- child order
- inferred role: frame, text, icon, button, image, list, card, nav, progress, chip
- inferred layout mode: none, row, column, grid
- inferred scroll behavior: static, horizontal-scroll, vertical-scroll
- inferred size mode: hug, fill, fixed
- inferred constraints relative to parent
- whether node belongs to a repeated pattern set
- whether node is part of a semantic control like progress bar or tab chip group

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
type SemanticEditOp =
  | { type: 'move'; uid: string; direction: 'up' | 'down' | 'left' | 'right'; amount: 'xs' | 'sm' | 'md' | 'lg' }
  | { type: 'align'; uid: string; axis: 'x' | 'y'; value: 'start' | 'center' | 'end' | 'stretch' }
  | { type: 'space'; uid: string; target: 'around' | 'inside' | 'between-children'; amount: 'less' | 'more' }
  | { type: 'size'; uid: string; dimension: 'width' | 'height' | 'both'; mode: 'hug' | 'fill' | 'fixed'; amount?: 'sm' | 'md' | 'lg' }
  | { type: 'reorder'; uid: string; mode: 'before' | 'after' | 'bring-forward' | 'send-backward' }
  | { type: 'duplicate'; uid: string }
  | { type: 'replace-image'; uid: string; src: string }
  | { type: 'set-text'; uid: string; text: string }
  | { type: 'style-preset'; uid: string; preset: 'flat' | 'soft' | 'elevated' | 'pill' | 'outline' }
```

The UI should only produce semantic ops in Quick Edit.

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

## Quick Edit Controls To Ship First

Phase 1 controls should cover the majority of common edits:

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
- `apps/web/src/utils/editMessaging.ts`
- `packages/shared/src/types/patch.ts` if patch types are shared

### Test fixtures to add

- representative generated screen fixture based on the budgeting example
- stack/list fixture
- horizontal-scroll cards fixture
- fixed-bottom nav fixture
- progress component fixture
- repeated-card collection fixture

## Implementation Phases

## Phase 0: Preparation

- audit the current advanced controls and mark what stays advanced
- define semantic operation schema
- define design graph schema
- define safe Tailwind utility groups
- add test fixtures for representative generated screens, including the budgeting sample shape

Deliverable:
- semantic op type definitions
- design graph type definitions
- mutation rules document

## Phase 1: Semantic engine foundation

- extend `HtmlPatch` with structural patch ops
- add design graph extraction and layout inference
- add deterministic semantic resolver
- add Tailwind class resolver for spacing, size, alignment, radius, shadow
- keep existing panel unchanged while engine is introduced

Deliverable:
- `resolveSemanticEditOp`
- `buildDesignGraph`
- unit tests for common actions

## Phase 2: Quick Edit MVP

- replace current main panel body with `Quick Edit`
- move current technical controls into `Advanced`
- ship beginner actions:
  - move
  - align
  - size
  - space
  - content
  - image replace
  - duplicate
  - delete

Deliverable:
- default layman-friendly panel
- existing dev controls still accessible

## Phase 3: Direct manipulation

- add drag-to-move
- add reorder-on-drag inside inferred stacks
- add keyboard nudging
- add resize handles
- add floating quick toolbar

Deliverable:
- canvas-first editing flow

## Phase 4: Smarter layout actions

- support reorder within parent
- support distribute/equal spacing actions
- support "match sibling spacing"
- support "convert to stack/row" helpers when deterministic

Deliverable:
- better editing of grouped layouts

## Phase 5: AI fallback integration

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

1. semantic op schema
2. design graph extraction for generated Tailwind screens
3. Tailwind resolver for spacing/size/alignment
4. structural patch support for duplicate + reorder
5. `Quick Edit` panel with:
   - Move
   - Align
   - Size
   - Space
   - Content
   - Images
   - Arrange
6. move current raw controls into `Advanced`

That delivers the main product change without requiring a full canvas interaction rewrite first.
