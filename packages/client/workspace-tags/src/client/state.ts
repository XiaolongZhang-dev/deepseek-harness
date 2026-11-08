/** Browser-local Workspace tag state shared by the row decoration, the filter, and the editor dialog. */

import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'

/** One Workspace whose tag editor is open. */
export interface TagEditorRequest {
  readonly workspaceId: string
  readonly displayTitle: string
}

/** Everything this plugin's surfaces read. */
export interface WorkspaceTagsState {
  /** Workspace id -> tags, mirrored from the Host settings document. */
  readonly assignments: Readonly<Record<string, readonly string[]>>
  /** Tags narrowing the Workspace list; empty means no filter. */
  readonly selected: readonly string[]
  /** Settings revision the mirror was read at; writes carry it back. */
  readonly revision: number
  /** The Workspace whose editor is open, or null. */
  readonly editor: TagEditorRequest | null
  /** Whether the global tag manager is open. */
  readonly manager: boolean
  /** The last load or save failure; the next success clears it. */
  readonly failure: 'load' | 'save' | null
}

/** Initial state: no mirror yet, no filter, no editor. */
export const EMPTY_TAGS_STATE: WorkspaceTagsState = {
  assignments: {},
  selected: [],
  revision: 0,
  editor: null,
  manager: false,
  failure: null,
}

/**
 * Create the one state handle this plugin's surfaces share.
 * @returns a snapshot handle read through injected hooks and written by the plugin body.
 */
export function createTagsStore() {
  return createSnapshotStore<WorkspaceTagsState>(EMPTY_TAGS_STATE)
}
