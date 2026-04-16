<script lang="ts">
  import { getNextPosition } from '../../shared/tree-utils';
  import { tabby, moveNode, createFolder, clearDragState } from '../store.svelte.ts';

  let dropHalf = $derived(
    tabby.ui.dropZone === 'divider-above' ? 'above'
    : tabby.ui.dropZone === 'divider-below' ? 'below'
    : null,
  );

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer!.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const half = (e.clientY - rect.top) < rect.height / 2 ? 'above' : 'below';
    tabby.ui.dropTarget = null;
    tabby.ui.dropZone = half === 'above' ? 'divider-above' : 'divider-below';
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const nodeId = e.dataTransfer?.getData('text/plain');
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const half = (e.clientY - rect.top) < rect.height / 2 ? 'above' : 'below';
    clearDragState();
    if (!nodeId) return;
    if (half === 'above') {
      const pos = getNextPosition(tabby.data.nodes, null, 'permanent');
      moveNode(nodeId, null, pos, 'permanent');
    } else {
      moveNode(nodeId, null, 0, 'ephemeral');
    }
  }

  function handleNewFolder() {
    const pos = getNextPosition(tabby.data.nodes, null, 'permanent');
    createFolder('New Folder', null, pos);
  }
</script>

<div
  class="fold-divider"
  class:drop-above={dropHalf === 'above'}
  class:drop-below={dropHalf === 'below'}
  role="separator"
  ondragover={handleDragOver}
  ondrop={handleDrop}
>
  <div class="fold-line"></div>
  <button class="add-folder-btn" onclick={handleNewFolder} title="New folder">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  </button>
</div>

<style>
  .fold-divider {
    flex-shrink: 0;
    padding: 10px var(--sidebar-padding);
    display: flex;
    align-items: center;
    gap: 8px;
    position: relative;
  }

  .fold-divider.drop-above::before {
    content: '';
    position: absolute;
    top: 0;
    left: calc(var(--sidebar-padding) + 8px);
    right: calc(var(--sidebar-padding) + 8px);
    height: 2px;
    background: var(--anchor-color);
    border-radius: 1px;
  }

  .fold-divider.drop-below::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: calc(var(--sidebar-padding) + 8px);
    right: calc(var(--sidebar-padding) + 8px);
    height: 2px;
    background: var(--anchor-color);
    border-radius: 1px;
  }

  .fold-line {
    flex: 1;
    border-top: 1.5px dashed var(--fold-line);
    opacity: 0.8;
  }

  .add-folder-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    background: none;
    border: 1px solid var(--fold-line);
    border-radius: var(--radius);
    color: var(--text-muted);
    cursor: pointer;
    flex-shrink: 0;
    opacity: 0.6;
    transition: opacity 150ms ease, color 150ms ease, border-color 150ms ease, background-color 150ms ease;
  }

  .fold-divider:hover .add-folder-btn {
    opacity: 1;
  }

  .add-folder-btn:hover {
    opacity: 1;
    color: var(--text-primary);
    border-color: var(--text-secondary);
    background-color: var(--bg-hover);
  }
</style>
