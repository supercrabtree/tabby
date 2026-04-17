<script lang="ts">
  import type { TreeNode as TreeNodeType } from '../shared/types';
  import { getRootNodes, getChildren, getNextPosition } from '../shared/tree-utils';
  import {
    tabby, connect, isCollapsed, toggleCollapsed,
    activateTab, closeTab, showContextMenu, hideContextMenu, moveNode, clearDragState,
  } from './store.svelte.ts';
  import TreeNode from './components/TreeNode.svelte';
  import FoldDivider from './components/FoldDivider.svelte';
  import RecentlyClosed from './components/RecentlyClosed.svelte';
  import ContextMenu from './components/ContextMenu.svelte';

  let permanentNodes = $derived(getRootNodes(tabby.data.nodes, 'permanent'));
  let ephemeralNodes = $derived(getRootNodes(tabby.data.nodes, 'ephemeral'));
  let permanentDragOver = $derived(tabby.ui.dropZone === 'permanent');
  let ephemeralDragOver = $derived(tabby.ui.dropZone === 'ephemeral');

  $effect(() => {
    connect();
  });

  function getVisibleNodeList(): TreeNodeType[] {
    const result: TreeNodeType[] = [];
    function walk(node: TreeNodeType) {
      result.push(node);
      if (!isCollapsed(node.id)) {
        for (const child of getChildren(tabby.data.nodes, node.id)) {
          walk(child);
        }
      }
    }
    for (const n of permanentNodes) walk(n);
    for (const n of ephemeralNodes) walk(n);
    return result;
  }

  const BASE_FONT_PX = 19.2;
  let zoom = $state(100);

  function applyZoom() {
    document.documentElement.style.fontSize = `${BASE_FONT_PX * zoom / 100}px`;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      hideContextMenu();
      return;
    }

    if (e.metaKey || e.ctrlKey) {
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        zoom = Math.min(180, zoom + 10);
        applyZoom();
        return;
      }
      if (e.key === '-') {
        e.preventDefault();
        zoom = Math.max(60, zoom - 10);
        applyZoom();
        return;
      }
      if (e.key === '0') {
        e.preventDefault();
        zoom = 100;
        applyZoom();
        return;
      }
    }

    const visible = getVisibleNodeList();
    if (visible.length === 0) return;

    const idx = tabby.ui.focusedNodeId
      ? visible.findIndex(n => n.id === tabby.ui.focusedNodeId)
      : -1;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const next = idx < visible.length - 1 ? idx + 1 : (idx === -1 ? 0 : idx);
        tabby.ui.focusedNodeId = visible[next].id;
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        if (idx > 0) tabby.ui.focusedNodeId = visible[idx - 1].id;
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        if (idx < 0) break;
        const node = visible[idx];
        if (isCollapsed(node.id)) {
          toggleCollapsed(node.id);
        } else {
          const children = getChildren(tabby.data.nodes, node.id);
          if (children.length > 0) tabby.ui.focusedNodeId = children[0].id;
        }
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        if (idx < 0) break;
        const node = visible[idx];
        if (!isCollapsed(node.id) && getChildren(tabby.data.nodes, node.id).length > 0) {
          toggleCollapsed(node.id);
        } else if (node.parentId) {
          tabby.ui.focusedNodeId = node.parentId;
        }
        break;
      }
      case 'Enter': {
        e.preventDefault();
        if (idx < 0) break;
        const node = visible[idx];
        if (node.type === 'tab') activateTab(node.firefoxTabId);
        else toggleCollapsed(node.id);
        break;
      }
      case 'Delete': {
        e.preventDefault();
        if (idx < 0) break;
        const node = visible[idx];
        if (node.type === 'tab') closeTab(node.id);
        break;
      }
    }
  }

  function handleZoneDragOver(e: DragEvent) {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
  }

  function handlePermanentDrop(e: DragEvent) {
    e.preventDefault();
    const nodeId = e.dataTransfer?.getData('text/plain');
    clearDragState();
    if (nodeId) {
      moveNode(nodeId, null, getNextPosition(tabby.data.nodes, null, 'permanent'), 'permanent');
    }
  }

  function handleEphemeralDrop(e: DragEvent) {
    e.preventDefault();
    const nodeId = e.dataTransfer?.getData('text/plain');
    clearDragState();
    if (nodeId) {
      moveNode(nodeId, null, getNextPosition(tabby.data.nodes, null, 'ephemeral'), 'ephemeral');
    }
  }

  function handleSidebarDragLeave(e: DragEvent) {
    const sidebar = e.currentTarget as HTMLElement;
    const related = e.relatedTarget as Node | null;
    if (!related || !sidebar.contains(related)) {
      tabby.ui.dropTarget = null;
      tabby.ui.dropZone = null;
    }
  }

  function handlePermanentContext(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, null, 'permanent');
    }
  }

  function handleSidebarClick() {
    hideContextMenu();
  }
</script>

<div
  class="sidebar"
  role="tree"
  tabindex="0"
  onkeydown={handleKeydown}
  onclick={handleSidebarClick}
  ondragleave={handleSidebarDragLeave}
>
  <div class="tab-tree">
    <div
      class="permanent-zone"
      class:drag-over={permanentDragOver}
      role="group"
      aria-label="Permanent tabs"
      ondragover={(e: DragEvent) => { handleZoneDragOver(e); tabby.ui.dropTarget = null; tabby.ui.dropZone = 'permanent'; }}
      ondrop={handlePermanentDrop}
      oncontextmenu={handlePermanentContext}
    >
      {#each permanentNodes as node (node.id)}
        <TreeNode {node} depth={0} />
      {/each}
    </div>

    <FoldDivider />

    <div
      class="ephemeral-zone"
      class:drag-over={ephemeralDragOver}
      role="group"
      aria-label="Ephemeral tabs"
      ondragover={(e: DragEvent) => { handleZoneDragOver(e); tabby.ui.dropTarget = null; tabby.ui.dropZone = 'ephemeral'; }}
      ondrop={handleEphemeralDrop}
    >
      {#each ephemeralNodes as node (node.id)}
        <TreeNode {node} depth={0} />
      {/each}
    </div>
  </div>

  <RecentlyClosed />
</div>

<ContextMenu />

<style>
  .sidebar {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    outline: none;
  }

  .tab-tree {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding-top: var(--sidebar-padding);
  }

  .permanent-zone {
    min-height: 36px;
    transition: background-color 150ms ease;
    padding-bottom: 2px;
  }

  .ephemeral-zone {
    min-height: 36px;
    transition: background-color 150ms ease;
  }

  .permanent-zone.drag-over,
  .ephemeral-zone.drag-over {
    background-color: var(--bg-drag-over);
  }
</style>
