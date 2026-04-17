import type { TabNode, TreeNode } from './types';
import { getNextPosition, generateId, renumberPositions } from './tree-utils';

export interface RealTab {
  id: number;
  url: string;
  title: string;
  favIconUrl: string;
  status: string;
  index: number;
}

/**
 * Reconciles persisted tree nodes against the set of real browser tabs.
 *
 * Phase 1 – match by firefoxTabId (stable across extension reloads).
 * Phase 2 – match remaining nodes by URL (covers browser restarts where IDs change).
 *
 * Unmatched saved tab nodes are removed (children reparented).
 * Unmatched real tabs become new ephemeral root nodes.
 */
export function reconcileNodes(
  nodes: TreeNode[],
  realTabs: RealTab[],
  now = Date.now(),
): TreeNode[] {
  const matchedRealTabIds = new Set<number>();
  const matchedNodeIds = new Set<string>();

  const realTabsById = new Map(realTabs.map(t => [t.id, t]));
  const tabNodes = nodes.filter((n): n is TabNode => n.type === 'tab');

  // Phase 1: match by firefoxTabId
  for (const node of tabNodes) {
    const tab = realTabsById.get(node.firefoxTabId);
    if (!tab) continue;

    node.url = tab.url || node.url;
    node.title = tab.title || node.title;
    node.favIconUrl = tab.favIconUrl || node.favIconUrl;
    node.status = tab.status === 'loading' ? 'loading' : 'complete';
    matchedRealTabIds.add(tab.id);
    matchedNodeIds.add(node.id);
  }

  // Phase 2: match remaining saved nodes by URL
  const unmatchedRealTabs = realTabs.filter(t => !matchedRealTabIds.has(t.id));
  const tabsByUrl = new Map<string, RealTab[]>();
  for (const tab of unmatchedRealTabs) {
    const url = tab.url || '';
    const list = tabsByUrl.get(url);
    if (list) list.push(tab);
    else tabsByUrl.set(url, [tab]);
  }
  for (const tabs of tabsByUrl.values()) {
    tabs.sort((a, b) => a.index - b.index);
  }

  const unmatchedSavedNodes = tabNodes.filter(n => !matchedNodeIds.has(n.id));
  for (const node of unmatchedSavedNodes) {
    const candidates = tabsByUrl.get(node.url);
    if (!candidates || candidates.length === 0) continue;

    const tab = candidates.shift()!;
    node.firefoxTabId = tab.id;
    node.title = tab.title || node.title;
    node.favIconUrl = tab.favIconUrl || node.favIconUrl;
    node.status = tab.status === 'loading' ? 'loading' : 'complete';
    matchedRealTabIds.add(tab.id);
    matchedNodeIds.add(node.id);
    if (candidates.length === 0) tabsByUrl.delete(node.url);
  }

  // Remove unmatched saved tab nodes, promoting their children
  const unmatchedIds = new Set(
    tabNodes.filter(n => !matchedNodeIds.has(n.id)).map(n => n.id),
  );
  for (const id of unmatchedIds) {
    const node = nodes.find(n => n.id === id);
    if (!node) continue;
    for (const child of nodes) {
      if (child.parentId === id) child.parentId = node.parentId;
    }
  }
  nodes = nodes.filter(n => !unmatchedIds.has(n.id));

  // Fix orphaned nodes whose parent was removed
  const nodeIdSet = new Set(nodes.map(n => n.id));
  for (const node of nodes) {
    if (node.parentId !== null && !nodeIdSet.has(node.parentId)) {
      node.parentId = null;
    }
  }

  // Create ephemeral nodes for real tabs that weren't matched
  const finalUnmatched = realTabs.filter(t => !matchedRealTabIds.has(t.id));
  for (const tab of finalUnmatched) {
    const tabNode: TabNode = {
      id: generateId(),
      type: 'tab',
      parentId: null,
      zone: 'ephemeral',
      position: getNextPosition(nodes, null, 'ephemeral'),
      collapsed: false,
      firefoxTabId: tab.id,
      url: tab.url || '',
      title: tab.title || '',
      customTitle: null,
      favIconUrl: tab.favIconUrl || '',
      anchorUrl: null,
      status: tab.status === 'loading' ? 'loading' : 'complete',
      lastActiveAt: now,
    };
    nodes.push(tabNode);
  }

  renumberPositions(nodes, null, 'permanent');
  renumberPositions(nodes, null, 'ephemeral');
  return nodes;
}
