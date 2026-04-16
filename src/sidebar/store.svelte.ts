import browser from 'webextension-polyfill';
import type { TabbyState, TreeNode } from '../shared/types';
import type { Message } from '../shared/messages';
import { DEFAULT_EXPIRY_MS } from '../shared/types';

const defaultState: TabbyState = {
  nodes: [],
  recentlyClosed: [],
  settings: { expiryMs: DEFAULT_EXPIRY_MS },
};

export const tabby = $state({
  data: structuredClone(defaultState) as TabbyState,
  ui: {
    focusedNodeId: null as string | null,
    renamingNodeId: null as string | null,
    draggingNodeId: null as string | null,
    dropTarget: null as { nodeId: string; position: 'before' | 'inside' | 'after' } | null,
    dropZone: null as 'permanent' | 'ephemeral' | 'divider-above' | 'divider-below' | null,
    contextMenu: {
      visible: false,
      x: 0,
      y: 0,
      targetNode: null as TreeNode | null,
      targetZone: null as 'permanent' | 'ephemeral' | null,
    },
    collapsedOverrides: {} as Record<string, boolean>,
  },
});

export function isCollapsed(nodeId: string): boolean {
  if (nodeId in tabby.ui.collapsedOverrides) return tabby.ui.collapsedOverrides[nodeId];
  const node = tabby.data.nodes.find(n => n.id === nodeId);
  return node?.collapsed ?? false;
}

export function toggleCollapsed(nodeId: string) {
  tabby.ui.collapsedOverrides[nodeId] = !isCollapsed(nodeId);
}

export function showContextMenu(
  x: number,
  y: number,
  node: TreeNode | null,
  zone: 'permanent' | 'ephemeral' | null,
) {
  tabby.ui.contextMenu.visible = true;
  tabby.ui.contextMenu.x = x;
  tabby.ui.contextMenu.y = y;
  tabby.ui.contextMenu.targetNode = node;
  tabby.ui.contextMenu.targetZone = zone;
}

export function hideContextMenu() {
  tabby.ui.contextMenu.visible = false;
}

let port: browser.Runtime.Port | null = null;

export function connect() {
  port = browser.runtime.connect({ name: 'sidebar' });
  port.onMessage.addListener((msg: unknown) => {
    const message = msg as Message;
    if (message.type === 'STATE_UPDATED') {
      tabby.data = message.state;
    }
  });
  port.onDisconnect.addListener(() => {
    port = null;
  });
  send({ type: 'GET_STATE' });
}

function send(msg: Message) {
  port?.postMessage(msg);
}

export function activateTab(firefoxTabId: number) {
  send({ type: 'ACTIVATE_TAB', firefoxTabId });
}
export function closeTab(nodeId: string) {
  send({ type: 'CLOSE_TAB', nodeId });
}
export function promoteNode(nodeId: string) {
  send({ type: 'PROMOTE_NODE', nodeId });
}
export function demoteNode(nodeId: string) {
  send({ type: 'DEMOTE_NODE', nodeId });
}
export function moveNode(
  nodeId: string,
  newParentId: string | null,
  newPosition: number,
  newZone: 'permanent' | 'ephemeral',
) {
  send({ type: 'MOVE_NODE', nodeId, newParentId, newPosition, newZone });
}
export function createFolder(name: string, parentId: string | null, position: number) {
  send({ type: 'CREATE_FOLDER', name, parentId, position });
}
export function renameFolder(nodeId: string, name: string) {
  send({ type: 'RENAME_FOLDER', nodeId, name });
}
export function deleteFolder(nodeId: string) {
  send({ type: 'DELETE_FOLDER', nodeId });
}
export function flattenNodes(nodeIds: string[]) {
  send({ type: 'FLATTEN_NODES', nodeIds });
}
export function reAnchor(nodeId: string) {
  send({ type: 'RE_ANCHOR', nodeId });
}
export function reopenClosed(entryId: string) {
  send({ type: 'REOPEN_CLOSED', entryId });
}
export function clearDragState() {
  tabby.ui.draggingNodeId = null;
  tabby.ui.dropTarget = null;
  tabby.ui.dropZone = null;
}
