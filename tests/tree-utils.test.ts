import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getChildren,
  getSubtree,
  getRootNodes,
  getMaxLastActiveAt,
  getNextPosition,
  generateId,
  getExpiryProgress,
  renumberPositions,
} from '../src/shared/tree-utils';
import type { TabNode, FolderNode, TreeNode } from '../src/shared/types';

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

// ── getChildren ─────────────────────────────────────────────────────────

describe('getChildren', () => {
  it('returns direct children sorted by position', () => {
    const nodes: TreeNode[] = [
      makeTab({ id: 'c2', firefoxTabId: 2, parentId: 'root', position: 2 }),
      makeTab({ id: 'c1', firefoxTabId: 1, parentId: 'root', position: 0 }),
      makeTab({ id: 'c3', firefoxTabId: 3, parentId: 'root', position: 1 }),
      makeTab({ id: 'other', firefoxTabId: 4, parentId: 'other-parent', position: 0 }),
    ];

    expect(getChildren(nodes, 'root').map(n => n.id)).toEqual(['c1', 'c3', 'c2']);
  });

  it('filters by zone when specified', () => {
    const nodes: TreeNode[] = [
      makeTab({ id: 'p1', firefoxTabId: 1, parentId: null, zone: 'permanent', position: 0 }),
      makeTab({ id: 'e1', firefoxTabId: 2, parentId: null, zone: 'ephemeral', position: 0 }),
      makeTab({ id: 'p2', firefoxTabId: 3, parentId: null, zone: 'permanent', position: 1 }),
    ];

    expect(getChildren(nodes, null, 'permanent').map(n => n.id)).toEqual(['p1', 'p2']);
    expect(getChildren(nodes, null, 'ephemeral').map(n => n.id)).toEqual(['e1']);
  });

  it('returns empty array when no children match', () => {
    const nodes: TreeNode[] = [
      makeTab({ id: 't1', firefoxTabId: 1, parentId: 'other', position: 0 }),
    ];
    expect(getChildren(nodes, 'nonexistent')).toEqual([]);
  });

  it('returns root-level nodes when parentId is null', () => {
    const nodes: TreeNode[] = [
      makeTab({ id: 't1', firefoxTabId: 1, parentId: null, position: 1 }),
      makeTab({ id: 't2', firefoxTabId: 2, parentId: null, position: 0 }),
      makeTab({ id: 't3', firefoxTabId: 3, parentId: 'some', position: 0 }),
    ];
    expect(getChildren(nodes, null).map(n => n.id)).toEqual(['t2', 't1']);
  });
});

// ── getSubtree ──────────────────────────────────────────────────────────

describe('getSubtree', () => {
  it('returns only the root node when it has no children', () => {
    const nodes: TreeNode[] = [makeTab({ id: 'root', firefoxTabId: 1 })];
    expect(getSubtree(nodes, 'root').map(n => n.id)).toEqual(['root']);
  });

  it('returns empty array when root not found', () => {
    expect(getSubtree([], 'nonexistent')).toEqual([]);
  });

  it('returns the full recursive subtree', () => {
    const nodes: TreeNode[] = [
      makeFolder({ id: 'f1', position: 0 }),
      makeTab({ id: 't1', firefoxTabId: 1, parentId: 'f1', position: 0 }),
      makeTab({ id: 't2', firefoxTabId: 2, parentId: 't1', position: 0 }),
      makeTab({ id: 'unrelated', firefoxTabId: 3, parentId: null, position: 0 }),
    ];

    const ids = getSubtree(nodes, 'f1').map(n => n.id);
    expect(ids).toContain('f1');
    expect(ids).toContain('t1');
    expect(ids).toContain('t2');
    expect(ids).not.toContain('unrelated');
  });

  it('handles deeply nested trees', () => {
    const nodes: TreeNode[] = [
      makeTab({ id: 'a', firefoxTabId: 1 }),
      makeTab({ id: 'b', firefoxTabId: 2, parentId: 'a' }),
      makeTab({ id: 'c', firefoxTabId: 3, parentId: 'b' }),
      makeTab({ id: 'd', firefoxTabId: 4, parentId: 'c' }),
    ];
    expect(getSubtree(nodes, 'a')).toHaveLength(4);
    expect(getSubtree(nodes, 'b')).toHaveLength(3);
    expect(getSubtree(nodes, 'c')).toHaveLength(2);
    expect(getSubtree(nodes, 'd')).toHaveLength(1);
  });
});

// ── getRootNodes ────────────────────────────────────────────────────────

