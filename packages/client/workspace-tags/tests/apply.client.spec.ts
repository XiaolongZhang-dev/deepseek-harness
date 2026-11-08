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

/** A settings Remote double that keeps the assignment map and its revision. */
function fakeSettings() {
  const state = { assignments: {} as Record<string, string[]>, revision: 1 }
  const describe = vi.fn(async () => ({
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
  }))
  const mutate = vi.fn(async (
    _ns: string,
    ops: readonly { op: 'set' | 'unset'; path: string[]; value?: unknown }[],
  ) => {
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
async function mount() {
  const ctx = new Context()
  onTestFinished(() => { void ctx.fiber.dispose() })
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const settings = fakeSettings()
  ctx.provide('remote', { settings } as never)
  ctx.provide('remote.settings', settings as never)
  ctx.provide('contextMenus', {
    register: () => () => {},
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
        phase: 'ready' as const,
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
  return { ctx, filters, settings, known }
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
