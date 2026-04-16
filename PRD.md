# Tabby - Product Requirements Document

## Overview

Tabby is a Firefox sidebar extension for managing browser tabs as a hierarchical tree with folders and a permanent/ephemeral split. It focuses on three core ideas: a clean tree view of open tabs, user-defined folders for organizing them, and a **fold** that separates anchored permanent tabs from ephemeral working tabs that auto-expire.

## Problem Statement

Power users who manage dozens (or hundreds) of open tabs need more than Firefox's native horizontal tab strip. Existing vertical tab extensions offer tree-style layouts, but fall short in two areas:

- **First-class folder organization**: Existing solutions support panels and tree indentation, but don't offer persistent named folders that survive session restarts and act as top-level organizers.
- **Tab anchoring**: There is no mechanism to lock a tab to a specific URL so that in-page navigation doesn't lose the original page. Users frequently open a reference page (docs, a spec, a dashboard) and accidentally navigate away with no quick way to snap back.
- **Tab hygiene**: Tabs accumulate endlessly. There is no mechanism to distinguish between tabs you intend to keep and tabs you opened for a momentary task. Users end up with hundreds of stale tabs they're afraid to close because something important might be in there.

Tabby solves all three with a purpose-built sidebar.

## Target Users

- Developers who keep reference docs, PRs, dashboards, and working pages open simultaneously.
- Researchers who organize sources into topic groups and need to preserve original URLs.
- Anyone who routinely has 20+ tabs open and wants spatial/hierarchical organization beyond flat tab lists.

## Core Concepts

### 1. Tab Tree

Every open tab appears in a sidebar tree view. Tabs can be nested under other tabs (parent-child) via drag-and-drop or automatic grouping (e.g., tabs opened from a link inherit the opener as parent). The tree is the primary navigation surface -- clicking a node activates that tab.

### 2. Folders

Folders are named, persistent groups that live in the tree alongside tabs. They are not tabs themselves -- they are organizational containers. Folders persist across browser restarts and can be collapsed/expanded. Tabs can be dragged into and out of folders freely.

### 3. The Fold (and Anchoring)

The sidebar is divided into two zones by a visible horizontal line -- **the fold**.

**Above the fold** is permanent space. Every tab above the fold is **anchored**: its URL is recorded at the moment it crosses the fold. If the user navigates away, the anchor icon dims, and double-clicking it returns to the original URL. Tabs above the fold persist indefinitely across restarts. Think of this zone as a living bookmarks bar -- curated, organized, always there. Folders also live exclusively above the fold.

**Below the fold** is the working session. Every newly opened tab lands here. These tabs are ephemeral: they auto-expire and close after 24 hours since they were last active. Tabs below the fold cannot be anchored. This zone is the scratchpad -- search results, quick lookups, links from chat, things you're reading right now but probably won't need tomorrow.

The fold is the single decision boundary. Dragging a tab from below the fold to above it **promotes and anchors** the tab in one gesture. The user never needs to explicitly "save" or "anchor" a tab separately -- just drag it up if it matters. Everything below quietly cleans itself up.

---

## Functional Requirements

### F1: Sidebar Panel

| ID | Requirement |
|----|-------------|
| F1.1 | Tabby renders as a Firefox sidebar panel, opened via toolbar button or keyboard shortcut. |
| F1.2 | The sidebar displays a single scrollable tree of folders and tabs. |
| F1.3 | The sidebar is resizable via the standard Firefox sidebar splitter. |

### F2: Tab Tree

| ID | Requirement |
|----|-------------|
| F2.1 | Every open tab in the current window is represented as a node in the tree. |
| F2.2 | Tabs display: favicon, title (truncated), and status indicators (loading, anchor icon if above the fold, subtle countdown bar if below the fold). |
| F2.3 | Clicking a tab node activates (switches to) that tab. |
| F2.4 | Each tab row has a close button (x icon) that appears on hover. Clicking it closes the tab. No middle-click close. |
| F2.5 | Tabs can be nested under other tabs via drag-and-drop to form a visual hierarchy. |
| F2.6 | When a link is opened from a tab, the new tab is automatically inserted as a child of the opener. |
| F2.7 | Collapsing a parent tab hides all descendants; expanding reveals them. |
| F2.8 | Right-click context menu on a tab provides: Close, Close Subtree, Keep (promote above fold, shown for ephemeral tabs), Re-anchor here (shown for permanent tabs), Move to Folder, Flatten, Duplicate, Reload. |
| F2.9 | Multi-select (Ctrl/Cmd+click, Shift+click) allows bulk operations (close, move to folder, keep, flatten). |
| F2.10 | Tab order in the tree is independent of Firefox's internal tab order; reordering in the tree does not reorder Firefox's tab strip. |

### F3: Folders

