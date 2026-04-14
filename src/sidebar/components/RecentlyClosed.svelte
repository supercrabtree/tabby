<script lang="ts">
  import { tabby, reopenClosed } from '../store.svelte.ts';

  let collapsed = $state(true);
  let entries = $derived(
    [...tabby.data.recentlyClosed].sort((a, b) => b.closedAt - a.closedAt),
  );
  let hasEntries = $derived(entries.length > 0);

  const FALLBACK_ICON = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">' +
    '<circle cx="8" cy="8" r="7" fill="none" stroke="#888" stroke-width="1.5"/>' +
    '<path d="M1 8h14M8 1a10 10 0 0 1 0 14M8 1a10 10 0 0 0 0 14" fill="none" stroke="#888" stroke-width="1"/>' +
    '</svg>'
  )}`;

  function toggle() {
    collapsed = !collapsed;
  }

  function handleReopen(entryId: string) {
    reopenClosed(entryId);
  }

  function handleFaviconError(e: Event) {
    (e.target as HTMLImageElement).src = FALLBACK_ICON;
  }

  function formatTime(ts: number): string {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }
</script>

{#if hasEntries}
  <div class="recently-closed">
    <button class="header" onclick={toggle}>
      <span class="chevron" class:expanded={!collapsed}>&#x203A;</span>
      <span class="header-text">Recently Closed</span>
      <span class="count">{entries.length}</span>
    </button>

    {#if !collapsed}
      <div class="entries">
        {#each entries as entry (entry.id)}
          <button class="entry" onclick={() => handleReopen(entry.id)} title={entry.url}>
            <img
              class="favicon"
              src={entry.favIconUrl || FALLBACK_ICON}
              alt=""
              width="16"
              height="16"
              onerror={handleFaviconError}
            />
            <span class="entry-title">{entry.title || entry.url}</span>
            <span class="entry-time">{formatTime(entry.closedAt)}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .recently-closed {
    flex-shrink: 0;
    background: var(--recently-closed-bg);
    border-top: 1px solid var(--border);
  }

  .header {
    display: flex;
    align-items: center;
    width: 100%;
    height: var(--row-height);
    padding: 0 8px;
    gap: 4px;
    background: var(--recently-closed-header);
    border: none;
    cursor: pointer;
    color: var(--text-secondary);
    font-size: var(--font-size);
    font-family: inherit;
  }

  .header:hover {
    background: var(--bg-hover);
  }

  .chevron {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    flex-shrink: 0;
    font-size: 14px;
    transform: rotate(0deg);
    transition: transform 150ms ease;
  }

  .chevron.expanded {
    transform: rotate(90deg);
  }

  .header-text {
    flex: 1;
    text-align: left;
    font-weight: 500;
  }

  .count {
    font-size: 10px;
    background: var(--bg-active);
    color: var(--text-muted);
    padding: 1px 5px;
    border-radius: 8px;
  }

  .entries {
    max-height: 200px;
    overflow-y: auto;
  }

  .entry {
    display: flex;
    align-items: center;
    width: 100%;
    height: var(--row-height);
    padding: 0 8px 0 24px;
    gap: 6px;
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    transition: background-color 150ms ease;
    color: var(--text-primary);
  }

  .entry:hover {
    background-color: var(--bg-hover);
  }

  .favicon {
    width: var(--icon-size);
    height: var(--icon-size);
    flex-shrink: 0;
    border-radius: 2px;
    opacity: 0.6;
  }

  .entry-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size);
    text-align: left;
    color: var(--text-secondary);
  }

  .entry-time {
    flex-shrink: 0;
    font-size: 10px;
    color: var(--text-muted);
  }
</style>
