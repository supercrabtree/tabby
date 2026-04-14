<script lang="ts">
  import type { TabNode } from '../../shared/types';
  import { getChildren, getNextPosition } from '../../shared/tree-utils';
  import {
    tabby, hideContextMenu,
    reAnchor, closeTab, promoteNode, demoteNode,
    createFolder, deleteFolder, flattenNodes,
  } from '../store.svelte.ts';
  import browser from 'webextension-polyfill';

  let visible = $derived(tabby.ui.contextMenu.visible);
  let target = $derived(tabby.ui.contextMenu.targetNode);
  let targetZone = $derived(tabby.ui.contextMenu.targetZone);

  let isTab = $derived(target?.type === 'tab');
  let isFolder = $derived(target?.type === 'folder');
  let isPermanent = $derived(target?.zone === 'permanent');
  let isEphemeral = $derived(target?.zone === 'ephemeral');
  let hasChildren = $derived(
    target ? getChildren(tabby.data.nodes, target.id).length > 0 : false,
  );

  $effect(() => {
    if (!visible) return;

    function onClick() { hideContextMenu(); }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') hideContextMenu(); }

    window.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKey);
    };
  });

  function handleReAnchor() {
    if (target) reAnchor(target.id);
  }

  function handlePromote() {
    if (target) promoteNode(target.id);
  }

  function handleDemote() {
    if (target) demoteNode(target.id);
  }

  function handleClose() {
    if (target) closeTab(target.id);
  }

  function handleFlatten() {
    if (target) {
      const childIds = getChildren(tabby.data.nodes, target.id).map(n => n.id);
      if (childIds.length > 0) flattenNodes(childIds);
    }
  }

  function handleDuplicate() {
    if (target?.type === 'tab') {
      browser.tabs.duplicate((target as TabNode).firefoxTabId);
    }
  }

  function handleReload() {
    if (target?.type === 'tab') {
      browser.tabs.reload((target as TabNode).firefoxTabId);
    }
  }

  function handleRename() {
    if (target?.type === 'folder') {
      tabby.ui.renamingNodeId = target.id;
    }
  }

  function handleNewSubfolder() {
    if (target) {
      const pos = getNextPosition(tabby.data.nodes, target.id);
      createFolder('New Folder', target.id, pos);
    }
  }

  function handleDeleteFolder() {
    if (target) deleteFolder(target.id);
  }

  function handleNewFolder() {
    const pos = getNextPosition(tabby.data.nodes, null, 'permanent');
    createFolder('New Folder', null, pos);
  }
</script>

{#if visible}
  <div
    class="context-menu"
    style:left="{tabby.ui.contextMenu.x}px"
    style:top="{tabby.ui.contextMenu.y}px"
  >
    {#if isTab && isPermanent}
      <button class="menu-item" onclick={handleReAnchor}>Re-anchor here</button>
      <button class="menu-item" onclick={handleDemote}>Move below fold</button>
      {#if hasChildren}
        <button class="menu-item" onclick={handleFlatten}>Flatten children</button>
      {/if}
      <div class="menu-divider"></div>
      <button class="menu-item" onclick={handleDuplicate}>Duplicate</button>
      <button class="menu-item" onclick={handleReload}>Reload</button>
      <div class="menu-divider"></div>
      <button class="menu-item danger" onclick={handleClose}>Close</button>

    {:else if isTab && isEphemeral}
      <button class="menu-item" onclick={handlePromote}>Keep (move above fold)</button>
      {#if hasChildren}
        <button class="menu-item" onclick={handleFlatten}>Flatten children</button>
      {/if}
      <div class="menu-divider"></div>
      <button class="menu-item" onclick={handleDuplicate}>Duplicate</button>
      <button class="menu-item" onclick={handleReload}>Reload</button>
      <div class="menu-divider"></div>
      <button class="menu-item danger" onclick={handleClose}>Close</button>

    {:else if isFolder}
      <button class="menu-item" onclick={handleRename}>Rename</button>
      <button class="menu-item" onclick={handleNewSubfolder}>New Subfolder</button>
      {#if hasChildren}
        <div class="menu-divider"></div>
        <button class="menu-item" onclick={handleFlatten}>Flatten children</button>
      {/if}
      <div class="menu-divider"></div>
      <button class="menu-item danger" onclick={handleDeleteFolder}>Delete</button>

    {:else if targetZone === 'permanent'}
      <button class="menu-item" onclick={handleNewFolder}>New Folder</button>
    {/if}
  </div>
{/if}

<style>
  .context-menu {
    position: fixed;
    min-width: 180px;
    background: var(--context-bg);
    border: 1px solid var(--context-border);
    border-radius: var(--radius);
    box-shadow: var(--context-shadow);
    padding: 4px 0;
    z-index: 1000;
  }

  .menu-item {
    display: block;
    width: 100%;
    padding: 6px 12px;
    text-align: left;
    background: none;
    border: none;
    color: var(--text-primary);
    font-size: var(--font-size);
    font-family: inherit;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 100ms ease;
  }

  .menu-item:hover {
    background-color: var(--context-hover);
  }

  .menu-item.danger {
    color: var(--close-btn-hover);
  }

  .menu-divider {
    height: 1px;
    background: var(--border);
    margin: 4px 0;
  }
</style>