| ID | Requirement |
|----|-------------|
| F3.1 | Users can create a new folder via context menu, toolbar button, or keyboard shortcut. Folders can only be created in the permanent zone (above the fold). |
| F3.2 | Folders have a user-editable name and optional color/icon. |
| F3.3 | Folders can be nested inside other folders (unlimited depth). |
| F3.4 | Tabs are moved into folders via drag-and-drop or the "Move to Folder" context menu. |
| F3.5 | Folders can be collapsed/expanded. Collapsed state persists across restarts. |
| F3.6 | Folders and their contents persist across browser restarts (stored in extension local storage). |
| F3.7 | Deleting a folder moves its child tabs to the folder's parent (or tree root). Tabs are never lost on folder deletion. |
| F3.8 | Folders can be reordered via drag-and-drop alongside tabs in the tree. |
| F3.10 | Empty folders are allowed and remain visible until explicitly deleted. |

### F4: The Fold and Anchoring

Being above the fold and being anchored are the same thing. There is no way to anchor a tab without promoting it, and no way to be above the fold without being anchored.

**Promotion (ephemeral -> permanent/anchored)**

| ID | Requirement |
|----|-------------|
| F4.1 | A visible horizontal divider (the fold) separates the sidebar into an upper permanent zone and a lower ephemeral zone. |
| F4.2 | All newly opened tabs are inserted below the fold, regardless of whether the opener is permanent or ephemeral. Tabs opened from another ephemeral tab nest as a child of the opener. Tabs opened from a permanent tab, or independent new tabs (Ctrl+T, links from external apps), are inserted at the bottom of the ephemeral zone. |
| F4.3 | Dragging a tab from below the fold to above it promotes the tab and its entire subtree to permanent. Each promoted tab records its current URL as its **anchor point**, loses its expiry timer, and persists indefinitely. |
| F4.4 | The "Keep" action in the context menu (or a keyboard shortcut) promotes a tab above the fold, equivalent to dragging it up. |
| F4.5 | Moving a tab into a folder automatically promotes it (folders exist only above the fold). |
| F4.6 | Bulk-promote: selecting multiple ephemeral tabs and choosing "Keep" promotes all of them. |

**Anchor mechanics (all tabs above the fold)**

| ID | Requirement |
|----|-------------|
| F4.7 | Every tab above the fold has an anchor URL, recorded at the moment of promotion. |
| F4.8 | Tabs above the fold display an anchor icon in the tree view. When the tab is showing its anchor URL, the icon is fully opaque. When the tab has navigated away, the icon becomes semi-transparent/dimmed to indicate drift. |
| F4.9 | Double-clicking the anchor icon navigates the tab back to its anchor URL. |
| F4.11 | The anchor point can be updated to the tab's current URL via "Re-anchor here" in the context menu. |
| F4.12 | Anchor URLs persist across browser restarts. |

**Demotion (permanent -> ephemeral)**

| ID | Requirement |
|----|-------------|
| F4.13 | Dragging a tab from above the fold to below it demotes the tab to ephemeral. It loses its anchor point, gains a `lastActiveAt` timestamp set to now, and becomes subject to the 24-hour expiry. |

**Ephemeral zone behavior**

| ID | Requirement |
|----|-------------|
| F4.15 | Tabs below the fold track a `lastActiveAt` timestamp, updated whenever the tab becomes the focused/selected tab in Firefox (i.e., the user switches to it). Opening a tab without switching to it does not reset the timer. |
| F4.16 | Tabs below the fold are organized into subtrees. A subtree's expiry is determined by the most recently active tab anywhere in that subtree. The entire subtree expires together once no tab in it has been active for 24 hours. |
| F4.17 | When any tab is closed -- whether auto-expired or manually closed (including permanent tabs) -- its title and URL are recorded in the "Recently Closed" section. This is a collapsible section at the bottom of the sidebar. Entries persist for 7 days, then are pruned. Clicking an entry reopens it as a new ephemeral tab below the fold and removes it from the list. |
| F4.18 | Tabs below the fold support the full tree: drag-and-drop nesting, collapse/expand, and auto-grouping by opener. |
| F4.19 | Users can select any set of tabs (above, below, or spanning the fold) and click "Flatten" to remove all parent-child nesting among the selection, making them siblings at the same level. |
| F4.20 | Tabs below the fold display a subtle countdown bar (no text) that visually depletes as the tab approaches expiry. |
| F4.21 | The expiry period defaults to 24 hours. |
| F4.22 | Auto-close is silent -- no form data detection (would require host permissions). The Recently Closed section and browser's native Ctrl+Shift+T serve as the safety net. |

### F6: Session Persistence

| ID | Requirement |
|----|-------------|
| F6.1 | The full tree state (folder structure, tab-to-folder assignments, nesting, collapse state, anchor data, fold position, ephemeral timestamps) is saved to extension storage on every mutation. |
| F6.2 | On browser startup, Tabby reconstructs the tree by matching restored tabs (by URL and session ID) to saved state. When multiple tabs share the same URL, positional order is used as a tiebreaker (best-effort matching). |
| F6.3 | Orphaned saved entries (tabs that no longer exist) are pruned after startup. |
| F6.4 | On startup, any below-the-fold tabs whose 24-hour window has elapsed during the browser being closed are immediately closed. |

### F7: Keyboard Navigation

