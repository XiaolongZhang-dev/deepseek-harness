/**
 * Workspace tags, browser half: the tag vocabulary lives in the profile's user
 * settings document, and this plugin contributes the three surfaces that make
 * it usable — a Workspace context-menu entry with its editor dialog, the tag
 * decoration on Workspace rows, and a filter registered into the Workspace
 * browser's View options.
 *
 * The plugin owns the data and the UI. ui-workspace owns the generic seams
 * (`workspaceViewFilters` and the row decoration seat), so this plugin never
 * touches the browser's list, menu, or rows directly.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
// Type-only: pulls the generated `remote.settings` namespace and `ctx.remote`.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
// Type-only: pulls `ctx.locale` and the `locale/change` event.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls `ctx.contextMenus` and the Workspace target family.
import type {} from '@deepseek-ai/dsh-client-ui-context-menu/client'
// Type-only: pulls the `shell.overlay` declaration.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the SlotRegistry service and the slot declarations.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls `ctx.workspaceViewFilters`, the row seat, and their types.
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { WorkspaceViewFilterItem } from '@deepseek-ai/dsh-client-ui-workspace/client'
import {
  readAssignments, tagKey, vocabularyOf, WORKSPACE_TAGS_NAMESPACE,
} from '../tags-settings.ts'
import { en, NS, zh, type WorkspaceTagsKey } from './locales.ts'
import { TagEditorDialog } from './TagEditor.tsx'
import { WorkspaceTagChips } from './WorkspaceTagChips.tsx'
import type { TagEditorInjected, TagsInjected } from './slots.ts'
import type { WorkspaceTagsState } from './state.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The tag filter, row decoration, and editor copy. */
    workspaceTags: WorkspaceTagsKey
  }
}

/** Services these contributions read; the seams come from ui-workspace and the shell. */
export const inject = ['slots', 'locale', 'contextMenus', 'remote', 'remote.settings', 'workspaceViewFilters']

/**
 * Contribute the Workspace tag surfaces and keep the local mirror current.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'workspace-tags: dictionaries')
  const t = ctx.locale.bind(NS)
  const store = createSnapshotStore<WorkspaceTagsState>({
    assignments: {}, selected: [], revision: 0, editor: null, failure: null,
  })
  const update = (patch: Partial<WorkspaceTagsState>): void => {
    store.set({ ...store.getSnapshot(), ...patch })
  }

  /** Re-read the Host document; a failed read keeps the previous mirror. */
  const refresh = async (): Promise<void> => {
    try {
      const view = await ctx.remote.settings.describe()
      if (!view.ok) throw new Error(view.error.message)
      const namespace = view.value.namespaces.find(row => row.ns === WORKSPACE_TAGS_NAMESPACE)
      update({ assignments: readAssignments(namespace?.value), revision: namespace?.revision ?? 0, failure: null })
    } catch (_error: unknown) {
      // The filter keeps narrowing on the last mirror; the next read retries.
      update({ failure: 'load' })
    }
  }

  /** Persist one Workspace's complete tag list. */
  const save = async (workspaceId: string, tags: readonly string[]): Promise<void> => {
    const current = store.getSnapshot()
    const assignments: Record<string, string[]> = {}
    for (const [id, names] of Object.entries(current.assignments)) assignments[id] = [...names]
    if (tags.length === 0) delete assignments[workspaceId]
    else assignments[workspaceId] = [...tags]
    const payload: Record<string, JsonValue> = assignments
    try {
      const result = await ctx.remote.settings.mutate(
        WORKSPACE_TAGS_NAMESPACE,
        [{ op: 'set', path: ['assignments'], value: payload }],
        current.revision,
      )
      if (!result.ok) throw new Error(result.error.message)
    } catch (error: unknown) {
      update({ failure: 'save' })
      throw error
    }
    update({ assignments, revision: current.revision + 1, failure: null })
    void refresh()
  }

  /** Toggle one tag in the active filter. */
  const toggleSelected = (tag: string): void => {
    const key = tagKey(tag)
    const selected = store.getSnapshot().selected
    update({
      selected: selected.some(item => tagKey(item) === key)
        ? selected.filter(item => tagKey(item) !== key)
        : [...selected, tag],
    })
  }

  /** Rows the filter contributes to the View options menu. */
  const filterItems = (): readonly WorkspaceViewFilterItem[] => {
    const state = store.getSnapshot()
    const vocabulary = vocabularyOf(state.assignments)
    if (vocabulary.length === 0) {
      return [
        { id: 'empty', label: t('filter.empty'), disabled: true, onSelect: () => {} },
        { id: 'emptyHint', label: t('filter.emptyHint'), disabled: true, onSelect: () => {} },
      ]
    }
    const rows: WorkspaceViewFilterItem[] = vocabulary.map(tag => ({
      id: `tag:${tagKey(tag)}`,
      label: tag,
      selected: state.selected.some(item => tagKey(item) === tagKey(tag)),
      onSelect: () => { toggleSelected(tag) },
    }))
    if (state.selected.length > 0) {
      rows.push({ id: 'clear', label: t('filter.clear'), onSelect: () => { update({ selected: [] }) } })
    }
    return rows
  }

  /** Whether one Workspace survives the active filter. */
  const matches = (workspace: WorkspaceView): boolean => {
    const state = store.getSnapshot()
    if (state.selected.length === 0) return true
    const assigned = state.assignments[workspace.workspaceId] ?? []
    return state.selected.some(tag => assigned.some(name => tagKey(name) === tagKey(tag)))
  }

  // The browser reads a filter's rows and predicate when it renders, and it
  // cannot observe this plugin's store. Every state change therefore
  // re-registers the filter — a fresh registration object is what tells the
  // browser to rebuild the menu and re-apply the predicate. The same path
  // refreshes the fixed heading on a language switch.
  const registerFilter = (): (() => void) => ctx.workspaceViewFilters.register({
    id: 'workspace-tags',
    label: t('filter.label'),
    order: 100,
    items: filterItems,
    matches,
  })
  ctx.effect(() => {
    let dispose = registerFilter()
    const republish = (): void => {
      dispose()
      dispose = registerFilter()
    }
    const stopStore = store.subscribe(republish)
    const stopLocale = ctx.on('locale/change', republish)
    return () => {
      stopLocale()
      stopStore()
      dispose()
    }
  }, 'workspace-tags: view filter')

  ctx.effect(() => ctx.contextMenus.register({
    id: 'workspace.tags.edit',
    target: 'workspace',
    order: 150,
    resolve: ({ workspaceId, displayTitle }) => [{
      id: 'workspace.tags.edit.item',
      label: t('action.edit'),
      run: () => { update({ editor: { workspaceId, displayTitle } }) },
    }],
  }), 'workspace-tags: workspace menu entry')

  ctx.slots.inject('sidebar.workspaces.workspace.row.trailing', () => ctx.slots.register({
    name: 'sidebar.workspaces.workspace.row.trailing',
    id: 'workspace-tags',
    order: 100,
    locale: NS,
    inject: (): TagsInjected => ({ hooks: { tags: store } }),
  }, WorkspaceTagChips))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'workspace-tags.editor',
    locale: NS,
    inject: (): TagEditorInjected => ({
      hooks: { tags: store },
      close: () => { update({ editor: null }) },
      save,
    }),
  }, TagEditorDialog))

  void refresh()
}
