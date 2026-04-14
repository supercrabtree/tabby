<script lang="ts">
  import type { TreeNode as TreeNodeType } from '../../shared/types';
  import { getChildren } from '../../shared/tree-utils';
  import { tabby, isCollapsed } from '../store.svelte.ts';
  import TabRow from './TabRow.svelte';
  import FolderRow from './FolderRow.svelte';
  import TreeNode from './TreeNode.svelte';

  let { node, depth }: { node: TreeNodeType; depth: number } = $props();

  let collapsed = $derived(isCollapsed(node.id));
  let children = $derived(collapsed ? [] : getChildren(tabby.data.nodes, node.id));
</script>

{#if node.type === 'tab'}
  <TabRow node={node} {depth} />
{:else}
  <FolderRow node={node} {depth} />
{/if}

{#each children as child (child.id)}
  <TreeNode node={child} depth={depth + 1} />
{/each}
