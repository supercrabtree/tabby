import { describe, it, expect } from 'vitest';
import { reconcileNodes, type RealTab } from '../src/shared/reconcile';
import type { TabNode, FolderNode, TreeNode, TabbyState } from '../src/shared/types';
import { DEFAULT_EXPIRY_MS } from '../src/shared/types';

function makeTab(overrides: Partial<TabNode> & { id: string; firefoxTabId: number }): TabNode {
  return {
    type: 'tab',
    parentId: null,
    zone: 'ephemeral',
    position: 0,
    collapsed: false,
    url: 'https://example.com',
    title: 'Example',
    customTitle: null,
    favIconUrl: '',
    anchorUrl: null,
    status: 'complete',
    lastActiveAt: Date.now(),
    ...overrides,
  };
}

function makeFolder(overrides: Partial<FolderNode> & { id: string }): FolderNode {
  return {
    type: 'folder',
    parentId: null,
    zone: 'permanent',
    position: 0,
    collapsed: false,
    name: 'Folder',
    color: null,
    icon: null,
    ...overrides,
  };
}

function makeRealTab(overrides: Partial<RealTab> & { id: number }): RealTab {
  return {
    url: 'https://example.com',
    title: 'Example',
    favIconUrl: '',
    status: 'complete',
    index: 0,
    ...overrides,
  };
}

// ── Phase 1: firefoxTabId matching ──────────────────────────────────────────

describe('reconcile – firefoxTabId matching', () => {
  it('preserves permanent zone when matched by tab ID', () => {
    const nodes: TreeNode[] = [
      makeTab({ id: 'p1', firefoxTabId: 10, zone: 'permanent', url: 'https://github.com', anchorUrl: 'https://github.com' }),
      makeTab({ id: 'p2', firefoxTabId: 11, zone: 'permanent', url: 'https://docs.dev', anchorUrl: 'https://docs.dev' }),
    ];
    const realTabs: RealTab[] = [
      makeRealTab({ id: 10, url: 'https://github.com', index: 0 }),
      makeRealTab({ id: 11, url: 'https://docs.dev', index: 1 }),
    ];

    const result = reconcileNodes(nodes, realTabs);
    const p1 = result.find(n => n.id === 'p1') as TabNode;
    const p2 = result.find(n => n.id === 'p2') as TabNode;

    expect(p1.zone).toBe('permanent');
    expect(p1.anchorUrl).toBe('https://github.com');
    expect(p2.zone).toBe('permanent');
    expect(p2.anchorUrl).toBe('https://docs.dev');
  });

  it('preserves permanent zone even when URL has drifted since last save', () => {
    const nodes: TreeNode[] = [
      makeTab({
        id: 'p1',
        firefoxTabId: 10,
        zone: 'permanent',
        url: 'https://github.com/old-page',
        anchorUrl: 'https://github.com',
      }),
    ];
    const realTabs: RealTab[] = [
      makeRealTab({ id: 10, url: 'https://github.com/new-page', index: 0 }),
    ];

    const result = reconcileNodes(nodes, realTabs);
    const p1 = result.find(n => n.id === 'p1') as TabNode;

    expect(p1.zone).toBe('permanent');
    expect(p1.anchorUrl).toBe('https://github.com');
    expect(p1.url).toBe('https://github.com/new-page');
  });

  it('preserves nesting / parentId when matched by tab ID', () => {
    const folder = makeFolder({ id: 'f1', position: 0 });
    const child = makeTab({
      id: 'p1',
      firefoxTabId: 10,
      zone: 'permanent',
      parentId: 'f1',
      url: 'https://jira.example.com',
      anchorUrl: 'https://jira.example.com',
    });
    const nodes: TreeNode[] = [folder, child];
    const realTabs: RealTab[] = [
      makeRealTab({ id: 10, url: 'https://jira.example.com', index: 0 }),
    ];

    const result = reconcileNodes(nodes, realTabs);
    const p1 = result.find(n => n.id === 'p1') as TabNode;

    expect(p1.parentId).toBe('f1');
    expect(p1.zone).toBe('permanent');
  });

  it('preserves customTitle when matched by tab ID', () => {
    const nodes: TreeNode[] = [
      makeTab({
        id: 'p1',
        firefoxTabId: 10,
        zone: 'permanent',
        url: 'https://github.com',
        customTitle: 'My GitHub',
        anchorUrl: 'https://github.com',
      }),
    ];
    const realTabs: RealTab[] = [
      makeRealTab({ id: 10, url: 'https://github.com', index: 0 }),
    ];

    const result = reconcileNodes(nodes, realTabs);
    const p1 = result.find(n => n.id === 'p1') as TabNode;

    expect(p1.customTitle).toBe('My GitHub');
  });

  it('preserves deep nesting across multiple levels', () => {
    const folder = makeFolder({ id: 'f1', position: 0 });
    const parent = makeTab({
      id: 'p1', firefoxTabId: 10, zone: 'permanent', parentId: 'f1',
      url: 'https://a.com', anchorUrl: 'https://a.com', position: 0,
    });
    const child = makeTab({
      id: 'p2', firefoxTabId: 11, zone: 'permanent', parentId: 'p1',
      url: 'https://b.com', anchorUrl: 'https://b.com', position: 0,
    });
    const nodes: TreeNode[] = [folder, parent, child];
    const realTabs: RealTab[] = [
      makeRealTab({ id: 10, url: 'https://a.com', index: 0 }),
      makeRealTab({ id: 11, url: 'https://b.com', index: 1 }),
    ];

    const result = reconcileNodes(nodes, realTabs);

    expect(result.find(n => n.id === 'p1')!.parentId).toBe('f1');
    expect(result.find(n => n.id === 'p2')!.parentId).toBe('p1');
  });
});

