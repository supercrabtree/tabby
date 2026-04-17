import browser from 'webextension-polyfill';
import type { TabbyState, TabNode, FolderNode, TreeNode } from '../shared/types';
import type { Message } from '../shared/messages';
import { loadState, debouncedSave } from '../shared/storage';
import {
  getSubtree,
  getRootNodes,
  getMaxLastActiveAt,
  getNextPosition,
  generateId,
  renumberPositions,
} from '../shared/tree-utils';
import { reconcileNodes } from '../shared/reconcile';

let state: TabbyState;
const sidebarPorts = new Set<browser.Runtime.Port>();
const closingTabIds = new Set<number>();

// ── Broadcasting & persistence ──────────────────────────────────────────

function broadcastState(): void {
  const msg: Message = { type: 'STATE_UPDATED', state };
  for (const port of sidebarPorts) {
    port.postMessage(msg);
  }
  debouncedSave(state);
}

// ── Tab event handlers ──────────────────────────────────────────────────

function handleTabCreated(tab: browser.Tabs.Tab): void {
  const node: TabNode = {
    id: generateId(),
    type: 'tab',
    parentId: null,
    zone: 'ephemeral',
    position: 0,
    collapsed: false,
    firefoxTabId: tab.id!,
    url: tab.url || '',
    title: tab.title || '',
    customTitle: null,
    favIconUrl: tab.favIconUrl || '',
    anchorUrl: null,
    status: tab.status === 'loading' ? 'loading' : 'complete',
    lastActiveAt: Date.now(),
  };

  let nested = false;
  if (tab.openerTabId !== undefined) {
    const opener = state.nodes.find(
      (n): n is TabNode => n.type === 'tab' && n.firefoxTabId === tab.openerTabId,
    );
    if (opener) {
      node.parentId = opener.id;
      node.zone = opener.zone;
      node.position = getNextPosition(state.nodes, opener.id);
      if (opener.zone === 'permanent') {
        node.lastActiveAt = null;
      }
      nested = true;
    }
  }

  if (!nested) {
    node.position = getNextPosition(state.nodes, null, 'ephemeral');
  }

  state.nodes.push(node);
  broadcastState();
}

function handleTabRemoved(tabId: number): void {
  if (closingTabIds.has(tabId)) {
    closingTabIds.delete(tabId);
    return;
  }

  const node = state.nodes.find(
    (n): n is TabNode => n.type === 'tab' && n.firefoxTabId === tabId,
  );
  if (!node) return;

  const { parentId, zone, id } = node;

  state.recentlyClosed.push({
    id: generateId(),
    title: node.title,
    url: node.url,
    favIconUrl: node.favIconUrl,
    closedAt: Date.now(),
  });

  for (const child of state.nodes) {
    if (child.parentId === id) child.parentId = parentId;
  }

  state.nodes = state.nodes.filter(n => n.id !== id);
  renumberPositions(state.nodes, parentId, zone);
  broadcastState();
}

function handleTabUpdated(
  tabId: number,
  changeInfo: browser.Tabs.OnUpdatedChangeInfoType,
): void {
  const node = state.nodes.find(
    (n): n is TabNode => n.type === 'tab' && n.firefoxTabId === tabId,
  );
  if (!node) return;

  if (changeInfo.url !== undefined) node.url = changeInfo.url;
  if (changeInfo.title !== undefined) node.title = changeInfo.title;
  if (changeInfo.favIconUrl !== undefined) node.favIconUrl = changeInfo.favIconUrl;
  if (changeInfo.status !== undefined) {
    node.status = changeInfo.status === 'loading' ? 'loading' : 'complete';
    if (node.status === 'complete' && node.zone === 'permanent' && node.anchorUrl === null) {
      node.anchorUrl = node.url;
    }
  }

  broadcastState();
}

function handleTabActivated(activeInfo: browser.Tabs.OnActivatedActiveInfoType): void {
  const node = state.nodes.find(
    (n): n is TabNode => n.type === 'tab' && n.firefoxTabId === activeInfo.tabId,
  );
  if (!node) return;

  if (node.zone === 'ephemeral') {
    node.lastActiveAt = Date.now();
  }

  broadcastState();
}

// ── Folder dissolution helper ───────────────────────────────────────────

