# Assets Feature Checklist

## Overview
- [ ] Build a first-class assets system for reusable media and later reusable components.
- [ ] Support both `project` and `account` asset scope.
- [ ] Let assets work in two modes:
  - [ ] AI reference context
  - [ ] Manual design/edit usage
- [ ] Keep asset metadata outside `projectMemory`.

## Phase 1: Foundation and Image Assets

### 1.1 Data Model
- [x] Add `AssetScope = 'project' | 'account'`.
- [x] Add `AssetKind = 'image' | 'logo' | 'component'`.
- [x] Add shared `AssetRecord` typing with storage and metadata fields.

### 1.2 Persistence
- [x] Add project asset metadata path: `users/{uid}/projects/{projectId}/assets/{assetId}`.
- [x] Add account asset metadata path: `users/{uid}/assets/{assetId}`.
- [x] Add project asset storage path generation.
- [x] Add account asset storage path generation.
- [x] Add list helper for scoped assets.
- [x] Add upload helper for scoped assets.
- [x] Add delete helper for scoped assets.
- [x] Add update helper for asset metadata edits.

### 1.3 Chat Panel Assets UX
- [x] Replace `Assets` placeholder in chat panel.
- [x] Add scope switcher for `Project` and `Account`.
- [x] Add upload action in the assets panel.
- [x] Add list UI with thumbnails and metadata.
- [x] Add delete action for saved assets.
- [x] Add `Use in prompt` action.
- [x] Handle empty states for:
  - [x] signed-out user
  - [x] missing active project
  - [x] no assets yet
- [x] Add search/filter inside the assets panel.
- [x] Add drag-and-drop upload support.

### 1.4 Prompt Flow Integration
- [x] Route saved asset usage into the existing composer image attachment flow.
- [x] Respect current attachment limits.
- [x] Add explicit distinction in UI between ephemeral attachments and saved assets.
- [ ] Add "recently used assets" in the composer.

### 1.5 Edit Panel Integration
- [x] Add `Choose from Assets` entry point in the edit-side `Images` tab.
- [x] Show project/account scoped saved assets inside edit mode.
- [x] Replace an image slot using a saved asset.
- [x] Add upload-to-assets directly from edit mode.
- [x] Add better empty state copy inside the edit asset picker.

### 1.6 Validation
- [x] TypeScript passes after phase 1 foundation.
- [x] Project assets require an active project.
- [x] Account assets work without an active project.
- [x] Delete removes metadata and attempts storage cleanup.
- [x] Saved assets can be attached into chat prompts.
- [x] Saved assets can replace image slots in edit mode.

## Phase 2: Edit-Mode Asset Workflow

### 2.1 UX Improvements
- [x] Add compact inline asset picker with cleaner selection state.
- [x] Add selected-slot targeting feedback.
- [x] Add project/account tabs that preserve scroll and filter state.
- [x] Add "use selected asset for this image" one-click action.

### 2.2 Manual Media Workflow
- [x] Support replacing image `src` while preserving `alt`.
- [x] Add option to update image fit behavior when needed.
- [x] Add recent assets strip in the Images tab.
- [x] Add safe confirmation when replacing a slot with a different aspect ratio.

### 2.3 Validation
- [x] Selected image slot updates immediately.
- [x] No broken URLs after replacement.
- [x] Works for project and account assets across multiple screens.

## Phase 3: Brand Context and AI Asset Awareness

### 3.1 Product
- [x] Add pinned asset concept for project brand context.
- [x] Add asset roles:
  - [x] `logo`
  - [x] `product-shot`
  - [x] `illustration`
  - [x] `photo`
  - [x] `brand-texture`
- [x] Add project defaults for preferred logo and key brand imagery.

### 3.2 Request Plumbing
- [x] Add explicit `assetRefs` to generate/edit request payloads.
- [x] Feed asset metadata into model-facing context.
- [x] Keep raw prompt attachments separate from saved asset references.
- [x] Add opt-in "use project brand assets automatically" behavior.

### 3.3 Validation
- [x] Pinned assets are clearly visible in the library.
- [x] Generate/edit can consistently consume project asset context.

## Phase 4: Components as Assets

### 4.1 Data Model
- [ ] Extend asset records for `kind: 'component'`.
- [ ] Add component snippet metadata:
  - [ ] `htmlSnippet`
  - [ ] `previewImageUrl`
  - [ ] `tokenDependencies`
  - [ ] `category`
  - [ ] `labels`

### 4.2 UX
- [ ] Add `Images` / `Components` filtering.
- [ ] Add reusable component preview cards.
- [ ] Add save-selected-block-as-asset flow.

### 4.3 Editor Integration
- [ ] Insert component into screen near current selection.
- [ ] Preserve/rebuild editable UIDs safely.
- [ ] Add component insertion previews.

## Phase 5: Organization and Discovery

### 5.1 Library Management
- [ ] Search by asset name.
- [ ] Search by tag.
- [ ] Sort by newest, oldest, most used.
- [ ] Add tag editing.
- [ ] Add favorites/starred assets.
- [ ] Add recently used assets.
- [ ] Add bulk delete / bulk tag actions.

### 5.2 Collaboration
- [ ] Design shared/team library model.
- [ ] Add permissions model for shared assets.
- [ ] Add cross-project reuse UX for teams.

## Phase 6: Reliability and Performance

### 6.1 Upload and Storage Safety
- [ ] Add upload size limits and clear user-facing errors.
- [ ] Add mime validation.
- [ ] Add image optimization pipeline for saved assets.
- [ ] Add dedupe detection by hash.
- [ ] Add orphan cleanup strategy.

### 6.2 Scale and Robustness
- [ ] Add pagination for large asset libraries.
- [ ] Add background thumbnail generation if needed.
- [ ] Add offline/error retry states.
- [ ] Add asset versioning strategy.

## Current Focus
- [x] Phase 1 foundation landed.
- [x] Phase 1 chat assets panel landed.
- [x] Phase 1 prompt attachment integration landed.
- [x] Phase 1 edit panel asset selection landed.
- [x] Phase 1 refinement pass:
  - [x] upload-to-assets from edit mode
  - [x] search/filter in assets panel
  - [x] clearer distinction between saved assets and ephemeral attachments
