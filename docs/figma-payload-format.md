# EazyUI Figma Payload Format

`Copy Figma Payload` now produces an owned clipboard payload derived from rendered HTML.

This is intentionally **not** the undocumented native Figma clipboard format.

## Format

- MIME on clipboard:
  - `text/plain`: pretty-printed JSON payload
  - `image/svg+xml`: preview fallback for current paste behavior
- Download fallback:
  - `payload.json`
  - `preview.svg`

## Top-level shape

```json
{
  "format": "eazyui.figma-scene",
  "version": 2,
  "generatedAt": "2026-03-31T12:00:00.000Z",
  "notes": [],
  "designSystem": {},
  "screens": []
}
```

## Screen shape

Each screen includes:

- `screenId`
- `name`
- `width`
- `height`
- `root`

The root node is a `screen` node representing the measured HTML body.

## Design System Metadata

Payload version `2` can also include:

- `designSystem`

When present, the Figma plugin can generate local variables, styles, and repeated-component masters during import.

## Node shape

Each node includes:

- `id`
- `name`
- `nodeType`: `screen | frame | text | image`
- `tagName`
- `bounds`
- `layout`
- `border`
- `visual`
- `typography` when text-related
- `textContent` when text is present
- `image` for image nodes
- `children`

## Measurement model

The payload is generated from a hidden iframe that renders the HTML and reads:

- computed layout
- computed typography
- box metrics
- visible child structure

This keeps the payload tied to real browser layout instead of raw string parsing.

## Current plugin

A repo-local Figma plugin now exists at:

- [plugins/eazyui-figma-import/manifest.json](/D:/code/Github/EazyUI-New/plugins/eazyui-figma-import/manifest.json)

Import it into Figma as a development plugin, then feed it the copied payload from EazyUI. The plugin now validates payload structure, imports richer fills/masks/layout data, and can optionally create variables, styles, and repeated components from the exported design system.
