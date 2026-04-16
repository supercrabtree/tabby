export interface TabNode {
  id: string;
  type: 'tab';
  parentId: string | null;
  zone: 'permanent' | 'ephemeral';
  position: number;
  collapsed: boolean;
  firefoxTabId: number;
  url: string;
  title: string;
  customTitle: string | null;
  favIconUrl: string;
  anchorUrl: string | null;
  status: 'loading' | 'complete';
  lastActiveAt: number | null;
}

export interface FolderNode {
  id: string;
  type: 'folder';
  parentId: string | null;
  zone: 'permanent';
  position: number;
  collapsed: boolean;
  name: string;
  color: string | null;
  icon: string | null;
}

export type TreeNode = TabNode | FolderNode;

export interface ClosedEntry {
  id: string;
  title: string;
  url: string;
  favIconUrl: string;
  closedAt: number;
}

export interface TabbyState {
  nodes: TreeNode[];
  recentlyClosed: ClosedEntry[];
  settings: TabbySettings;
}

export interface TabbySettings {
  expiryMs: number;
}

export const DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000;
