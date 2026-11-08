/**
 * Workspace view filter seam: a client plugin registers a filter that the
 * Workspace browser renders inside its View options menu and applies to the
 * Workspace list. The seam carries no product semantics — a filter supplies
 * its own localized heading, menu rows, selection state, and visibility
 * predicate, so the browser stays unaware of what is being filtered.
 *
 * @module @deepseek-ai/dsh-client-ui-workspace/client
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'

/** One selectable row a filter contributes to the View options menu. */
export interface WorkspaceViewFilterItem {
  /** Stable within its filter; menu ids derive from it. */
  readonly id: string
  /** Localized row label. */
  readonly label: string
  /** Leading icon. */
  readonly icon?: ReactNode
  /** Whether this row's filter state is active now; renders the menu check. */
  readonly selected?: boolean
  /** Whether the row cannot be activated now. */
  readonly disabled?: boolean
  /** Applies the row's selection change; the menu stays open afterwards. */
  readonly onSelect: () => void
}

/** One registered Workspace view filter. */
export interface WorkspaceViewFilter {
  /** Stable identity across reloads; duplicate registration fails. */
  readonly id: string
  /** Localized heading rendered above this filter's rows; hidden with an empty row list. */
  readonly label: string
  /** Ascending position among filters; ties break by `id`. */
  readonly order?: number
  /**
   * Rows rendered when the menu opens; an empty list hides the whole group.
   * The browser reads this and {@link matches} when it renders, and it cannot
   * observe the filter's own state: a filter whose rows or predicate change
   * must re-register itself so the browser rebuilds the menu and re-applies
   * the predicate.
   */
  readonly items: () => readonly WorkspaceViewFilterItem[]
  /** Whether one Workspace stays visible; every registered filter must accept it. */
  readonly matches: (workspace: WorkspaceView) => boolean
  /**
   * Whether the browser's ungrouped bucket (Sessions that belong to no
   * registered Workspace) stays visible. Omitted means always visible; a
   * filter that narrows to tagged Workspaces should hide it while active.
   */
  readonly matchesUngrouped?: () => boolean
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Registry of Workspace view filters contributed by client plugins. */
    workspaceViewFilters: WorkspaceViewFilters
  }
}

/**
 * Registration service owned by the Workspace browser. A filter is a plain
 * value; registering it makes the browser render its rows and apply its
 * predicate until the returned disposer runs.
 */
export class WorkspaceViewFilters extends Service {
  private readonly sink = createSnapshotStore<readonly WorkspaceViewFilter[]>([])

  /** @param ctx - client root Context. */
  constructor(ctx: Context) {
    super(ctx, 'workspaceViewFilters')
  }

  /** Registered filters in menu order; the browser binds its hook to this source. */
  get source(): HostObservable<readonly WorkspaceViewFilter[]> {
    return this.sink
  }

  /**
   * Register one filter.
   * @param filter - the contribution.
   * @returns the disposer that withdraws it.
   * @throws If a filter with the same id is already registered.
   */
  register(filter: WorkspaceViewFilter): () => void {
    if (this.sink.getSnapshot().some(row => row.id === filter.id)) {
      throw new Error(`workspaceViewFilters: duplicate filter id ${filter.id}`)
    }
    this.sink.set(sortFilters([...this.sink.getSnapshot(), filter]))
    return () => {
      this.sink.set(this.sink.getSnapshot().filter(row => row.id !== filter.id))
    }
  }
}

/**
 * Menu order: ascending `order`, then id.
 * @param filters - registered filters.
 * @returns one new ordered array.
 */
function sortFilters(filters: readonly WorkspaceViewFilter[]): readonly WorkspaceViewFilter[] {
  return [...filters].sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.id.localeCompare(right.id))
}