// ── Phase 2: URL fallback matching ──────────────────────────────────────────

describe('reconcile – URL fallback matching', () => {
  it('matches by URL when tab IDs have changed (browser restart)', () => {
    const nodes: TreeNode[] = [
      makeTab({
        id: 'p1', firefoxTabId: 99, zone: 'permanent',
        url: 'https://github.com', anchorUrl: 'https://github.com',
      }),
    ];
    const realTabs: RealTab[] = [
      makeRealTab({ id: 200, url: 'https://github.com', index: 0 }),
    ];

    const result = reconcileNodes(nodes, realTabs);
    const p1 = result.find(n => n.id === 'p1') as TabNode;

    expect(p1).toBeDefined();
    expect(p1.zone).toBe('permanent');
    expect(p1.firefoxTabId).toBe(200);
    expect(p1.anchorUrl).toBe('https://github.com');
  });

  it('preserves nesting when falling back to URL matching', () => {
    const folder = makeFolder({ id: 'f1', position: 0 });
    const nodes: TreeNode[] = [
      folder,
      makeTab({
        id: 'p1', firefoxTabId: 99, zone: 'permanent', parentId: 'f1',
        url: 'https://jira.example.com', anchorUrl: 'https://jira.example.com',
      }),
    ];
    const realTabs: RealTab[] = [
      makeRealTab({ id: 200, url: 'https://jira.example.com', index: 0 }),
    ];

    const result = reconcileNodes(nodes, realTabs);
    const p1 = result.find(n => n.id === 'p1') as TabNode;

    expect(p1.parentId).toBe('f1');
    expect(p1.zone).toBe('permanent');
  });

  it('handles duplicate URLs by matching in browser index order', () => {
    const nodes: TreeNode[] = [
      makeTab({ id: 'p1', firefoxTabId: 90, zone: 'permanent', url: 'https://github.com', position: 0, anchorUrl: 'https://github.com' }),
      makeTab({ id: 'e1', firefoxTabId: 91, zone: 'ephemeral', url: 'https://github.com', position: 0 }),
    ];
    const realTabs: RealTab[] = [
      makeRealTab({ id: 200, url: 'https://github.com', index: 0 }),
      makeRealTab({ id: 201, url: 'https://github.com', index: 1 }),
    ];

    const result = reconcileNodes(nodes, realTabs);
    const p1 = result.find(n => n.id === 'p1') as TabNode;
    const e1 = result.find(n => n.id === 'e1') as TabNode;

    expect(p1.zone).toBe('permanent');
    expect(e1.zone).toBe('ephemeral');
    expect(p1.firefoxTabId).toBe(200);
    expect(e1.firefoxTabId).toBe(201);
  });
});

// ── Mixed matching ──────────────────────────────────────────────────────────

