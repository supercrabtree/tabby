import browser from 'webextension-polyfill';
import type { TabbyState } from './types';
import { DEFAULT_EXPIRY_MS } from './types';

const STORAGE_KEY = 'tabby_state';

const DEFAULT_STATE: TabbyState = {
  nodes: [],
  recentlyClosed: [],
  settings: {
    expiryMs: DEFAULT_EXPIRY_MS,
  },
};

export async function loadState(): Promise<TabbyState> {
  const result = await browser.storage.local.get(STORAGE_KEY);
  if (result[STORAGE_KEY]) {
    return { ...DEFAULT_STATE, ...result[STORAGE_KEY] };
  }
  return structuredClone(DEFAULT_STATE);
}

export async function saveState(state: TabbyState): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: state });
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export function debouncedSave(state: TabbyState, delayMs = 500): void {
  if (saveTimeout !== null) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => saveState(state), delayMs);
}

// ── Session-backed persistence ──────────────────────────────────────────
// browser.sessions.setWindowValue survives temporary addon unload/reload
// because data lives in the browser's session store, not extension storage.

async function getWindowId(): Promise<number> {
  const win = await browser.windows.getCurrent();
  return win.id!;
}

export async function loadSessionState(): Promise<TabbyState | null> {
  try {
    const windowId = await getWindowId();
    const data = await (browser.sessions as any).getWindowValue(windowId, STORAGE_KEY);
    if (data && Array.isArray(data.nodes) && data.nodes.length > 0) {
      return { ...DEFAULT_STATE, ...data };
    }
  } catch (_) {}
  return null;
}

export async function saveSessionState(state: TabbyState): Promise<void> {
  try {
    const windowId = await getWindowId();
    await (browser.sessions as any).setWindowValue(windowId, STORAGE_KEY, state);
  } catch (_) {}
}

let sessionSaveTimeout: ReturnType<typeof setTimeout> | null = null;

export function debouncedSessionSave(state: TabbyState, delayMs = 500): void {
  if (sessionSaveTimeout !== null) clearTimeout(sessionSaveTimeout);
  sessionSaveTimeout = setTimeout(() => saveSessionState(state), delayMs);
}
