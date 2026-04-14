<script lang="ts">
  import { getNextPosition } from '../../shared/tree-utils';
  import { tabby, moveNode, createFolder } from '../store.svelte.ts';

  let dragOver = $state(false);

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    dragOver = true;
  }

  function handleDragLeave() {
    dragOver = false;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragOver = false;
    const nodeId = e.dataTransfer?.getData('text/plain');
    if (nodeId) {
      const pos = getNextPosition(tabby.data.nodes, null, 'permanent');
      moveNode(nodeId, null, pos, 'permanent');
    }
  }

  function handleNewFolder() {
    const pos = getNextPosition(tabby.data.nodes, null, 'permanent');
    createFolder('New Folder', null, pos);
  }
</script>

<div
  class="fold-divider"
  class:drag-over={dragOver}
  role="separator"
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
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
  }

  .fold-line {
    flex: 1;
    border-top: 1.5px dashed var(--fold-line);
    opacity: 0.8;
    transition: border-color 150ms ease, opacity 150ms ease;
  }

  .fold-divider.drag-over .fold-line {
    border-top-width: 2px;
    border-top-style: solid;
    border-top-color: var(--anchor-color);
    opacity: 1;
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
