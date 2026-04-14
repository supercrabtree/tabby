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