describe('reconcile – mixed ID and URL matching', () => {
  it('matches some by ID and some by URL', () => {
    const nodes: TreeNode[] = [
      makeTab({ id: 'p1', firefoxTabId: 10, zone: 'permanent', url: 'https://github.com', anchorUrl: 'https://github.com', position: 0 }),
      makeTab({ id: 'p2', firefoxTabId: 99, zone: 'permanent', url: 'https://docs.dev', anchorUrl: 'https://docs.dev', position: 1 }),
    ];
    const realTabs: RealTab[] = [
      makeRealTab({ id: 10, url: 'https://github.com', index: 0 }),
      makeRealTab({ id: 200, url: 'https://docs.dev', index: 1 }),
    ];

    const result = reconcileNodes(nodes, realTabs);

    const p1 = result.find(n => n.id === 'p1') as TabNode;
    expect(p1.firefoxTabId).toBe(10);
    expect(p1.zone).toBe('permanent');

    const p2 = result.find(n => n.id === 'p2') as TabNode;
    expect(p2.firefoxTabId).toBe(200);
    expect(p2.zone).toBe('permanent');
  });
});

// ── Unmatched nodes ─────────────────────────────────────────────────────────

describe('reconcile – unmatched saved nodes', () => {
  it('removes saved tab nodes that have no matching real tab', () => {
    const nodes: TreeNode[] = [
      makeTab({ id: 'p1', firefoxTabId: 10, zone: 'permanent', url: 'https://closed.com', anchorUrl: 'https://closed.com' }),
    ];
    const realTabs: RealTab[] = [];

    const result = reconcileNodes(nodes, realTabs);

    expect(result.find(n => n.id === 'p1')).toBeUndefined();
  });

  it('reparents children of removed tab nodes to the removed node parent', () => {
    const nodes: TreeNode[] = [
      makeTab({ id: 'parent', firefoxTabId: 10, zone: 'permanent', url: 'https://closed.com', parentId: null }),
      makeTab({ id: 'child', firefoxTabId: 11, zone: 'permanent', url: 'https://child.com', parentId: 'parent' }),
    ];
    const realTabs: RealTab[] = [
      makeRealTab({ id: 11, url: 'https://child.com', index: 0 }),
    ];

    const result = reconcileNodes(nodes, realTabs);

    expect(result.find(n => n.id === 'parent')).toBeUndefined();
    expect(result.find(n => n.id === 'child')!.parentId).toBeNull();
  });

  it('preserves folders even when they have no children after reconciliation', () => {
    const folder = makeFolder({ id: 'f1', position: 0 });
    const nodes: TreeNode[] = [folder];
    const realTabs: RealTab[] = [
      makeRealTab({ id: 100, url: 'https://new.com', index: 0 }),
    ];

    const result = reconcileNodes(nodes, realTabs);

    expect(result.find(n => n.id === 'f1')).toBeDefined();
  });
});

// ── Unmatched real tabs ─────────────────────────────────────────────────────

describe('reconcile – unmatched real tabs', () => {
  it('creates ephemeral nodes for real tabs with no saved match', () => {
    const nodes: TreeNode[] = [];
    const realTabs: RealTab[] = [
      makeRealTab({ id: 100, url: 'https://new.com', title: 'New Tab', index: 0 }),
    ];

    const result = reconcileNodes(nodes, realTabs);

    expect(result).toHaveLength(1);
    const newNode = result[0] as TabNode;
    expect(newNode.type).toBe('tab');
    expect(newNode.zone).toBe('ephemeral');
    expect(newNode.url).toBe('https://new.com');
    expect(newNode.firefoxTabId).toBe(100);
    expect(newNode.parentId).toBeNull();
    expect(newNode.anchorUrl).toBeNull();
  });

  it('sets lastActiveAt on new ephemeral nodes', () => {
    const now = 1700000000000;
    const result = reconcileNodes(
      [],
      [makeRealTab({ id: 100, url: 'https://new.com', index: 0 })],
      now,
    );

    expect((result[0] as TabNode).lastActiveAt).toBe(now);
  });
});

// ── Orphan handling ─────────────────────────────────────────────────────────

