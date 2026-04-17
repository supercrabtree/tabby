import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TabNode, FolderNode, TreeNode, TabbyState } from '../src/shared/types';
import { DEFAULT_EXPIRY_MS } from '../src/shared/types';

globalThis.addEventListener ??= (() => {}) as any;

// ── Mock infrastructure ─────────────────────────────────────────────────

function createMockBrowser() {
  const listeners: Record<string, Function[]> = {};

  function makeTarget(name: string) {
    listeners[name] = [];
    return {
      addListener: vi.fn((fn: Function) => listeners[name].push(fn)),
      removeListener: vi.fn(),
      hasListener: vi.fn(),
    };
  }

  const browser = {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
      },
    },
    tabs: {
      query: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      remove: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue({ id: 999 }),
      onCreated: makeTarget('tabs.onCreated'),
      onRemoved: makeTarget('tabs.onRemoved'),
      onUpdated: makeTarget('tabs.onUpdated'),
      onActivated: makeTarget('tabs.onActivated'),
    },
    runtime: {
      onConnect: makeTarget('runtime.onConnect'),
    },
    windows: {
      getCurrent: vi.fn().mockResolvedValue({ id: 1 }),
      update: vi.fn().mockResolvedValue({}),
    },
  };

  return { browser, listeners };
}

type Mock = ReturnType<typeof createMockBrowser>;

interface SetupOpts {
  nodes?: TreeNode[];
  recentlyClosed?: TabbyState['recentlyClosed'];
  settings?: Partial<TabbyState['settings']>;
  realTabs?: Array<{
    id: number; url: string; title: string;
    favIconUrl: string; status: string; index: number;
  }>;
}

async function setup(opts: SetupOpts = {}): Promise<Mock> {
  vi.resetModules();

  const mock = createMockBrowser();
  const state: TabbyState = {
    nodes: opts.nodes ?? [],
    recentlyClosed: opts.recentlyClosed ?? [],
    settings: { expiryMs: DEFAULT_EXPIRY_MS, ...opts.settings },
  };
  mock.browser.storage.local.get.mockResolvedValue({ tabby_state: state });
  if (opts.realTabs) mock.browser.tabs.query.mockResolvedValue(opts.realTabs);

  vi.doMock('webextension-polyfill', () => ({ default: mock.browser }));
  await import('../src/background/index');
  for (let i = 0; i < 10; i++) await Promise.resolve();

  return mock;
}

function connectPort(mock: Mock) {
  const received: any[] = [];
  const port = {
    name: 'sidebar',
    onMessage: { addListener: vi.fn(), removeListener: vi.fn(), hasListener: vi.fn() },
    onDisconnect: { addListener: vi.fn(), removeListener: vi.fn(), hasListener: vi.fn() },
    postMessage: vi.fn((msg: any) => received.push(structuredClone(msg))),
  };

  mock.listeners['runtime.onConnect'][0](port);

  return {
    port,
    received,
    sendMessage(msg: any) {
      port.onMessage.addListener.mock.calls[0][0](msg);
    },
    latestState(): TabbyState {
      return received[received.length - 1].state;
    },
    clearReceived() {
      received.length = 0;
    },
  };
}

// ── Node factories ──────────────────────────────────────────────────────

function tab(overrides: Partial<TabNode> & { id: string; firefoxTabId: number }): TabNode {
  return {
    type: 'tab', parentId: null, zone: 'ephemeral', position: 0,
    collapsed: false, url: 'https://example.com', title: 'Example',
    customTitle: null, favIconUrl: '', anchorUrl: null, status: 'complete',
    lastActiveAt: Date.now(),
    ...overrides,
  };
}

function folder(overrides: Partial<FolderNode> & { id: string }): FolderNode {
  return {
    type: 'folder', parentId: null, zone: 'permanent', position: 0,
    collapsed: false, name: 'Folder', color: null, icon: null,
    ...overrides,
  };
}

