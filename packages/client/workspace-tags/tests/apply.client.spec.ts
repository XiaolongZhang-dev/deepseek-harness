// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { WorkspaceViewFilters } from '@deepseek-ai/dsh-client-ui-workspace/src/client/contract/filters.ts'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import type { TagEditorInjected } from '../src/client/slots.ts'
import { WORKSPACE_TAGS_NAMESPACE } from '../src/tags-settings.ts'

/** Let the plugin's Host read and every queued subscription settle. */
const settled = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0) })

/** How the settings double answers one namespace read or write. */
type SettingsMode = 'ok' | 'reject' | 'failure' | 'missing'

/** A settings Remote double that keeps the assignment map and its revision. */
function fakeSettings(options: { describe?: SettingsMode; mutate?: SettingsMode } = {}) {
  const state = { assignments: {} as Record<string, string[]>, revision: 1 }
  const describe = vi.fn(async (): Promise<unknown> => {
    if (options.describe === 'reject') throw new Error('offline')
    if (options.describe === 'failure') return { ok: false as const, error: { message: 'denied' } }
    if (options.describe === 'missing') {
      return { ok: true as const, value: { writable: true, hasDocument: true, namespaces: [] } }
    }
    return {
      ok: true as const,
      value: {
        writable: true,
        hasDocument: true,
        namespaces: [{
          ns: WORKSPACE_TAGS_NAMESPACE,
          autoGenerate: false,
          schema: {},
          value: { assignments: state.assignments },
          revision: state.revision,
          applies: 'live' as const,
        }],
      },
    }
  })
  const mutate = vi.fn(async (
    _ns: string,
    ops: readonly { op: 'set' | 'unset'; path: string[]; value?: unknown }[],
  ) => {
    if (options.mutate === 'reject') throw new Error('offline')
    if (options.mutate === 'failure') return { ok: false as const, error: { message: 'denied' } }
    for (const op of ops) {
      if (op.op !== 'set' || op.path.length !== 1 || op.path[0] !== 'assignments') continue
      state.assignments = { ...(op.value as Record<string, string[]>) }
    }
    state.revision += 1
    return { ok: true as const, value: {} }
  })
  return { state, describe, mutate }
}

/** Boot the browser half against real slot/locale/filter services and a fake settings Remote. */
async function mount(options: {
  settings?: Parameters<typeof fakeSettings>[0]
  workspacePhase?: 'ready' | 'loading'
} = {}) {
  const ctx = new Context()
  onTestFinished(() => { void ctx.fiber.dispose() })
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const settings = fakeSettings(options.settings)
  ctx.provide('remote', { settings } as never)
  ctx.provide('remote.settings', settings as never)
  const menus: { id: string; resolve: (target: unknown) => readonly { id: string; label: string; run: () => void }[] }[] = []
  ctx.provide('contextMenus', {
    register: (definition: (typeof menus)[number]) => {
      menus.push(definition)
      return () => {}
    },
    resolve: vi.fn(),
    active: { getSnapshot: () => null, subscribe: () => () => {} },
    open: vi.fn(),
    close: vi.fn(),
  } as never)
  // A ready registry holding the Workspaces this test tags.
  const known = { ids: ['w1', 'w2'] as string[] }
  ctx.provide('workspaces', {
    list: {
      getSnapshot: () => ({
        items: known.ids.map(id => ({ workspaceId: id })),
        archivedSessionIds: [],
        pinnedSessionIds: [],
        state: 'idle',
        phase: options.workspacePhase ?? ('ready' as const),
        error: null,
      }),
      subscribe: () => () => {},
    },
  } as never)
  const filters = new WorkspaceViewFilters(ctx)
  // The two seats this plugin fills, declared by ui-workspace and the shell in
  // a real composition; a root registration declares them for this test.
  ctx.slots.register({
    name: 'root',
    children: {
      'shell.overlay': { kind: 'list', scope: 'root' },
      'sidebar.workspaces.workspace.row.trailing': { kind: 'list', scope: 'root', inline: true },
    },
  } as never, () => null)
  await ctx.plugin({ inject, apply }).await()
  return { ctx, filters, settings, known, menus }
}

/** The editor's injected face, the surface a save goes through. */
function editorFace(ctx: Context): TagEditorInjected {
  const entry = ctx.slots.entries('shell.overlay').find(candidate => candidate.options.id === 'workspace-tags.editor')
  if (entry === undefined || entry.inject === undefined) throw new Error('the tag editor is not registered')
  // StoredEntry erases the injected face's type; the registration above
  // declared it and the component consumes exactly this shape.
  return entry.inject() as never
}

