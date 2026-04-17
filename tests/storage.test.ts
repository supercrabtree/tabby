import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEFAULT_EXPIRY_MS } from '../src/shared/types';

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(),
        set: vi.fn(),
      },
    },
  },
}));

import browser from 'webextension-polyfill';
import { loadState, saveState, debouncedSave } from '../src/shared/storage';

const DEFAULT_STATE = {
  nodes: [],
  recentlyClosed: [],
  settings: { expiryMs: DEFAULT_EXPIRY_MS },
};

// ── loadState ───────────────────────────────────────────────────────────

describe('loadState', () => {
  beforeEach(() => {
    vi.mocked(browser.storage.local.get).mockReset();
  });

  it('returns stored state when available', async () => {
    const stored = {
      nodes: [{ id: 't1', type: 'tab' }],
      recentlyClosed: [],
      settings: { expiryMs: 5000 },
    };
    vi.mocked(browser.storage.local.get).mockResolvedValue({ tabby_state: stored });

    const result = await loadState();

    expect(browser.storage.local.get).toHaveBeenCalledWith('tabby_state');
    expect(result.nodes).toEqual(stored.nodes);
    expect(result.settings.expiryMs).toBe(5000);
  });

  it('returns default state when storage is empty', async () => {
    vi.mocked(browser.storage.local.get).mockResolvedValue({});

    const result = await loadState();

    expect(result).toEqual(DEFAULT_STATE);
  });

  it('merges partial stored state with defaults', async () => {
    vi.mocked(browser.storage.local.get).mockResolvedValue({
      tabby_state: { nodes: [{ id: 't1' }] },
    });

    const result = await loadState();

    expect(result.nodes).toEqual([{ id: 't1' }]);
    expect(result.recentlyClosed).toEqual([]);
    expect(result.settings.expiryMs).toBe(DEFAULT_EXPIRY_MS);
  });
});

// ── saveState ───────────────────────────────────────────────────────────

describe('saveState', () => {
  beforeEach(() => {
    vi.mocked(browser.storage.local.set).mockReset();
    vi.mocked(browser.storage.local.set).mockResolvedValue(undefined);
  });

  it('persists state under the tabby_state key', async () => {
    await saveState(DEFAULT_STATE);

    expect(browser.storage.local.set).toHaveBeenCalledWith({
      tabby_state: DEFAULT_STATE,
    });
  });
});

// ── debouncedSave ───────────────────────────────────────────────────────

describe('debouncedSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(browser.storage.local.set).mockReset();
    vi.mocked(browser.storage.local.set).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves after the default 500ms delay', async () => {
    debouncedSave(DEFAULT_STATE);

    expect(browser.storage.local.set).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);

    expect(browser.storage.local.set).toHaveBeenCalledWith({
      tabby_state: DEFAULT_STATE,
    });
  });

  it('cancels previous pending save when called again', async () => {
    const state1 = { ...DEFAULT_STATE, settings: { expiryMs: 1 } };
    const state2 = { ...DEFAULT_STATE, settings: { expiryMs: 2 } };

    debouncedSave(state1);
    await vi.advanceTimersByTimeAsync(300);
    debouncedSave(state2);
    await vi.advanceTimersByTimeAsync(500);

    expect(browser.storage.local.set).toHaveBeenCalledTimes(1);
    expect(browser.storage.local.set).toHaveBeenCalledWith({
      tabby_state: state2,
    });
  });

  it('uses a custom delay when provided', async () => {
    debouncedSave(DEFAULT_STATE, 1000);

    await vi.advanceTimersByTimeAsync(500);
    expect(browser.storage.local.set).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    expect(browser.storage.local.set).toHaveBeenCalled();
  });
});