function real(id: number, url: string, index = 0) {
  return { id, url, title: url, favIconUrl: '', status: 'complete', index };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('background', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── Initialization ──────────────────────────────────────────────────

  describe('initialization', () => {
    it('loads state, reconciles, and registers all listeners', async () => {
      const mock = await setup();
      expect(mock.browser.storage.local.get).toHaveBeenCalled();
      expect(mock.browser.tabs.query).toHaveBeenCalledWith({ currentWindow: true });
      for (const key of ['tabs.onCreated', 'tabs.onRemoved', 'tabs.onUpdated', 'tabs.onActivated', 'runtime.onConnect']) {
        expect(mock.listeners[key]).toHaveLength(1);
      }
    });
  });

  // ── Port connection ─────────────────────────────────────────────────

  describe('port connection', () => {
    it('sends current state on sidebar connect', async () => {
      const mock = await setup();
      const { received } = connectPort(mock);
      expect(received).toHaveLength(1);
      expect(received[0].type).toBe('STATE_UPDATED');
    });

    it('ignores non-sidebar ports', async () => {
      const mock = await setup();
      const port = {
        name: 'devtools',
        onMessage: { addListener: vi.fn() },
        onDisconnect: { addListener: vi.fn() },
        postMessage: vi.fn(),
      };
      mock.listeners['runtime.onConnect'][0](port);
      expect(port.postMessage).not.toHaveBeenCalled();
    });
  });

  // ── GET_STATE ───────────────────────────────────────────────────────

  describe('GET_STATE', () => {
    it('broadcasts current state', async () => {
      const mock = await setup();
      const { sendMessage, clearReceived, received } = connectPort(mock);
      clearReceived();
      sendMessage({ type: 'GET_STATE' });
      expect(received).toHaveLength(1);
      expect(received[0].type).toBe('STATE_UPDATED');
    });
  });

  // ── ACTIVATE_TAB ────────────────────────────────────────────────────

  describe('ACTIVATE_TAB', () => {
    it('calls browser.tabs.update with active: true', async () => {
      const mock = await setup();
      const { sendMessage } = connectPort(mock);
      sendMessage({ type: 'ACTIVATE_TAB', firefoxTabId: 42 });
      expect(mock.browser.tabs.update).toHaveBeenCalledWith(42, { active: true });
    });

    it('updates lastActiveAt for ephemeral tabs and broadcasts', async () => {
      vi.setSystemTime(5000);
      const t = tab({ id: 't1', firefoxTabId: 10, lastActiveAt: 1000 });
      const mock = await setup({ nodes: [t], realTabs: [real(10, 'https://example.com')] });
      const { sendMessage, clearReceived, latestState } = connectPort(mock);
      clearReceived();

      vi.setSystemTime(20_000);
      sendMessage({ type: 'ACTIVATE_TAB', firefoxTabId: 10 });

      expect(latestState().nodes.find(n => n.id === 't1')).toBeDefined();
      expect((latestState().nodes.find(n => n.id === 't1') as TabNode).lastActiveAt).toBe(20_000);
    });

    it('does not update lastActiveAt for permanent tabs', async () => {
      const t = tab({
        id: 't1', firefoxTabId: 10, zone: 'permanent',
        anchorUrl: 'https://example.com', lastActiveAt: null,
      });
      const mock = await setup({ nodes: [t], realTabs: [real(10, 'https://example.com')] });
      const { sendMessage, clearReceived, received } = connectPort(mock);
      clearReceived();

      sendMessage({ type: 'ACTIVATE_TAB', firefoxTabId: 10 });

      expect(received).toHaveLength(0);
      expect(mock.browser.tabs.update).toHaveBeenCalledWith(10, { active: true });
    });

    it('resets expiry progress to near-full after activation', async () => {
      const expiryMs = 60_000;
      vi.setSystemTime(100_000);
      const t = tab({
        id: 't1', firefoxTabId: 10,
        lastActiveAt: 100_000 - expiryMs / 2,
      });
      const mock = await setup({
        nodes: [t],
        realTabs: [real(10, 'https://example.com')],
        settings: { expiryMs },
      });
      const { sendMessage, latestState } = connectPort(mock);

      vi.setSystemTime(100_000);
      sendMessage({ type: 'ACTIVATE_TAB', firefoxTabId: 10 });

      const node = latestState().nodes.find(n => n.id === 't1') as TabNode;
      expect(node.lastActiveAt).toBe(100_000);
      const elapsed = 100_000 - node.lastActiveAt;
      const progress = Math.max(0, Math.min(1, 1 - elapsed / expiryMs));
      expect(progress).toBeCloseTo(1, 1);
    });
  });

  // ── Tab created ─────────────────────────────────────────────────────

  describe('tab created', () => {
    it('adds a new ephemeral root node', async () => {
      const mock = await setup();
      const { clearReceived, latestState } = connectPort(mock);
      clearReceived();

      mock.listeners['tabs.onCreated'][0]({
        id: 42, url: 'https://new.com', title: 'New', favIconUrl: 'fav.ico', status: 'complete',
      });

      const node = latestState().nodes.find(
        n => n.type === 'tab' && (n as TabNode).firefoxTabId === 42,
      ) as TabNode;
      expect(node).toBeDefined();
      expect(node.zone).toBe('ephemeral');
      expect(node.url).toBe('https://new.com');
      expect(node.parentId).toBeNull();
    });

    it('nests under opener and inherits its zone', async () => {
      const opener = tab({
        id: 'opener', firefoxTabId: 10, zone: 'permanent',
        url: 'https://opener.com', anchorUrl: 'https://opener.com', lastActiveAt: null,
      });
      const mock = await setup({
        nodes: [opener],
        realTabs: [real(10, 'https://opener.com')],
      });
      const { clearReceived, latestState } = connectPort(mock);
      clearReceived();

      mock.listeners['tabs.onCreated'][0]({
        id: 42, url: 'https://child.com', title: 'Child',
        favIconUrl: '', status: 'complete', openerTabId: 10,
      });

      const child = latestState().nodes.find(
        n => n.type === 'tab' && (n as TabNode).firefoxTabId === 42,
      ) as TabNode;
      expect(child.parentId).toBe('opener');
      expect(child.zone).toBe('permanent');
      expect(child.lastActiveAt).toBeNull();
    });
  });

  // ── Tab removed ─────────────────────────────────────────────────────

  describe('tab removed', () => {
    it('removes the node and records to recently closed', async () => {
      const t = tab({ id: 't1', firefoxTabId: 10, url: 'https://gone.com', title: 'Gone' });
      const mock = await setup({ nodes: [t], realTabs: [real(10, 'https://gone.com')] });
      const { clearReceived, latestState } = connectPort(mock);
      clearReceived();

      mock.listeners['tabs.onRemoved'][0](10);

      const s = latestState();
      expect(s.nodes.find(n => n.id === 't1')).toBeUndefined();
      expect(s.recentlyClosed).toHaveLength(1);
      expect(s.recentlyClosed[0].url).toBe('https://gone.com');
    });

    it('reparents children to the removed node parent', async () => {
      const parent = tab({ id: 'p', firefoxTabId: 10, url: 'https://p.com' });
      const child = tab({ id: 'c', firefoxTabId: 11, parentId: 'p', url: 'https://c.com' });
      const mock = await setup({
        nodes: [parent, child],
        realTabs: [real(10, 'https://p.com', 0), real(11, 'https://c.com', 1)],
      });
      const { clearReceived, latestState } = connectPort(mock);
      clearReceived();

      mock.listeners['tabs.onRemoved'][0](10);
      expect(latestState().nodes.find(n => n.id === 'c')!.parentId).toBeNull();
    });

    it('skips processing when tab was closed via CLOSE_TAB', async () => {
      const t = tab({ id: 't1', firefoxTabId: 10, url: 'https://a.com' });
      const mock = await setup({ nodes: [t], realTabs: [real(10, 'https://a.com')] });
      const { sendMessage, clearReceived, received } = connectPort(mock);

      sendMessage({ type: 'CLOSE_TAB', nodeId: 't1' });
      clearReceived();

      mock.listeners['tabs.onRemoved'][0](10);
      expect(received).toHaveLength(0);
    });
  });

  // ── Tab updated ─────────────────────────────────────────────────────

  describe('tab updated', () => {
    it('updates url, title, and favIconUrl', async () => {
      const t = tab({ id: 't1', firefoxTabId: 10, url: 'https://old.com', title: 'Old' });
      const mock = await setup({ nodes: [t], realTabs: [real(10, 'https://old.com')] });
      const { clearReceived, latestState } = connectPort(mock);
      clearReceived();

      mock.listeners['tabs.onUpdated'][0](10, {
        url: 'https://new.com', title: 'New', favIconUrl: 'new.ico',
      });

      const node = latestState().nodes.find(n => n.id === 't1') as TabNode;
      expect(node.url).toBe('https://new.com');
      expect(node.title).toBe('New');
      expect(node.favIconUrl).toBe('new.ico');
    });

    it('sets anchorUrl on first load-complete for permanent tab without one', async () => {
      const t = tab({
        id: 't1', firefoxTabId: 10, zone: 'permanent',
        url: 'https://example.com', anchorUrl: null, status: 'loading', lastActiveAt: null,
      });
      const mock = await setup({
        nodes: [t],
        realTabs: [{ id: 10, url: 'https://example.com', title: 'Ex', favIconUrl: '', status: 'loading', index: 0 }],
      });
      const { clearReceived, latestState } = connectPort(mock);
      clearReceived();

      mock.listeners['tabs.onUpdated'][0](10, { status: 'complete' });
      expect((latestState().nodes.find(n => n.id === 't1') as TabNode).anchorUrl).toBe('https://example.com');
    });
  });

  // ── Tab activated ───────────────────────────────────────────────────

  describe('tab activated', () => {
    it('updates lastActiveAt for ephemeral tabs', async () => {
      vi.setSystemTime(5000);
      const t = tab({ id: 't1', firefoxTabId: 10, lastActiveAt: 1000 });
      const mock = await setup({ nodes: [t], realTabs: [real(10, 'https://example.com')] });
      const { clearReceived, latestState } = connectPort(mock);
      clearReceived();

      vi.setSystemTime(10_000);
      mock.listeners['tabs.onActivated'][0]({ tabId: 10 });
      expect((latestState().nodes.find(n => n.id === 't1') as TabNode).lastActiveAt).toBe(10_000);
    });

    it('does not update lastActiveAt for permanent tabs', async () => {
      const t = tab({
        id: 't1', firefoxTabId: 10, zone: 'permanent',
        anchorUrl: 'https://example.com', lastActiveAt: null,
      });
      const mock = await setup({ nodes: [t], realTabs: [real(10, 'https://example.com')] });
      const { clearReceived, latestState } = connectPort(mock);
      clearReceived();

      mock.listeners['tabs.onActivated'][0]({ tabId: 10 });
      expect((latestState().nodes.find(n => n.id === 't1') as TabNode).lastActiveAt).toBeNull();
    });
  });

  // ── CLOSE_TAB ───────────────────────────────────────────────────────

  describe('CLOSE_TAB', () => {
    it('removes tab, records to recently closed, and calls browser.tabs.remove', async () => {
      const t = tab({ id: 't1', firefoxTabId: 10, url: 'https://a.com', title: 'A' });
      const mock = await setup({ nodes: [t], realTabs: [real(10, 'https://a.com')] });
      const { sendMessage, latestState } = connectPort(mock);

      sendMessage({ type: 'CLOSE_TAB', nodeId: 't1' });

      const s = latestState();
      expect(s.nodes.find(n => n.id === 't1')).toBeUndefined();
      expect(s.recentlyClosed).toHaveLength(1);
      expect(mock.browser.tabs.remove).toHaveBeenCalledWith(10);
    });
  });

  // ── PROMOTE_NODE ────────────────────────────────────────────────────

  describe('PROMOTE_NODE', () => {
    it('moves the entire subtree to permanent with anchors set', async () => {
      const root = tab({ id: 't1', firefoxTabId: 10, url: 'https://a.com' });
      const child = tab({ id: 't2', firefoxTabId: 11, parentId: 't1', url: 'https://b.com' });
      const mock = await setup({
        nodes: [root, child],
        realTabs: [real(10, 'https://a.com', 0), real(11, 'https://b.com', 1)],
      });
      const { sendMessage, latestState } = connectPort(mock);

      sendMessage({ type: 'PROMOTE_NODE', nodeId: 't1' });

      const s = latestState();
      const t1 = s.nodes.find(n => n.id === 't1') as TabNode;
      const t2 = s.nodes.find(n => n.id === 't2') as TabNode;
      expect(t1.zone).toBe('permanent');
      expect(t1.anchorUrl).toBe('https://a.com');
      expect(t1.lastActiveAt).toBeNull();
      expect(t2.zone).toBe('permanent');
      expect(t2.anchorUrl).toBe('https://b.com');
    });
  });

  // ── DEMOTE_NODE ─────────────────────────────────────────────────────

  describe('DEMOTE_NODE', () => {
    it('moves a tab to ephemeral zone', async () => {
      vi.setSystemTime(5000);
      const t = tab({
        id: 't1', firefoxTabId: 10, zone: 'permanent',
        url: 'https://a.com', anchorUrl: 'https://a.com', lastActiveAt: null,
      });
      const mock = await setup({ nodes: [t], realTabs: [real(10, 'https://a.com')] });
      const { sendMessage, latestState } = connectPort(mock);

      sendMessage({ type: 'DEMOTE_NODE', nodeId: 't1' });

      const node = latestState().nodes.find(n => n.id === 't1') as TabNode;
      expect(node.zone).toBe('ephemeral');
      expect(node.anchorUrl).toBeNull();
      expect(node.lastActiveAt).toBe(5000);
    });

    it('dissolves folders and makes their tabs ephemeral roots', async () => {
      vi.setSystemTime(5000);
      const f = folder({ id: 'f1' });
      const t = tab({
        id: 't1', firefoxTabId: 10, parentId: 'f1', zone: 'permanent',
        url: 'https://a.com', anchorUrl: 'https://a.com', lastActiveAt: null,
      });
      const mock = await setup({ nodes: [f, t], realTabs: [real(10, 'https://a.com')] });
      const { sendMessage, latestState } = connectPort(mock);

      sendMessage({ type: 'DEMOTE_NODE', nodeId: 'f1' });

      const s = latestState();
      expect(s.nodes.find(n => n.id === 'f1')).toBeUndefined();
      const node = s.nodes.find(n => n.id === 't1') as TabNode;
      expect(node.zone).toBe('ephemeral');
      expect(node.parentId).toBeNull();
    });
  });

  // ── MOVE_NODE ───────────────────────────────────────────────────────

  describe('MOVE_NODE', () => {
    it('moves a node to a new parent and position', async () => {
      const f = folder({ id: 'f1' });
      const t = tab({
        id: 't1', firefoxTabId: 10, zone: 'permanent', position: 1,
        url: 'https://a.com', anchorUrl: 'https://a.com', lastActiveAt: null,
      });
      const mock = await setup({ nodes: [f, t], realTabs: [real(10, 'https://a.com')] });
      const { sendMessage, latestState } = connectPort(mock);

      sendMessage({
        type: 'MOVE_NODE', nodeId: 't1',
        newParentId: 'f1', newPosition: 0, newZone: 'permanent',
      });

      const node = latestState().nodes.find(n => n.id === 't1') as TabNode;
      expect(node.parentId).toBe('f1');
      expect(node.position).toBe(0);
    });

    it('converts permanent → ephemeral on zone change', async () => {
      vi.setSystemTime(5000);
      const t = tab({
        id: 't1', firefoxTabId: 10, zone: 'permanent',
        url: 'https://a.com', anchorUrl: 'https://a.com', lastActiveAt: null,
      });
      const mock = await setup({ nodes: [t], realTabs: [real(10, 'https://a.com')] });
      const { sendMessage, latestState } = connectPort(mock);

      sendMessage({
        type: 'MOVE_NODE', nodeId: 't1',
        newParentId: null, newPosition: 0, newZone: 'ephemeral',
      });

      const node = latestState().nodes.find(n => n.id === 't1') as TabNode;
      expect(node.zone).toBe('ephemeral');
      expect(node.anchorUrl).toBeNull();
      expect(node.lastActiveAt).toBe(5000);
    });

    it('converts ephemeral → permanent on zone change', async () => {
      const t = tab({ id: 't1', firefoxTabId: 10, url: 'https://a.com' });
      const mock = await setup({ nodes: [t], realTabs: [real(10, 'https://a.com')] });
      const { sendMessage, latestState } = connectPort(mock);

      sendMessage({
        type: 'MOVE_NODE', nodeId: 't1',
        newParentId: null, newPosition: 0, newZone: 'permanent',
      });

      const node = latestState().nodes.find(n => n.id === 't1') as TabNode;
      expect(node.zone).toBe('permanent');
      expect(node.anchorUrl).toBe('https://a.com');
      expect(node.lastActiveAt).toBeNull();
    });

    it('dissolves folders when moving a folder to ephemeral', async () => {
      vi.setSystemTime(5000);
      const f = folder({ id: 'f1' });
      const t = tab({
        id: 't1', firefoxTabId: 10, parentId: 'f1', zone: 'permanent',
        url: 'https://a.com', anchorUrl: 'https://a.com', lastActiveAt: null,
      });
      const mock = await setup({ nodes: [f, t], realTabs: [real(10, 'https://a.com')] });
      const { sendMessage, latestState } = connectPort(mock);

      sendMessage({
        type: 'MOVE_NODE', nodeId: 'f1',
        newParentId: null, newPosition: 0, newZone: 'ephemeral',
      });

      const s = latestState();
      expect(s.nodes.find(n => n.id === 'f1')).toBeUndefined();
      const node = s.nodes.find(n => n.id === 't1') as TabNode;
      expect(node.zone).toBe('ephemeral');
      expect(node.parentId).toBeNull();
    });
  });

  // ── CREATE_FOLDER ───────────────────────────────────────────────────

  describe('CREATE_FOLDER', () => {
    it('creates a folder and shifts existing siblings', async () => {
      const existing = folder({ id: 'f0', position: 0 });
      const mock = await setup({ nodes: [existing] });
      const { sendMessage, latestState } = connectPort(mock);

      sendMessage({ type: 'CREATE_FOLDER', name: 'Work', parentId: null, position: 0 });

      const s = latestState();
      const newFolder = s.nodes.find(n => n.type === 'folder' && n.id !== 'f0') as FolderNode;
      expect(newFolder).toBeDefined();
      expect(newFolder.name).toBe('Work');
      expect(newFolder.position).toBe(0);
      expect((s.nodes.find(n => n.id === 'f0') as FolderNode).position).toBe(1);
    });
  });

  // ── RENAME_FOLDER ───────────────────────────────────────────────────

  describe('RENAME_FOLDER', () => {
    it('updates the folder name', async () => {
      const f = folder({ id: 'f1', name: 'Old' });
      const mock = await setup({ nodes: [f] });
      const { sendMessage, latestState } = connectPort(mock);

      sendMessage({ type: 'RENAME_FOLDER', nodeId: 'f1', name: 'New' });
      expect((latestState().nodes.find(n => n.id === 'f1') as FolderNode).name).toBe('New');
    });
  });

  // ── DELETE_FOLDER ───────────────────────────────────────────────────

  describe('DELETE_FOLDER', () => {
    it('removes the folder and reparents children', async () => {
      const f = folder({ id: 'f1' });
      const t = tab({
        id: 't1', firefoxTabId: 10, parentId: 'f1', zone: 'permanent',
        url: 'https://a.com', anchorUrl: 'https://a.com', lastActiveAt: null,
      });
      const mock = await setup({ nodes: [f, t], realTabs: [real(10, 'https://a.com')] });
      const { sendMessage, latestState } = connectPort(mock);

      sendMessage({ type: 'DELETE_FOLDER', nodeId: 'f1' });

      const s = latestState();
      expect(s.nodes.find(n => n.id === 'f1')).toBeUndefined();
      expect(s.nodes.find(n => n.id === 't1')!.parentId).toBeNull();
    });
  });

  // ── FLATTEN_NODES ───────────────────────────────────────────────────

  describe('FLATTEN_NODES', () => {
    it('moves specified child nodes to root level', async () => {
      const f = folder({ id: 'f1' });
      const t1 = tab({
        id: 't1', firefoxTabId: 10, parentId: 'f1', zone: 'permanent',
        url: 'https://a.com', anchorUrl: 'https://a.com', lastActiveAt: null,
      });
      const t2 = tab({
        id: 't2', firefoxTabId: 11, parentId: 'f1', zone: 'permanent', position: 1,
        url: 'https://b.com', anchorUrl: 'https://b.com', lastActiveAt: null,
      });
      const mock = await setup({
        nodes: [f, t1, t2],
        realTabs: [real(10, 'https://a.com', 0), real(11, 'https://b.com', 1)],
      });
      const { sendMessage, latestState } = connectPort(mock);

      sendMessage({ type: 'FLATTEN_NODES', nodeIds: ['t1', 't2'] });

      const s = latestState();
      expect(s.nodes.find(n => n.id === 't1')!.parentId).toBeNull();
      expect(s.nodes.find(n => n.id === 't2')!.parentId).toBeNull();
    });
  });

  // ── RENAME_TAB ──────────────────────────────────────────────────────

  describe('RENAME_TAB', () => {
    it('sets a custom title', async () => {
      const t = tab({ id: 't1', firefoxTabId: 10, url: 'https://a.com' });
      const mock = await setup({ nodes: [t], realTabs: [real(10, 'https://a.com')] });
      const { sendMessage, latestState } = connectPort(mock);

      sendMessage({ type: 'RENAME_TAB', nodeId: 't1', customTitle: 'My Tab' });
      expect((latestState().nodes.find(n => n.id === 't1') as TabNode).customTitle).toBe('My Tab');
    });

    it('clears the custom title when set to null', async () => {
      const t = tab({ id: 't1', firefoxTabId: 10, url: 'https://a.com', customTitle: 'Old' });
      const mock = await setup({ nodes: [t], realTabs: [real(10, 'https://a.com')] });
      const { sendMessage, latestState } = connectPort(mock);

      sendMessage({ type: 'RENAME_TAB', nodeId: 't1', customTitle: null });
      expect((latestState().nodes.find(n => n.id === 't1') as TabNode).customTitle).toBeNull();
    });
  });

  // ── RE_ANCHOR ───────────────────────────────────────────────────────

  describe('RE_ANCHOR', () => {
    it('updates anchorUrl to the current url', async () => {
      const t = tab({
        id: 't1', firefoxTabId: 10, zone: 'permanent',
        url: 'https://new.com', anchorUrl: 'https://old.com', lastActiveAt: null,
      });
      const mock = await setup({ nodes: [t], realTabs: [real(10, 'https://new.com')] });
      const { sendMessage, latestState } = connectPort(mock);

      sendMessage({ type: 'RE_ANCHOR', nodeId: 't1' });
      expect((latestState().nodes.find(n => n.id === 't1') as TabNode).anchorUrl).toBe('https://new.com');
    });
  });

  // ── REOPEN_CLOSED ──────────────────────────────────────────────────

  describe('REOPEN_CLOSED', () => {
    it('removes the entry and creates a new browser tab', async () => {
      const mock = await setup({
        recentlyClosed: [
          { id: 'rc1', title: 'Closed', url: 'https://closed.com', favIconUrl: '', closedAt: Date.now() },
        ],
      });
      const { sendMessage, latestState } = connectPort(mock);

      sendMessage({ type: 'REOPEN_CLOSED', entryId: 'rc1' });

      expect(latestState().recentlyClosed).toHaveLength(0);
      expect(mock.browser.tabs.create).toHaveBeenCalledWith({ url: 'https://closed.com' });
    });
  });

  // ── UPDATE_SETTINGS ─────────────────────────────────────────────────

  describe('UPDATE_SETTINGS', () => {
    it('merges new settings values', async () => {
      const mock = await setup();
      const { sendMessage, latestState } = connectPort(mock);

      sendMessage({ type: 'UPDATE_SETTINGS', settings: { expiryMs: 5000 } });
      expect(latestState().settings.expiryMs).toBe(5000);
    });
  });

  // ── Expiry ──────────────────────────────────────────────────────────

  describe('expiry', () => {
    it('removes expired ephemeral subtrees during init', async () => {
      const now = DEFAULT_EXPIRY_MS * 2;
      vi.setSystemTime(now);

      const expired = tab({
        id: 'expired', firefoxTabId: 10,
        url: 'https://expired.com', lastActiveAt: now - DEFAULT_EXPIRY_MS - 1000,
      });
      const fresh = tab({
        id: 'fresh', firefoxTabId: 11, position: 1,
        url: 'https://fresh.com', lastActiveAt: now - 1000,
      });
      const mock = await setup({
        nodes: [expired, fresh],
        realTabs: [real(10, 'https://expired.com', 0), real(11, 'https://fresh.com', 1)],
      });

      const s = connectPort(mock).latestState();
      expect(s.nodes.find(n => n.id === 'expired')).toBeUndefined();
      expect(s.nodes.find(n => n.id === 'fresh')).toBeDefined();
      expect(s.recentlyClosed.find(e => e.url === 'https://expired.com')).toBeDefined();
      expect(mock.browser.tabs.remove).toHaveBeenCalledWith(10);
    });

    it('cleans up recently closed entries older than 7 days', async () => {
      const now = 1_000_000_000;
      vi.setSystemTime(now);
      const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

      const mock = await setup({
        recentlyClosed: [
          { id: 'old', title: 'Old', url: 'https://old.com', favIconUrl: '', closedAt: now - SEVEN_DAYS - 1000 },
          { id: 'recent', title: 'Recent', url: 'https://recent.com', favIconUrl: '', closedAt: now - 1000 },
        ],
      });

      const s = connectPort(mock).latestState();
      expect(s.recentlyClosed.find(e => e.id === 'old')).toBeUndefined();
      expect(s.recentlyClosed.find(e => e.id === 'recent')).toBeDefined();
    });

    it('runs periodically via setInterval', async () => {
      const now = 1_000_000;
      vi.setSystemTime(now);

      const t = tab({
        id: 't1', firefoxTabId: 10,
        url: 'https://will-expire.com', lastActiveAt: now - 1000,
      });
      const mock = await setup({
        nodes: [t],
        realTabs: [real(10, 'https://will-expire.com')],
        settings: { expiryMs: 30_000 },
      });
      const { latestState, clearReceived, received } = connectPort(mock);
      expect(latestState().nodes.find(n => n.id === 't1')).toBeDefined();
      clearReceived();

      vi.setSystemTime(now + 60_000);
      await vi.advanceTimersByTimeAsync(60_000);

      expect(received.length).toBeGreaterThan(0);
      expect(latestState().nodes.find(n => n.id === 't1')).toBeUndefined();
    });
  });
});
