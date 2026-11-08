/** Injected shares of this plugin's registrations. */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceTagsState } from './state.ts'

/** The state source every surface reads through its bound `useTags` hook. */
export interface TagsInjected {
  readonly hooks: { readonly tags: HostObservable<WorkspaceTagsState> }
}

/** The global tag manager's share: the state source, its dismissal, and the durable rewrite. */
export interface TagManagerInjected extends TagsInjected {
  /** Dismiss the dialog. */
  readonly close: () => void
  /** Persist the complete assignment map after a rename or delete. */
  readonly save: (assignments: Record<string, string[]>) => Promise<void>
}

/** The editor dialog's share: the state source, its dismissal, and the durable write. */
export interface TagEditorInjected extends TagsInjected {
  /** Dismiss without writing. */
  readonly close: () => void
  /** Persist one Workspace's complete tag list; rejects when the Host refuses the write. */
  readonly save: (workspaceId: string, tags: readonly string[]) => Promise<void>
}