describe('reconcile – orphan handling', () => {
  it('fixes orphaned nodes whose parent folder was removed externally', () => {
    const nodes: TreeNode[] = [
      makeTab({
        id: 'p1', firefoxTabId: 10, zone: 'permanent',
        url: 'https://a.com', parentId: 'missing-folder',
      }),
    ];
    const realTabs: RealTab[] = [
      makeRealTab({ id: 10, url: 'https://a.com', index: 0 }),
    ];

    const result = reconcileNodes(nodes, realTabs);

    expect(result.find(n => n.id === 'p1')!.parentId).toBeNull();
  });
});

// ── Position renumbering ────────────────────────────────────────────────────

describe('reconcile – position renumbering', () => {
  it('renumbers root positions after reconciliation', () => {
    const nodes: TreeNode[] = [
      makeTab({ id: 'p1', firefoxTabId: 10, zone: 'permanent', url: 'https://a.com', position: 5, anchorUrl: 'https://a.com' }),
      makeTab({ id: 'p2', firefoxTabId: 11, zone: 'permanent', url: 'https://b.com', position: 10, anchorUrl: 'https://b.com' }),
      makeTab({ id: 'e1', firefoxTabId: 12, zone: 'ephemeral', url: 'https://c.com', position: 7 }),
    ];
    const realTabs: RealTab[] = [
      makeRealTab({ id: 10, url: 'https://a.com', index: 0 }),
      makeRealTab({ id: 11, url: 'https://b.com', index: 1 }),
      makeRealTab({ id: 12, url: 'https://c.com', index: 2 }),
    ];

    const result = reconcileNodes(nodes, realTabs);

    const permanentRoots = result
      .filter(n => n.parentId === null && n.zone === 'permanent')
      .sort((a, b) => a.position - b.position);
    expect(permanentRoots.map(n => n.position)).toEqual([0, 1]);

    const ephemeralRoots = result
      .filter(n => n.parentId === null && n.zone === 'ephemeral')
      .sort((a, b) => a.position - b.position);
    expect(ephemeralRoots.map(n => n.position)).toEqual([0]);
  });
});

// ── The original bug scenario ───────────────────────────────────────────────