describe('getRootNodes', () => {
  it('returns root nodes of the specified zone sorted by position', () => {
    const nodes: TreeNode[] = [
      makeTab({ id: 'p2', firefoxTabId: 2, parentId: null, zone: 'permanent', position: 1 }),
      makeTab({ id: 'p1', firefoxTabId: 1, parentId: null, zone: 'permanent', position: 0 }),
      makeTab({ id: 'e1', firefoxTabId: 3, parentId: null, zone: 'ephemeral', position: 0 }),
      makeTab({ id: 'child', firefoxTabId: 4, parentId: 'p1', zone: 'permanent', position: 0 }),
    ];

    expect(getRootNodes(nodes, 'permanent').map(n => n.id)).toEqual(['p1', 'p2']);
    expect(getRootNodes(nodes, 'ephemeral').map(n => n.id)).toEqual(['e1']);
  });

  it('returns empty array when no roots exist for the zone', () => {
    const nodes: TreeNode[] = [
      makeTab({ id: 'e1', firefoxTabId: 1, parentId: null, zone: 'ephemeral', position: 0 }),
    ];
    expect(getRootNodes(nodes, 'permanent')).toEqual([]);
  });
});

// ── getMaxLastActiveAt ──────────────────────────────────────────────────

describe('getMaxLastActiveAt', () => {
  it('returns the maximum lastActiveAt across the subtree', () => {
    const nodes: TreeNode[] = [
      makeTab({ id: 'root', firefoxTabId: 1, lastActiveAt: 100 }),
      makeTab({ id: 'child1', firefoxTabId: 2, parentId: 'root', lastActiveAt: 500 }),
      makeTab({ id: 'child2', firefoxTabId: 3, parentId: 'root', lastActiveAt: 300 }),
    ];
    expect(getMaxLastActiveAt(nodes, 'root')).toBe(500);
  });

  it('returns 0 when the subtree contains only folders', () => {
    const nodes: TreeNode[] = [makeFolder({ id: 'f1' })];
    expect(getMaxLastActiveAt(nodes, 'f1')).toBe(0);
  });

  it('returns 0 when root not found', () => {
    expect(getMaxLastActiveAt([], 'nonexistent')).toBe(0);
  });

  it('ignores tabs with null lastActiveAt', () => {
    const nodes: TreeNode[] = [
      makeTab({ id: 'root', firefoxTabId: 1, lastActiveAt: null, zone: 'permanent' }),
      makeTab({ id: 'child', firefoxTabId: 2, parentId: 'root', lastActiveAt: 200 }),
    ];
    expect(getMaxLastActiveAt(nodes, 'root')).toBe(200);
  });

  it('returns 0 when all tabs have null lastActiveAt', () => {
    const nodes: TreeNode[] = [
      makeTab({ id: 'root', firefoxTabId: 1, lastActiveAt: null, zone: 'permanent' }),
    ];
    expect(getMaxLastActiveAt(nodes, 'root')).toBe(0);
  });
});

// ── getNextPosition ─────────────────────────────────────────────────────

describe('getNextPosition', () => {
  it('returns 0 when parent has no children', () => {
    expect(getNextPosition([], null)).toBe(0);
    expect(getNextPosition([], 'parent')).toBe(0);
  });

  it('returns max position + 1', () => {
    const nodes: TreeNode[] = [
      makeTab({ id: 't1', firefoxTabId: 1, parentId: null, position: 0 }),
      makeTab({ id: 't2', firefoxTabId: 2, parentId: null, position: 3 }),
      makeTab({ id: 't3', firefoxTabId: 3, parentId: null, position: 1 }),
    ];
    expect(getNextPosition(nodes, null)).toBe(4);
  });

  it('respects zone filter', () => {
    const nodes: TreeNode[] = [
      makeTab({ id: 'p1', firefoxTabId: 1, parentId: null, zone: 'permanent', position: 5 }),
      makeTab({ id: 'e1', firefoxTabId: 2, parentId: null, zone: 'ephemeral', position: 2 }),
    ];
    expect(getNextPosition(nodes, null, 'permanent')).toBe(6);
    expect(getNextPosition(nodes, null, 'ephemeral')).toBe(3);
  });
});

// ── generateId ──────────────────────────────────────────────────────────