function dissolveFolders(subtree: TreeNode[], reparentTo: string | null): Set<string> {
  const folderIds = new Set<string>();
  for (const n of subtree) {
    if (n.type === 'folder') folderIds.add(n.id);
  }
  if (folderIds.size === 0) return folderIds;

  for (const n of state.nodes) {
    if (n.parentId !== null && folderIds.has(n.parentId)) {
      n.parentId = reparentTo;
    }
  }

  state.nodes = state.nodes.filter(n => !folderIds.has(n.id));
  return folderIds;
}

// ── Message handlers ────────────────────────────────────────────────────

function handleCloseTab(nodeId: string): void {
  const node = state.nodes.find(
    (n): n is TabNode => n.id === nodeId && n.type === 'tab',
  );
  if (!node) return;

  const { parentId, zone, firefoxTabId } = node;

  state.recentlyClosed.push({
    id: generateId(),
    title: node.title,
    url: node.url,
    favIconUrl: node.favIconUrl,
    closedAt: Date.now(),
  });

  for (const child of state.nodes) {
    if (child.parentId === nodeId) child.parentId = parentId;
  }

  state.nodes = state.nodes.filter(n => n.id !== nodeId);
  renumberPositions(state.nodes, parentId, zone);

  closingTabIds.add(firefoxTabId);
  browser.tabs.remove(firefoxTabId).catch(() => {});
  broadcastState();
}

function handlePromoteNode(nodeId: string): void {
  const root = state.nodes.find(n => n.id === nodeId);
  if (!root) return;

  const oldParentId = root.parentId;
  const oldZone = root.zone;
  const subtree = getSubtree(state.nodes, nodeId);
  const newRootPosition = getNextPosition(state.nodes, null, 'permanent');

  for (const node of subtree) {
    if (node.type === 'tab') {
      node.zone = 'permanent';
      node.anchorUrl = node.url;
      node.lastActiveAt = null;
    } else {
      // FolderNode.zone is already typed as 'permanent' — no assignment needed
    }
  }

  root.parentId = null;
  root.position = newRootPosition;
  renumberPositions(state.nodes, oldParentId, oldZone);
  broadcastState();
}

function handleDemoteNode(nodeId: string): void {
  const root = state.nodes.find(n => n.id === nodeId);
  if (!root) return;

  const oldParentId = root.parentId;
  const subtree = getSubtree(state.nodes, nodeId);
  const now = Date.now();

  const reparentTo = root.type === 'tab' ? root.id : null;
  dissolveFolders(subtree, reparentTo);

  // Shift existing ephemeral root nodes down to make room at position 0
  for (const n of state.nodes) {
    if (n.parentId === null && n.zone === 'ephemeral') n.position++;
  }

  // Mark all surviving subtree nodes as ephemeral
  const subtreeIds = new Set(subtree.map(n => n.id));
  for (const n of state.nodes) {
    if (!subtreeIds.has(n.id)) continue;
    if (n.type === 'tab') {
      n.zone = 'ephemeral';
      n.anchorUrl = null;
      n.lastActiveAt = now;
    }
  }

  if (root.type === 'tab') {
    root.parentId = null;
    root.position = 0;
    renumberPositions(state.nodes, root.id, 'ephemeral');
  } else {
    // Root was a folder (dissolved) — its tab children are already at parentId=null
    renumberPositions(state.nodes, null, 'ephemeral');
  }

  renumberPositions(state.nodes, oldParentId, 'permanent');
  broadcastState();
}

