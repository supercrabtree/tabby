import type { TabbyState, TabbySettings } from './types';

export type Message =
  | { type: 'STATE_UPDATED'; state: TabbyState }
  | { type: 'GET_STATE' }
  | { type: 'ACTIVATE_TAB'; firefoxTabId: number }
  | { type: 'CLOSE_TAB'; nodeId: string }
  | { type: 'PROMOTE_NODE'; nodeId: string }
  | { type: 'DEMOTE_NODE'; nodeId: string }
  | { type: 'MOVE_NODE'; nodeId: string; newParentId: string | null; newPosition: number; newZone: 'permanent' | 'ephemeral' }
  | { type: 'CREATE_FOLDER'; name: string; parentId: string | null; position: number }
  | { type: 'RENAME_FOLDER'; nodeId: string; name: string }
  | { type: 'DELETE_FOLDER'; nodeId: string }
  | { type: 'FLATTEN_NODES'; nodeIds: string[] }
  | { type: 'RE_ANCHOR'; nodeId: string }
  | { type: 'REOPEN_CLOSED'; entryId: string }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<TabbySettings> };