describe('generateId', () => {
  it('returns a string', () => {
    expect(typeof generateId()).toBe('string');
  });

  it('returns unique values on successive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

// ── getExpiryProgress ───────────────────────────────────────────────────

describe('getExpiryProgress', () => {
  it('returns ~1 when just activated', () => {
    expect(getExpiryProgress(Date.now(), 10_000)).toBeCloseTo(1, 1);
  });

  it('returns 0 when fully expired', () => {
    expect(getExpiryProgress(Date.now() - 20_000, 10_000)).toBe(0);
  });

  it('returns ~0.5 at the halfway point', () => {
    const expiryMs = 10_000;
    expect(getExpiryProgress(Date.now() - expiryMs / 2, expiryMs)).toBeCloseTo(0.5, 1);
  });

  it('clamps to 0 for very old timestamps', () => {
    expect(getExpiryProgress(0, 1000)).toBe(0);
  });

  it('clamps to 1 when lastActiveAt is in the future', () => {
    expect(getExpiryProgress(Date.now() + 100_000, 1000)).toBe(1);
  });

  describe('with fake timers (reset scenarios)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('returns near-full progress after lastActiveAt is refreshed to now', () => {
      const expiryMs = 60_000;
      vi.setSystemTime(100_000);

      const staleLastActiveAt = 100_000 - expiryMs / 2;
      const staleProg = getExpiryProgress(staleLastActiveAt, expiryMs);
      expect(staleProg).toBeCloseTo(0.5, 1);

      const freshLastActiveAt = Date.now();
      const freshProg = getExpiryProgress(freshLastActiveAt, expiryMs);
      expect(freshProg).toBeCloseTo(1, 1);
    });

    it('decays proportionally as time elapses after reset', () => {
      const expiryMs = 10_000;
      vi.setSystemTime(50_000);

      const lastActiveAt = Date.now();
      expect(getExpiryProgress(lastActiveAt, expiryMs)).toBeCloseTo(1, 1);

      vi.setSystemTime(50_000 + expiryMs * 0.25);
      expect(getExpiryProgress(lastActiveAt, expiryMs)).toBeCloseTo(0.75, 1);

      vi.setSystemTime(50_000 + expiryMs * 0.75);
      expect(getExpiryProgress(lastActiveAt, expiryMs)).toBeCloseTo(0.25, 1);

      vi.setSystemTime(50_000 + expiryMs);
      expect(getExpiryProgress(lastActiveAt, expiryMs)).toBe(0);
    });
  });
});

// ── renumberPositions ───────────────────────────────────────────────────

describe('renumberPositions', () => {
  it('renumbers children sequentially preserving sort order', () => {
    const nodes: TreeNode[] = [
      makeTab({ id: 't1', firefoxTabId: 1, parentId: null, position: 5, zone: 'ephemeral' }),
      makeTab({ id: 't2', firefoxTabId: 2, parentId: null, position: 10, zone: 'ephemeral' }),
      makeTab({ id: 't3', firefoxTabId: 3, parentId: null, position: 2, zone: 'ephemeral' }),
    ];

    renumberPositions(nodes, null, 'ephemeral');

    expect(nodes.find(n => n.id === 't3')!.position).toBe(0);
    expect(nodes.find(n => n.id === 't1')!.position).toBe(1);
    expect(nodes.find(n => n.id === 't2')!.position).toBe(2);
  });

  it('only affects nodes matching parentId and zone', () => {
    const nodes: TreeNode[] = [
      makeTab({ id: 't1', firefoxTabId: 1, parentId: null, zone: 'permanent', position: 5 }),
      makeTab({ id: 't2', firefoxTabId: 2, parentId: null, zone: 'ephemeral', position: 10 }),
    ];

    renumberPositions(nodes, null, 'permanent');

    expect(nodes.find(n => n.id === 't1')!.position).toBe(0);
    expect(nodes.find(n => n.id === 't2')!.position).toBe(10);
  });

  it('renumbers children within a specific parent', () => {
    const nodes: TreeNode[] = [
      makeFolder({ id: 'f1' }),
      makeTab({ id: 't1', firefoxTabId: 1, parentId: 'f1', zone: 'permanent', position: 3 }),
      makeTab({ id: 't2', firefoxTabId: 2, parentId: 'f1', zone: 'permanent', position: 7 }),
      makeTab({ id: 't3', firefoxTabId: 3, parentId: null, zone: 'permanent', position: 99 }),
    ];

    renumberPositions(nodes, 'f1');

    expect(nodes.find(n => n.id === 't1')!.position).toBe(0);
    expect(nodes.find(n => n.id === 't2')!.position).toBe(1);
    expect(nodes.find(n => n.id === 't3')!.position).toBe(99);
  });

  it('handles empty node set without error', () => {
    renumberPositions([], null, 'permanent');
  });
});