function handleMoveNode(msg: Extract<Message, { type: 'MOVE_NODE' }>): void {
  const node = state.nodes.find(n => n.id === msg.nodeId);
  if (!node) return;

  const oldParentId = node.parentId;
  const oldZone = node.zone;
  const zoneChanged = oldZone !== msg.newZone;

  // Pull node out of old position, place at end of new parent temporarily
  node.parentId = msg.newParentId;
  node.position = Number.MAX_SAFE_INTEGER;
  renumberPositions(state.nodes, oldParentId, oldZone);

  // Make room at the target position
  for (const n of state.nodes) {
    if (
      n.id !== msg.nodeId &&
      n.parentId === msg.newParentId &&
      n.zone === msg.newZone &&
      n.position >= msg.newPosition
    ) {
      n.position++;
    }
  }
  node.position = msg.newPosition;

  if (zoneChanged) {
    if (msg.newZone === 'ephemeral') {
      const subtree = getSubtree(state.nodes, msg.nodeId);

      if (node.type === 'folder') {
        // Dissolving the root folder: all tab descendants become ephemeral root nodes
        const tabNodes = subtree.filter((n): n is TabNode => n.type === 'tab');
        const folderIds = new Set(
          subtree.filter(n => n.type === 'folder').map(n => n.id),
        );
        state.nodes = state.nodes.filter(n => !folderIds.has(n.id));
        const now = Date.now();
        for (const tab of tabNodes) {
          tab.zone = 'ephemeral';
          tab.parentId = null;
          tab.anchorUrl = null;
          tab.lastActiveAt = now;
        }
        renumberPositions(state.nodes, null, 'ephemeral');
      } else {
        dissolveFolders(subtree, node.id);
        const now = Date.now();
        // node.zone is 'permanent' | 'ephemeral' on TabNode — safe to reassign
        (node as TabNode).zone = 'ephemeral';
        for (const n of getSubtree(state.nodes, msg.nodeId)) {
          if (n.type === 'tab') {
            n.zone = 'ephemeral';
            n.anchorUrl = null;
            n.lastActiveAt = now;
          }
        }
      }
    } else {
      // ephemeral → permanent
      const subtree = getSubtree(state.nodes, msg.nodeId);
      for (const n of subtree) {
        if (n.type === 'tab') {
          n.zone = 'permanent';
          n.anchorUrl = n.url;
          n.lastActiveAt = null;
        }
      }
    }
  }

  broadcastState();
}

function handleCreateFolder(msg: Extract<Message, { type: 'CREATE_FOLDER' }>): void {
  for (const n of state.nodes) {
    if (n.parentId === msg.parentId && n.zone === 'permanent' && n.position >= msg.position) {
      n.position++;
    }
  }

  const folder: FolderNode = {
    id: generateId(),
    type: 'folder',
    parentId: msg.parentId,
    zone: 'permanent',
    position: msg.position,
    collapsed: false,
    name: msg.name,
    color: null,
    icon: null,
  };

  state.nodes.push(folder);
  broadcastState();
}

function handleRenameFolder(msg: Extract<Message, { type: 'RENAME_FOLDER' }>): void {
  const folder = state.nodes.find(
    (n): n is FolderNode => n.id === msg.nodeId && n.type === 'folder',
  );
  if (!folder) return;
  folder.name = msg.name;
  broadcastState();
}

function handleDeleteFolder(nodeId: string): void {
  const folder = state.nodes.find(
    (n): n is FolderNode => n.id === nodeId && n.type === 'folder',
  );
  if (!folder) return;

  const { parentId, zone } = folder;

  for (const child of state.nodes) {
    if (child.parentId === nodeId) child.parentId = parentId;
  }

  state.nodes = state.nodes.filter(n => n.id !== nodeId);
  renumberPositions(state.nodes, parentId, zone);
  broadcastState();
}

function handleFlattenNodes(nodeIds: string[]): void {
  const affectedParents = new Map<string, 'permanent' | 'ephemeral'>();

  for (const nodeId of nodeIds) {
    const node = state.nodes.find(n => n.id === nodeId);
    if (!node || node.parentId === null) continue;
    affectedParents.set(node.parentId, node.zone as 'permanent' | 'ephemeral');
    node.parentId = null;
  }

  for (const [parentId, zone] of affectedParents) {
    renumberPositions(state.nodes, parentId, zone);
  }

  renumberPositions(state.nodes, null, 'permanent');
  renumberPositions(state.nodes, null, 'ephemeral');
  broadcastState();
}

function handleRenameTab(nodeId: string, customTitle: string | null): void {
  const node = state.nodes.find(
    (n): n is TabNode => n.id === nodeId && n.type === 'tab',
  );
  if (!node) return;
  node.customTitle = customTitle;
  broadcastState();
}

function handleReAnchor(nodeId: string): void {
  const node = state.nodes.find(
    (n): n is TabNode => n.id === nodeId && n.type === 'tab',
  );
  if (!node) return;
  node.anchorUrl = node.url;
  broadcastState();
}

function handleReopenClosed(entryId: string): void {
  const idx = state.recentlyClosed.findIndex(e => e.id === entryId);
  if (idx === -1) return;

  const entry = state.recentlyClosed[idx];
  state.recentlyClosed.splice(idx, 1);
  browser.tabs.create({ url: entry.url }).catch(() => {});
  broadcastState();
}

function handleUpdateSettings(settings: Partial<import('../shared/types').TabbySettings>): void {
  Object.assign(state.settings, settings);
  broadcastState();
}

// ── Message router ──────────────────────────────────────────────────────

