// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { WorkspaceViewFilters, type WorkspaceViewFilter } from '../src/client/contract/filters.ts'

/** One filter with a fixed label and no rows. */
function filter(id: string, order?: number): WorkspaceViewFilter {
  return { id, label: id, ...(order === undefined ? {} : { order }), items: () => [], matches: () => true }
}

/** A service registered on a fresh client context. */
function mount(): WorkspaceViewFilters {
  const ctx = new Context()
  return new WorkspaceViewFilters(ctx)
}

describe('WorkspaceViewFilters', () => {
  it('orders registrations by order then id and withdraws only its own row', () => {
    const service = mount()
    const disposeB = service.register(filter('b', 200))
    const disposeA = service.register(filter('a', 100))
    const disposeB2 = service.register(filter('b2', 200))

    expect(service.source.getSnapshot().map(row => row.id)).toEqual(['a', 'b', 'b2'])

    disposeB()
    expect(service.source.getSnapshot().map(row => row.id)).toEqual(['a', 'b2'])

    disposeA()
    disposeB2()
    expect(service.source.getSnapshot()).toEqual([])
  })

  it('publishes a new snapshot only when the registration set changes', () => {
    const service = mount()
    const before = service.source.getSnapshot()
    const dispose = service.register(filter('only'))
    const after = service.source.getSnapshot()
    expect(after).not.toBe(before)
    expect(after).toHaveLength(1)
    dispose()
    expect(service.source.getSnapshot()).toEqual([])
  })

  it('rejects a duplicate id without touching the registered set', () => {
    const service = mount()
    service.register(filter('dup'))
    expect(() => service.register(filter('dup'))).toThrow('duplicate filter id dup')
    expect(service.source.getSnapshot().map(row => row.id)).toEqual(['dup'])
  })
})