describe('reconcile – extension reload regression', () => {
  it('preserves all permanent tabs and nesting on extension reload (same tab IDs)', () => {
    const folder = makeFolder({ id: 'f1', position: 0, name: 'Work' });
    const nodes: TreeNode[] = [
      makeTab({ id: 'p1', firefoxTabId: 1, zone: 'permanent', url: 'https://github.com', anchorUrl: 'https://github.com', position: 0 }),
      makeTab({ id: 'p2', firefoxTabId: 2, zone: 'permanent', url: 'https://docs.dev/page', anchorUrl: 'https://docs.dev', position: 1 }),
      folder,
      makeTab({ id: 'p3', firefoxTabId: 3, zone: 'permanent', url: 'https://jira.example.com', anchorUrl: 'https://jira.example.com', parentId: 'f1', position: 0 }),
      makeTab({ id: 'e1', firefoxTabId: 4, zone: 'ephemeral', url: 'https://stackoverflow.com', position: 0 }),
      makeTab({ id: 'e2', firefoxTabId: 5, zone: 'ephemeral', url: 'https://reddit.com', position: 1 }),
    ];

    const realTabs: RealTab[] = [
      makeRealTab({ id: 1, url: 'https://github.com', index: 0 }),
      makeRealTab({ id: 2, url: 'https://docs.dev/page', index: 1 }),
      makeRealTab({ id: 3, url: 'https://jira.example.com', index: 2 }),
      makeRealTab({ id: 4, url: 'https://stackoverflow.com', index: 3 }),
      makeRealTab({ id: 5, url: 'https://reddit.com', index: 4 }),
    ];

    const result = reconcileNodes(nodes, realTabs);

    expect(result.filter(n => n.zone === 'permanent' && n.type === 'tab')).toHaveLength(3);
    expect(result.filter(n => n.zone === 'ephemeral')).toHaveLength(2);

    const p1 = result.find(n => n.id === 'p1') as TabNode;
    expect(p1.zone).toBe('permanent');
    expect(p1.parentId).toBeNull();

    const p3 = result.find(n => n.id === 'p3') as TabNode;
    expect(p3.zone).toBe('permanent');
    expect(p3.parentId).toBe('f1');

    expect(result.find(n => n.id === 'f1')).toBeDefined();
  });

  it('preserves permanent tabs when URLs drifted but tab IDs match', () => {
    const nodes: TreeNode[] = [
      makeTab({
        id: 'p1', firefoxTabId: 1, zone: 'permanent',
        url: 'https://github.com/old-path',
        anchorUrl: 'https://github.com',
        customTitle: 'GH',
        position: 0,
      }),
      makeTab({
        id: 'p2', firefoxTabId: 2, zone: 'permanent',
        url: 'https://docs.dev/old-page',
        anchorUrl: 'https://docs.dev',
        position: 1,
      }),
    ];

    const realTabs: RealTab[] = [
      makeRealTab({ id: 1, url: 'https://github.com/new-path', index: 0 }),
      makeRealTab({ id: 2, url: 'https://docs.dev/new-page', index: 1 }),
    ];

    const result = reconcileNodes(nodes, realTabs);

    const p1 = result.find(n => n.id === 'p1') as TabNode;
    expect(p1.zone).toBe('permanent');
    expect(p1.url).toBe('https://github.com/new-path');
    expect(p1.anchorUrl).toBe('https://github.com');
    expect(p1.customTitle).toBe('GH');

    const p2 = result.find(n => n.id === 'p2') as TabNode;
    expect(p2.zone).toBe('permanent');
    expect(p2.url).toBe('https://docs.dev/new-page');
  });

  it('does NOT demote permanent tabs to ephemeral even when URL changed', () => {
    const nodes: TreeNode[] = [
      makeTab({
        id: 'p1', firefoxTabId: 1, zone: 'permanent',
        url: 'https://old-url.com',
        anchorUrl: 'https://old-url.com',
      }),
    ];
    const realTabs: RealTab[] = [
      makeRealTab({ id: 1, url: 'https://completely-different.com', index: 0 }),
    ];

    const result = reconcileNodes(nodes, realTabs);
    const p1 = result.find(n => n.id === 'p1') as TabNode;

    expect(p1).toBeDefined();
    expect(p1.zone).toBe('permanent');
    expect(p1.url).toBe('https://completely-different.com');
  });

  it('handles the case where debounced save missed the last URL update', () => {
    const nodes: TreeNode[] = [
      makeTab({
        id: 'p1', firefoxTabId: 1, zone: 'permanent',
        url: 'https://stale-url.com',
        anchorUrl: 'https://stale-url.com',
        position: 0,
      }),
      makeFolder({ id: 'f1', position: 1 }),
      makeTab({
        id: 'p2', firefoxTabId: 2, zone: 'permanent',
        url: 'https://also-stale.com',
        anchorUrl: 'https://also-stale.com',
        parentId: 'f1',
        position: 0,
      }),
    ];

    const realTabs: RealTab[] = [
      makeRealTab({ id: 1, url: 'https://navigated-here.com', index: 0 }),
      makeRealTab({ id: 2, url: 'https://navigated-there.com', index: 1 }),
    ];

    const result = reconcileNodes(nodes, realTabs);

    expect(result.filter(n => n.zone === 'ephemeral')).toHaveLength(0);

    const p1 = result.find(n => n.id === 'p1') as TabNode;
    expect(p1.zone).toBe('permanent');
    expect(p1.parentId).toBeNull();

    const p2 = result.find(n => n.id === 'p2') as TabNode;
    expect(p2.zone).toBe('permanent');
    expect(p2.parentId).toBe('f1');
  });
});

// ── Session recovery (full addon unload/reload) ─────────────────────────