describe('workspace-tags browser plugin', () => {
  it('re-registers the view filter whenever tag state changes', async () => {
    const b = await mount()
    await settled()
    expect(b.filters.source.getSnapshot()).toHaveLength(1)
    const initial = b.filters.source.getSnapshot()[0]!
    // No tags yet: the filter contributes only disabled empty-state rows.
    expect(initial.items()).toHaveLength(2)
    expect(initial.items().every(row => row.disabled === true)).toBe(true)

    await editorFace(b.ctx).save('w1', ['前端'])
    await settled()

    // Re-registration replaces the one filter: the list keeps its length but
    // publishes a new filter identity, which is what the browser reacts to.
    const latest = b.filters.source.getSnapshot()[0]!
    expect(latest).not.toBe(initial)
    const tagRow = latest.items().find(row => row.label === '前端')
    expect(tagRow).toBeDefined()
    expect(tagRow?.selected).toBe(false)
    // No tag selected yet: the ungrouped bucket keeps its native behavior.
    expect(latest.matchesUngrouped?.()).toBe(true)

    // Selecting publishes another identity; the newest predicate accepts only
    // the tagged Workspace.
    tagRow?.onSelect()
    await settled()
    const current = b.filters.source.getSnapshot()[0]!
    expect(current).not.toBe(latest)
    expect(current.items().find(row => row.label === '前端')?.selected).toBe(true)
    // A tag filter narrows to tagged Workspaces, which an ungrouped Session
    // can never be, so its bucket disappears while the filter is active.
    expect(current.matchesUngrouped?.()).toBe(false)
    expect(current.matches({
      workspaceId: 'w1', path: '/w1', title: 'w1', sessionIds: [], createdAt: '0', updatedAt: '0',
    } as never)).toBe(true)
    expect(current.matches({
      workspaceId: 'w2', path: '/w2', title: 'w2', sessionIds: [], createdAt: '0', updatedAt: '0',
    } as never)).toBe(false)
  })

  it('rewrites the whole map through the global tag manager', async () => {
    const b = await mount()
    await settled()
    await editorFace(b.ctx).save('w1', ['前端'])
    await settled()
    const managerEntry = b.ctx.slots.entries('shell.overlay')
      .find(candidate => candidate.options.id === 'workspace-tags.manager')
    if (managerEntry === undefined || managerEntry.inject === undefined) throw new Error('the tag manager is not registered')
    const manager: { save: (assignments: Record<string, string[]>) => Promise<void> } = managerEntry.inject() as never
    await manager.save({ w1: ['frontend'], w2: ['frontend'] })
    await settled()
    expect(b.settings.state.assignments).toEqual({ w1: ['frontend'], w2: ['frontend'] })
    const latest = b.filters.source.getSnapshot()[0]!
    expect(latest.items().some(row => row.label === 'frontend')).toBe(true)
  })

  it('forgets tags of Workspaces the registry no longer holds', async () => {
    const b = await mount()
    await settled()
    await editorFace(b.ctx).save('w1', ['前端'])
    await settled()
    expect(b.filters.source.getSnapshot()[0]!.items().some(row => row.label === '前端')).toBe(true)

    // w1 disappears from the registry; the next write refreshes the mirror and
    // prunes its assignment instead of keeping an orphan tag.
    b.known.ids = ['w2']
    await editorFace(b.ctx).save('w2', ['后端'])
    await settled()
    const latest = b.filters.source.getSnapshot()[0]!
    expect(latest.items().some(row => row.label === '前端')).toBe(false)
    expect(latest.items().some(row => row.label === '后端')).toBe(true)
  })

  it('persists the assignment map through the settings Remote', async () => {
    const b = await mount()
    await settled()
    await editorFace(b.ctx).save('w1', ['前端', '研究'])
    expect(b.settings.state.assignments).toEqual({ w1: ['前端', '研究'] })
    expect(b.settings.mutate).toHaveBeenCalledWith(
      WORKSPACE_TAGS_NAMESPACE,
      [{ op: 'set', path: ['assignments'], value: { w1: ['前端', '研究'] } }],
      expect.any(Number),
    )
  })
})

