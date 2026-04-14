import type { TreeNode } from './types';

export function getChildren(
  nodes: TreeNode[],
  parentId: string | null,
  zone?: 'permanent' | 'ephemeral',
): TreeNode[] {
  return nodes
    .filter(n => n.parentId === parentId && (zone === undefined || n.zone === zone))
    .sort((a, b) => a.position - b.position);
}

export function getSubtree(nodes: TreeNode[], rootId: string): TreeNode[] {
  const result: TreeNode[] = [];
  const root = nodes.find(n => n.id === rootId);
  if (!root) return result;
  result.push(root);
  for (const child of nodes.filter(n => n.parentId === rootId)) {
    result.push(...getSubtree(nodes, child.id));
  }
  return result;
}

export function getRootNodes(
  nodes: TreeNode[],
  zone: 'permanent' | 'ephemeral',
): TreeNode[] {
  return nodes
    .filter(n => n.parentId === null && n.zone === zone)
    .sort((a, b) => a.position - b.position);
}

export function getMaxLastActiveAt(nodes: TreeNode[], rootId: string): number {
  const subtree = getSubtree(nodes, rootId);
  let max = 0;
  for (const node of subtree) {
    if (node.type === 'tab' && node.lastActiveAt !== null && node.lastActiveAt > max) {
      max = node.lastActiveAt;
    }
  }
  return max;
}

export function getNextPosition(
  nodes: TreeNode[],
  parentId: string | null,
  zone?: 'permanent' | 'ephemeral',
): number {
  const siblings = getChildren(nodes, parentId, zone);
  if (siblings.length === 0) return 0;
  return Math.max(...siblings.map(n => n.position)) + 1;
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function getExpiryProgress(lastActiveAt: number, expiryMs: number): number {
  const elapsed = Date.now() - lastActiveAt;
  return Math.max(0, Math.min(1, 1 - elapsed / expiryMs));
}

export function renumberPositions(nodes: TreeNode[], parentId: string | null, zone?: 'permanent' | 'ephemeral'): void {
  const siblings = getChildren(nodes, parentId, zone);
  siblings.forEach((node, i) => {
    node.position = i;
  });
}