describe('reconcile – session recovery (storage cleared, session state available)', () => {
  function makeSessionState(): TabbyState {
    return {
      nodes: [
        makeTab({ id: 'p1', firefoxTabId: 1, zone: 'permanent', url: 'https://github.com', anchorUrl: 'https://github.com', position: 0 }),
        makeFolder({ id: 'f1', position: 1, name: 'Work' }),
        makeTab({ id: 'p2', firefoxTabId: 2, zone: 'permanent', url: 'https://jira.example.com', anchorUrl: 'https://jira.example.com', parentId: 'f1', position: 0, customTitle: 'Tickets' }),
        makeTab({ id: 'e1', firefoxTabId: 3, zone: 'ephemeral', url: 'https://reddit.com', position: 0 }),
      ],
      recentlyClosed: [],
      settings: { expiryMs: DEFAULT_EXPIRY_MS },
    };
  }

  it('recovers permanent tabs and nesting from session state after storage wipe', () => {
    const sessionState = makeSessionState();
    const realTabs: RealTab[] = [
      makeRealTab({ id: 1, url: 'https://github.com', index: 0 }),
      makeRealTab({ id: 2, url: 'https://jira.example.com', index: 1 }),
      makeRealTab({ id: 3, url: 'https://reddit.com', index: 2 }),
    ];

    // Simulate: loadState() returned empty, but sessionState was recovered.
    // init() passes sessionState.nodes to reconcile.
    const result = reconcileNodes(sessionState.nodes, realTabs);

    const p1 = result.find(n => n.id === 'p1') as TabNode;
    expect(p1.zone).toBe('permanent');
    expect(p1.anchorUrl).toBe('https://github.com');

    const p2 = result.find(n => n.id === 'p2') as TabNode;
    expect(p2.zone).toBe('permanent');
    expect(p2.parentId).toBe('f1');
    expect(p2.customTitle).toBe('Tickets');

    const f1 = result.find(n => n.id === 'f1');
    expect(f1).toBeDefined();
    expect(f1!.type).toBe('folder');

    const e1 = result.find(n => n.id === 'e1') as TabNode;
    expect(e1.zone).toBe('ephemeral');
  });

  it('recovers even when tab IDs changed (browser restart + storage wipe)', () => {
    const sessionState = makeSessionState();
    const realTabs: RealTab[] = [
      makeRealTab({ id: 100, url: 'https://github.com', index: 0 }),
      makeRealTab({ id: 101, url: 'https://jira.example.com', index: 1 }),
      makeRealTab({ id: 102, url: 'https://reddit.com', index: 2 }),
    ];

    const result = reconcileNodes(sessionState.nodes, realTabs);

    const p1 = result.find(n => n.id === 'p1') as TabNode;
    expect(p1.zone).toBe('permanent');
    expect(p1.firefoxTabId).toBe(100);

    const p2 = result.find(n => n.id === 'p2') as TabNode;
    expect(p2.zone).toBe('permanent');
    expect(p2.parentId).toBe('f1');
    expect(p2.firefoxTabId).toBe(101);
  });

  it('handles new tabs that appeared after session was saved', () => {
    const sessionState = makeSessionState();
    const realTabs: RealTab[] = [
      makeRealTab({ id: 1, url: 'https://github.com', index: 0 }),
      makeRealTab({ id: 2, url: 'https://jira.example.com', index: 1 }),
      makeRealTab({ id: 3, url: 'https://reddit.com', index: 2 }),
      makeRealTab({ id: 4, url: 'https://new-tab.com', index: 3 }),
    ];

    const result = reconcileNodes(sessionState.nodes, realTabs);

    expect(result.filter(n => n.zone === 'permanent' && n.type === 'tab')).toHaveLength(2);
    const newTab = result.find(n => (n as TabNode).firefoxTabId === 4) as TabNode;
    expect(newTab).toBeDefined();
    expect(newTab.zone).toBe('ephemeral');
    expect(newTab.url).toBe('https://new-tab.com');
  });

  it('handles closed tabs that no longer exist in the browser', () => {
    const sessionState = makeSessionState();
    const realTabs: RealTab[] = [
      makeRealTab({ id: 1, url: 'https://github.com', index: 0 }),
      // tab 2 (jira) was closed, tab 3 (reddit) still exists
      makeRealTab({ id: 3, url: 'https://reddit.com', index: 1 }),
    ];

    const result = reconcileNodes(sessionState.nodes, realTabs);

    expect(result.find(n => n.id === 'p2')).toBeUndefined();
    expect(result.find(n => n.id === 'p1')).toBeDefined();
    expect((result.find(n => n.id === 'p1') as TabNode).zone).toBe('permanent');
    expect(result.find(n => n.id === 'f1')).toBeDefined();
  });

  it('with empty nodes and real tabs, creates all-ephemeral nodes', () => {
    const realTabs: RealTab[] = [
      makeRealTab({ id: 1, url: 'https://github.com', index: 0 }),
      makeRealTab({ id: 2, url: 'https://jira.example.com', index: 1 }),
    ];

    const result = reconcileNodes([], realTabs);

    expect(result).toHaveLength(2);
    expect(result.every(n => n.zone === 'ephemeral')).toBe(true);
  });
});
