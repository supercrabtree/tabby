<script lang="ts">
  import { tick } from 'svelte';
  import type { FolderNode } from '../../shared/types';
  import { getNextPosition, getSubtree } from '../../shared/tree-utils';
  import {
    tabby, isCollapsed, toggleCollapsed,
    renameFolder, showContextMenu, moveNode, clearDragState,
  } from '../store.svelte.ts';

  let { node, depth }: { node: FolderNode; depth: number } = $props();

  let collapsed = $derived(isCollapsed(node.id));
  let isFocused = $derived(tabby.ui.focusedNodeId === node.id);
  let editing = $state(false);
  let editName = $state('');
  let dropPosition = $derived(
    tabby.ui.dropTarget?.nodeId === node.id ? tabby.ui.dropTarget.position : null,
  );
  let inputEl = $state<HTMLInputElement | undefined>(undefined);

  $effect(() => {
    if (tabby.ui.renamingNodeId === node.id) {
      tabby.ui.renamingNodeId = null;
      startEditing();
    }
  });

  async function startEditing() {
    editing = true;
    editName = node.name;
    await tick();
    inputEl?.focus();
    inputEl?.select();
  }

  function commitRename() {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== node.name) {
      renameFolder(node.id, trimmed);
    }
    editing = false;
  }

  function handleInputKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') commitRename();
    if (e.key === 'Escape') {
      editName = node.name;
      editing = false;
    }
  }

  function handleClick() {
    toggleCollapsed(node.id);
    tabby.ui.focusedNodeId = node.id;
  }

  function handleDblClick(e: MouseEvent) {
    e.preventDefault();
    startEditing();
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu(e.clientX, e.clientY, node, node.zone);
  }

  function handleDragStart(e: DragEvent) {
    e.dataTransfer!.setData('text/plain', node.id);
    e.dataTransfer!.effectAllowed = 'move';
    tabby.ui.draggingNodeId = node.id;
  }

  function getDropZone(e: DragEvent, el: HTMLElement): 'before' | 'inside' | 'after' {
    const rect = el.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const ratio = y / rect.height;
    if (ratio < 0.2) return 'before';
    if (ratio > 0.8) return 'after';
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
    tabby.ui.dropTarget = { nodeId: node.id, position: getDropZone(e, e.currentTarget as HTMLElement) };
    tabby.ui.dropZone = node.zone;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = e.dataTransfer?.getData('text/plain');
    const zone = getDropZone(e, e.currentTarget as HTMLElement);
    clearDragState();

    if (!draggedId || draggedId === node.id || isDescendant(draggedId)) return;

    if (zone === 'inside') {
      const pos = getNextPosition(tabby.data.nodes, node.id);
      moveNode(draggedId, node.id, pos, 'permanent');
    } else if (zone === 'before') {
      moveNode(draggedId, node.parentId, node.position, node.zone);
    } else {
      moveNode(draggedId, node.parentId, node.position + 1, node.zone);
    }
  }

  function handleDragEnd() {
    clearDragState();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }
</script>

<div
  class="folder-row"
  class:focused={isFocused}
  class:drop-before={dropPosition === 'before'}
  class:drop-inside={dropPosition === 'inside'}
  class:drop-after={dropPosition === 'after'}
  style:margin-left="calc(var(--sidebar-padding) + {depth * 18}px)"
  role="treeitem"
  tabindex="0"
  aria-selected={isFocused}
  aria-expanded={!collapsed}
  draggable={!editing}
  onclick={handleClick}
  onkeydown={handleKeydown}
  ondblclick={handleDblClick}
  oncontextmenu={handleContextMenu}
  ondragstart={handleDragStart}
  ondragover={handleDragOver}
  ondrop={handleDrop}
  ondragend={handleDragEnd}
>
  <span class="folder-icon">{node.icon ?? (collapsed ? '📁' : '📂')}</span>

  {#if editing}
    <input
      bind:this={inputEl}
      bind:value={editName}
      class="rename-input"
      onblur={commitRename}
      onkeydown={handleInputKeydown}
      onclick={(e: MouseEvent) => e.stopPropagation()}
    />
  {:else}
    <span class="folder-name" style:color={node.color ?? undefined}>{node.name}</span>
  {/if}
</div>

<style>
  .folder-row {
    display: flex;
    align-items: center;
    height: var(--row-height);
    padding: 0 8px;
    gap: 8px;
    cursor: pointer;
    position: relative;
    transition: background-color 150ms ease;
    margin-right: var(--sidebar-padding);
    border-radius: var(--card-radius);
  }

  .folder-row:hover {
    background-color: var(--bg-hover);
  }

  .folder-row.focused {
    background-color: var(--bg-active);
  }

  /* Drop indicators */
  .folder-row.drop-before::before {
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

  .folder-row.drop-inside {
    background-color: var(--bg-drag-over);
    outline: 1px dashed var(--anchor-color);
    outline-offset: -1px;
  }

  .folder-row.drop-after::after {
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

  .folder-icon {
    width: var(--icon-size);
    height: var(--icon-size);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-size: var(--icon-size);
    line-height: 1;
  }

  .folder-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size);
    font-weight: 600;
    color: var(--text-primary);
    letter-spacing: 0.01em;
  }

  .rename-input {
    flex: 1;
    min-width: 0;
    font-size: var(--font-size);
    font-family: inherit;
    padding: 2px 6px;
    border: 1px solid var(--anchor-color);
    border-radius: var(--radius);
    background: var(--bg-primary);
    color: var(--text-primary);
    outline: none;
  }
</style>