function handleMessage(msg: Message): void {
  switch (msg.type) {
    case 'GET_STATE':
      broadcastState();
      break;
    case 'ACTIVATE_TAB':
      browser.tabs.update(msg.firefoxTabId, { active: true }).catch(() => {});
      break;
    case 'CLOSE_TAB':
      handleCloseTab(msg.nodeId);
      break;
    case 'PROMOTE_NODE':
      handlePromoteNode(msg.nodeId);
      break;
    case 'DEMOTE_NODE':
      handleDemoteNode(msg.nodeId);
      break;
    case 'MOVE_NODE':
      handleMoveNode(msg);
      break;
    case 'CREATE_FOLDER':
      handleCreateFolder(msg);
      break;
    case 'RENAME_FOLDER':
      handleRenameFolder(msg);
      break;
    case 'RENAME_TAB':
      handleRenameTab(msg.nodeId, msg.customTitle);
      break;
    case 'DELETE_FOLDER':
      handleDeleteFolder(msg.nodeId);
      break;
    case 'FLATTEN_NODES':
      handleFlattenNodes(msg.nodeIds);
      break;
    case 'RE_ANCHOR':
      handleReAnchor(msg.nodeId);
      break;
    case 'REOPEN_CLOSED':
      handleReopenClosed(msg.entryId);
      break;
    case 'UPDATE_SETTINGS':
      handleUpdateSettings(msg.settings);
      break;
  }
}

// ── Port communication ──────────────────────────────────────────────────

async function setTitlePreface(text: string): Promise<void> {
  try {
    const win = await browser.windows.getCurrent();
    await browser.windows.update(win.id!, { titlePreface: text });
  } catch (_) {}
}

function handleConnect(port: browser.Runtime.Port): void {
  if (port.name !== 'sidebar') return;

  sidebarPorts.add(port);
  setTitlePreface('.');

  port.onDisconnect.addListener(() => {
    sidebarPorts.delete(port);
    if (sidebarPorts.size === 0) setTitlePreface('');
  });

  port.postMessage({ type: 'STATE_UPDATED', state } as Message);
  port.onMessage.addListener((msg: unknown) => handleMessage(msg as Message));
}

// ── Expiry ──────────────────────────────────────────────────────────────

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function checkExpiry(): void {
  const now = Date.now();
  const roots = getRootNodes(state.nodes, 'ephemeral');
  let changed = false;

  for (const root of roots) {
    const maxActive = getMaxLastActiveAt(state.nodes, root.id);
    if (maxActive > 0 && now - maxActive > state.settings.expiryMs) {
      const subtree = getSubtree(state.nodes, root.id);
      const subtreeIds = new Set(subtree.map(n => n.id));

      for (const node of subtree) {
        if (node.type === 'tab') {
          state.recentlyClosed.push({
            id: generateId(),
            title: node.title,
            url: node.url,
            favIconUrl: node.favIconUrl,
            closedAt: now,
          });
          closingTabIds.add(node.firefoxTabId);
          browser.tabs.remove(node.firefoxTabId).catch(() => {});
        }
      }

      state.nodes = state.nodes.filter(n => !subtreeIds.has(n.id));
      changed = true;
    }
  }

  const prevLen = state.recentlyClosed.length;
  state.recentlyClosed = state.recentlyClosed.filter(
    e => now - e.closedAt <= SEVEN_DAYS_MS,
  );
  if (state.recentlyClosed.length !== prevLen) changed = true;

  if (changed) broadcastState();
}

// ── Reconciliation ──────────────────────────────────────────────────────

function reconcile(realTabs: browser.Tabs.Tab[]): void {
  state.nodes = reconcileNodes(
    state.nodes,
    realTabs.map(t => ({
      id: t.id!,
      url: t.url || '',
      title: t.title || '',
      favIconUrl: t.favIconUrl || '',
      status: t.status || 'complete',
      index: t.index ?? 0,
    })),
  );
}

// ── Initialization ──────────────────────────────────────────────────────

async function init(): Promise<void> {
  state = await loadState();

  const realTabs = await browser.tabs.query({ currentWindow: true });
  reconcile(realTabs);

  checkExpiry();
  setInterval(checkExpiry, 60_000);

  browser.tabs.onCreated.addListener(handleTabCreated);
  browser.tabs.onRemoved.addListener(handleTabRemoved);
  browser.tabs.onUpdated.addListener(handleTabUpdated);
  browser.tabs.onActivated.addListener(handleTabActivated);
  browser.runtime.onConnect.addListener(handleConnect);
}

init();