| ID | Requirement |
|----|-------------|
| F7.1 | Arrow keys navigate the tree (up/down moves between visible nodes, left collapses or moves to parent, right expands or moves to first child). |
| F7.2 | Enter activates the focused tab. |
| F7.3 | Delete closes the focused tab. |
| F7.4 | Configurable global keyboard shortcut to toggle the sidebar. |

---

## Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NF1 | Tree rendering must remain responsive with 200+ open tabs (target: <16ms per frame during scroll). |
| NF2 | Extension must request only the minimum required permissions: `tabs`, `storage`, `sidebarAction`. No host permissions unless strictly necessary. |
| NF3 | All user data stays local. No telemetry, analytics, or network requests beyond what Firefox APIs require. |
| NF4 | Compatible with Firefox 115+ (current ESR baseline). |
| NF5 | Extension size (packed) should be under 500KB. |
| NF6 | Accessible: all interactive elements must be keyboard-reachable and have appropriate ARIA roles. |

---

## Technical Approach

| Area | Choice | Rationale |
|------|--------|-----------|
| Extension type | WebExtension (Manifest V2 for Firefox) | Firefox sidebar API is MV2. Migrate to MV3 when Firefox sidebar support lands. |
| Language | TypeScript | Type safety for the complex tree data structures. |
| UI framework | Svelte | Small bundle size, fast reactivity, no virtual DOM overhead. Good fit for a sidebar constrained to a narrow viewport. |
| Styling | CSS (plain or CSS Modules) | Keep it simple, no heavy preprocessor needed. Single theme that adapts to OS/Firefox light/dark mode via `prefers-color-scheme`. |
| Build tool | Vite | Fast dev builds, good Svelte/TS support, simple config. |
| Storage | `browser.storage.local` | Sufficient for tree state JSON. Synced storage optional later. |
| Testing | Vitest (unit), Playwright (integration) | Vitest pairs with Vite. Playwright can drive Firefox for e2e tests. |

---

## Data Model

```
TreeNode
  ├── id: string (uuid)
  ├── type: "tab" | "folder"
  ├── parentId: string | null
  ├── zone: "permanent" | "ephemeral"
  ├── position: number (sort order among siblings)
  ├── collapsed: boolean
  ├── children: TreeNode[]
  │
  ├── [Tab fields]
  │   ├── firefoxTabId: number
  │   ├── url: string
  │   ├── title: string
  │   ├── favIconUrl: string
  │   ├── anchorUrl: string | null (set when promoted; null for ephemeral tabs)
  │   ├── status: "loading" | "complete"
  │   └── lastActiveAt: number | null (epoch ms; set for ephemeral tabs, null for permanent)
  │
  └── [Folder fields]
      ├── name: string
      ├── color: string | null
      └── icon: string | null
```

A tab is anchored if and only if `zone === "permanent"`. There is no separate anchor toggle.

---

## User Flows

### Opening Tabby for the first time
1. User installs extension, clicks the toolbar icon.
2. Sidebar opens. The permanent zone above the fold is empty. All existing tabs appear below the fold as ephemeral working tabs.
3. The 24-hour expiry timer starts immediately for all pre-existing tabs. Their `lastActiveAt` is set to the moment of install.

### Keeping a tab (promoting + anchoring in one gesture)
1. User is viewing a documentation page they want to keep as a reference.
2. User drags the tab above the fold (or right-clicks and selects "Keep").
3. The tab moves above the fold. Its current URL is recorded as the anchor point. An anchor icon appears.
4. Later, the user clicks a link in the doc page and navigates away.
5. The tab title/URL updates in the sidebar. The anchor icon dims to indicate the tab has drifted from its anchor.
6. User double-clicks the dimmed anchor icon. The tab navigates back to the original doc URL. The anchor icon returns to full opacity.

### Creating a folder and organizing tabs
1. User right-clicks in the permanent zone, selects "New Folder".
2. An inline text input appears; user types a name and presses Enter.
3. User drags three ephemeral tabs into the folder. They are automatically promoted and anchored.
4. User collapses the folder. The three tabs disappear from view.

### Ephemeral tab lifecycle
1. User clicks a link in Slack -- it opens in Firefox and appears below the fold in Tabby.
2. User reads the page, switches to other tabs. The 24-hour timer is ticking.
3. Next morning, the tab has expired. Tabby closes it silently and records it in the Recently Closed section at the bottom of the sidebar.

### Closing a permanent tab
1. User clicks the close button on a tab above the fold.
2. The tab closes and is recorded in the Recently Closed section. It can be reopened from there.

---

## Decided Scope Boundaries

| Topic | Decision |
|-------|----------|
| **Cross-window support** | Current window only. |
| **Sync** | Local only for v1. |
| **Bookmark integration** | Deferred. |
| **Anchor behavior on redirect** | Wait for the page to finish loading before recording the anchor URL. |
| **Tab discard/unload** | Deferred to v2. |
| **Export/import** | Deferred to v2. |
| **Search/filter** | Deferred to v2. |
| **Theming** | Single theme, adapts to OS/Firefox light/dark via `prefers-color-scheme`. Custom theming deferred to v2. |
