# Tabby

A Firefox sidebar extension that organizes your tabs as a tree with folders and a permanent/ephemeral split.

Tabs you want to keep get dragged above **the fold** — a visible divider in the sidebar — where they're anchored to their URL and persist forever. Everything below the fold is ephemeral: working tabs that auto-expire after 24 hours of inactivity.

## Features

- **Tree view** — nested tabs with drag-and-drop, collapse/expand, and auto-grouping by opener
- **Folders** — persistent named groups that live above the fold for organizing tabs
- **The fold** — a single divider that separates permanent anchored tabs from ephemeral working tabs
- **Anchoring** — tabs above the fold record their URL; double-click the anchor icon to snap back after navigating away
- **Auto-expiry** — ephemeral tabs close silently after 24 hours (configurable), with a recently-closed safety net
- **Keyboard navigation** — arrow keys to navigate, Enter to activate, Delete to close

## Tech Stack

| Area | Choice |
|------|--------|
| Extension type | WebExtension (Manifest V2) |
| Language | TypeScript |
| UI | Svelte 5 |
| Build | Vite + esbuild |
| Storage | `browser.storage.local` |

## Getting Started

```bash
npm install
npm run build
```

Load the extension in Firefox:

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select any file inside the `dist/` folder
4. Open the sidebar with **Alt+T** (or **Ctrl+T** on macOS)

## Packaging

### AMO (public listing)

Build the unsigned zip and upload it through the [AMO developer dashboard](https://addons.mozilla.org/en-US/developers/):

```bash
npm run package
# outputs web-ext-artifacts/tabby-0.1.0.zip
```

### Self-distributed signed .xpi

Generate API credentials at the [AMO developer hub](https://addons.mozilla.org/en-US/developers/addon/api/key/), then:

```bash
WEB_EXT_API_KEY=your-jwt-issuer \
WEB_EXT_API_SECRET=your-jwt-secret \
npm run sign
# outputs a signed .xpi in web-ext-artifacts/
```

### Linting

Run Mozilla's extension linter to catch issues before submission:

```bash
npm run lint:ext
```

## Project Structure

```
src/
├── background/       # Background script — tab events, expiry, persistence
├── shared/           # Types, messages, storage helpers, tree utilities
└── sidebar/          # Svelte sidebar UI
    ├── components/   # TreeNode, TabRow, FolderRow, FoldDivider, ContextMenu, RecentlyClosed
    ├── store.svelte.ts
    └── styles/
public/
├── manifest.json
└── icons/
```
