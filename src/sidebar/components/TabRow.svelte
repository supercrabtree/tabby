<script lang="ts">
  import type { TabNode } from '../../shared/types';
  import { getExpiryProgress, getNextPosition, getSubtree } from '../../shared/tree-utils';
  import { tabby, activateTab, closeTab, showContextMenu, moveNode } from '../store.svelte.ts';
  import browser from 'webextension-polyfill';

  let { node, depth }: { node: TabNode; depth: number } = $props();

  const FALLBACK_ICON = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">' +
    '<circle cx="8" cy="8" r="7" fill="none" stroke="#888" stroke-width="1.5"/>' +
    '<path d="M1 8h14M8 1a10 10 0 0 1 0 14M8 1a10 10 0 0 0 0 14" fill="none" stroke="#888" stroke-width="1"/>' +
    '</svg>'
  )}`;

  let isAtAnchor = $derived(node.anchorUrl !== null && node.url === node.anchorUrl);
  let isDrifted = $derived(node.anchorUrl !== null && node.url !== node.anchorUrl);
  let isFocused = $derived(tabby.ui.focusedNodeId === node.id);
  let isPermanent = $derived(node.zone === 'permanent');
  let expiryProgress = $derived(
    node.zone === 'ephemeral' && node.lastActiveAt !== null
      ? getExpiryProgress(node.lastActiveAt, tabby.data.settings.expiryMs)
      : null,
  );

  let dropPosition = $state<'before' | 'inside' | 'after' | null>(null);

  function handleClick() {
    activateTab(node.firefoxTabId);
    tabby.ui.focusedNodeId = node.id;
  }

  function handleDblClick() {
    if (isPermanent && node.anchorUrl && isDrifted) {
      browser.tabs.update(node.firefoxTabId, { url: node.anchorUrl });
    }
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu(e.clientX, e.clientY, node, node.zone);
  }

  function handleDragStart(e: DragEvent) {
    e.dataTransfer!.setData('text/plain', node.id);
    e.dataTransfer!.effectAllowed = 'move';
  }

  function getDropZone(e: DragEvent, el: HTMLElement): 'before' | 'inside' | 'after' {
    const rect = el.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const ratio = y / rect.height;
    if (ratio < 0.25) return 'before';
    if (ratio > 0.75) return 'after';
    return 'inside';
  }

  function isDescendant(draggedId: string): boolean {
    const subtree = getSubtree(tabby.data.nodes, node.id);
    return subtree.some(n => n.id === draggedId);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer!.dropEffect = 'move';
    dropPosition = getDropZone(e, e.currentTarget as HTMLElement);
  }

  function handleDragLeave(e: DragEvent) {
    const row = e.currentTarget as HTMLElement;
    const related = e.relatedTarget as Node | null;
    if (related && row.contains(related)) return;
    dropPosition = null;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = e.dataTransfer?.getData('text/plain');
    dropPosition = null;

    if (!draggedId || draggedId === node.id || isDescendant(draggedId)) return;

    const zone = getDropZone(e, e.currentTarget as HTMLElement);

    if (zone === 'inside') {
      const pos = getNextPosition(tabby.data.nodes, node.id);
      moveNode(draggedId, node.id, pos, node.zone);
    } else if (zone === 'before') {
      moveNode(draggedId, node.parentId, node.position, node.zone);
    } else {
      moveNode(draggedId, node.parentId, node.position + 1, node.zone);
    }
  }

  function handleDragEnd() {
    dropPosition = null;
  }

  function handleClose(e: MouseEvent) {
    e.stopPropagation();
    closeTab(node.id);
  }

  function handleFaviconError(e: Event) {
    (e.target as HTMLImageElement).src = FALLBACK_ICON;
  }
</script>

<div
  class="tab-row"
  class:permanent={isPermanent}
  class:ephemeral={!isPermanent}
  class:focused={isFocused}
  class:loading={node.status === 'loading'}
  class:drifted={isDrifted}
  class:drop-before={dropPosition === 'before'}
  class:drop-inside={dropPosition === 'inside'}
  class:drop-after={dropPosition === 'after'}
  style:margin-left="calc(var(--sidebar-padding) + {depth * 18}px)"
  role="treeitem"
  draggable="true"
  onclick={handleClick}
  ondblclick={handleDblClick}
  oncontextmenu={handleContextMenu}
  ondragstart={handleDragStart}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  ondragend={handleDragEnd}
>
  <img
    class="favicon"
    src={node.favIconUrl || FALLBACK_ICON}
    alt=""
    width="16"
    height="16"
    onerror={handleFaviconError}
  />

  <span class="title">{node.title || node.url}</span>

  <div class="trailing-action">
    {#if isPermanent && node.anchorUrl}
      <span
        class="anchor-dot"
        class:at-anchor={isAtAnchor}
        class:drifted={isDrifted}
      ></span>
    {:else if expiryProgress !== null}
      <span class="expiry-pill">
        <span class="expiry-fill" style:width="{expiryProgress * 100}%"></span>
      </span>
    {/if}
    <button class="close-btn" onclick={handleClose} title="Close tab">&times;</button>
  </div>
</div>

<style>
  .tab-row {
    display: flex;
    align-items: center;
    height: var(--row-height);
    padding: 0 8px;
    gap: 8px;
    position: relative;
    cursor: pointer;
    transition: background-color 150ms ease, border-color 150ms ease;
    border-radius: var(--card-radius);
    margin-right: var(--sidebar-padding);
  }

  .tab-row.permanent {
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    margin-bottom: var(--gap);
    margin-left: var(--sidebar-padding);
  }

  .tab-row.permanent:hover {
    background: var(--card-bg-hover);
  }

  .tab-row.ephemeral {
    background: none;
    border: 1px solid transparent;
    margin-left: var(--sidebar-padding);
  }

  .tab-row.ephemeral:hover {
    background: var(--bg-hover);
  }

  .tab-row.focused {
    background: var(--bg-active);
    border-color: var(--card-border);
  }

  .tab-row.loading .favicon {
    opacity: 0.4;
  }

  .tab-row.drifted {
    cursor: pointer;
  }

  /* Drop indicators */
  .tab-row.drop-before::before {
    content: '';
    position: absolute;
    top: -2px;
    left: 8px;
    right: 8px;
    height: 2px;
    background: var(--anchor-color);
    border-radius: 1px;
    z-index: 1;
  }

  .tab-row.drop-inside {
    background: var(--bg-drag-over);
    border-color: var(--anchor-color);
    border-style: dashed;
  }

  .tab-row.drop-after::after {
    content: '';
    position: absolute;
    bottom: -2px;
    left: 8px;
    right: 8px;
    height: 2px;
    background: var(--anchor-color);
    border-radius: 1px;
    z-index: 1;
  }

  .favicon {
    width: var(--icon-size);
    height: var(--icon-size);
    flex-shrink: 0;
    border-radius: 3px;
  }

  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size);
    color: var(--text-primary);
  }

  .ephemeral .title {
    color: var(--text-secondary);
  }

  .trailing-action {
    position: relative;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .anchor-dot {
    width: 12px;
    height: 6px;
    border-radius: 3px;
    transition: opacity 150ms ease;
  }

  .anchor-dot.at-anchor {
    background-color: var(--anchor-color);
  }

  .anchor-dot.drifted {
    background-color: transparent;
    box-shadow: inset 0 0 0 1.5px var(--anchor-dimmed);
  }

  .tab-row:hover .anchor-dot,
  .tab-row:hover .expiry-pill {
    opacity: 0;
  }

  .expiry-pill {
    width: 12px;
    height: 6px;
    border-radius: 3px;
    background: var(--countdown-track);
    overflow: hidden;
    transition: opacity 150ms ease;
  }

  .expiry-fill {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: var(--countdown-bar);
    transition: width 60s linear;
  }

  .close-btn {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    border-radius: var(--radius);
    color: var(--close-btn);
    font-size: 14px;
    cursor: pointer;
    line-height: 1;
    opacity: 0;
    transition: opacity 150ms ease;
  }

  .tab-row:hover .close-btn {
    opacity: 1;
  }

  .close-btn:hover {
    color: var(--close-btn-hover);
    background-color: var(--bg-active);
  }
</style>