describe('workspace-tags browser plugin edges', () => {
  it('keeps the filter usable when the namespace read fails', async () => {
    for (const mode of ['reject', 'failure'] as const) {
      const b = await mount({ settings: { describe: mode } })
      await settled()
      const filter = b.filters.source.getSnapshot()[0]!
      expect(filter.items()).toHaveLength(2)
      expect(filter.items().every(row => row.disabled === true)).toBe(true)
    }
  })

  it('rejects a save the Remote refuses or throws on', async () => {
    for (const mode of ['reject', 'failure'] as const) {
      const b = await mount({ settings: { mutate: mode } })
      await settled()
      await expect(editorFace(b.ctx).save('w1', ['前端'])).rejects.toBeTruthy()
    }
  })

  it('drops a Workspace tag list when the editor saves an empty list', async () => {
    const b = await mount()
    await settled()
    await editorFace(b.ctx).save('w1', ['前端'])
    await settled()
    await editorFace(b.ctx).save('w1', [])
    await settled()
    expect(b.settings.state.assignments).toEqual({})
    expect(b.filters.source.getSnapshot()[0]!.items().some(row => row.label === '前端')).toBe(false)
  })

  it('deselects a tag when its row is chosen twice and clears the filter', async () => {
    const b = await mount()
    await settled()
    await editorFace(b.ctx).save('w1', ['前端'])
    await settled()
    const rows = () => b.filters.source.getSnapshot()[0]!.items()
    rows().find(row => row.label === '前端')!.onSelect()
    await settled()
    expect(rows().find(row => row.label === '前端')?.selected).toBe(true)
    expect(rows().find(row => row.id === 'clear')).toBeDefined()
    rows().find(row => row.id === 'clear')!.onSelect()
    await settled()
    expect(rows().find(row => row.label === '前端')?.selected).toBe(false)
    rows().find(row => row.label === '前端')!.onSelect()
    await settled()
    rows().find(row => row.label === '前端')!.onSelect()
    await settled()
    expect(rows().find(row => row.label === '前端')?.selected).toBe(false)
  })

  it('opens the manager from its filter row and closes both overlays', async () => {
    const b = await mount()
    await settled()
    await editorFace(b.ctx).save('w1', ['前端'])
    await settled()
    b.filters.source.getSnapshot()[0]!.items().find(row => row.id === 'manage')!.onSelect()
    for (const id of ['workspace-tags.editor', 'workspace-tags.manager']) {
      const entry = b.ctx.slots.entries('shell.overlay').find(candidate => candidate.options.id === id)
      if (entry === undefined || entry.inject === undefined) throw new Error(`${id} is not registered`)
      const face: { close: () => void } = entry.inject() as never
      face.close()
    }
  })

  it('opens the editor from the Workspace context menu', async () => {
    const b = await mount()
    await settled()
    const menu = b.menus.find(definition => definition.id === 'workspace.tags.edit')
    if (menu === undefined) throw new Error('the workspace menu entry is not registered')
    const actions = menu.resolve({ workspaceId: 'w2', path: '/w2', displayTitle: 'w2' })
    expect(actions).toHaveLength(1)
    const [action] = actions
    if (action === undefined) throw new Error('expected one menu action')
    expect(action.label).toBe('Set tags…')
    action.run()
  })

  it('contributes inert empty-state rows and the row decoration seat', async () => {
    const b = await mount()
    await settled()
    // Empty-state rows carry no action; selecting them changes nothing.
    const emptyRows = b.filters.source.getSnapshot()[0]!.items()
    for (const row of emptyRows) row.onSelect()
    expect(b.filters.source.getSnapshot()[0]!.items()).toHaveLength(2)

    // With nothing selected every Workspace survives the predicate.
    expect(b.filters.source.getSnapshot()[0]!.matches({
      workspaceId: 'w1', path: '/w1', title: 'w1', sessionIds: [], createdAt: '0', updatedAt: '0',
    } as never)).toBe(true)

    // The row decoration entry resolves its injected hook face.
    const row = b.ctx.slots.entries('sidebar.workspaces.workspace.row.trailing')
      .find(candidate => candidate.options.id === 'workspace-tags')
    if (row === undefined || row.inject === undefined) throw new Error('the row decoration is not registered')
    expect(row.inject()).toBeDefined()
  })

  it('starts empty when the profile has no tag namespace yet', async () => {
    const b = await mount({ settings: { describe: 'missing' } })
    await settled()
    const filter = b.filters.source.getSnapshot()[0]!
    expect(filter.items()).toHaveLength(2)
    expect(filter.items().every(row => row.disabled === true)).toBe(true)
  })

  it('re-registers the filter on a locale change', async () => {
    const b = await mount()
    await settled()
    const before = b.filters.source.getSnapshot()[0]!
    b.ctx.emit('locale/change', {} as never)
    expect(b.filters.source.getSnapshot()[0]).not.toBe(before)
  })

  it('keeps stored assignments while the Workspace registry is not authoritative', async () => {
    const b = await mount({ workspacePhase: 'loading' })
    await settled()
    await editorFace(b.ctx).save('w-unknown', ['前端'])
    await settled()
    expect(b.settings.state.assignments).toEqual({ 'w-unknown': ['前端'] })
  })
})
