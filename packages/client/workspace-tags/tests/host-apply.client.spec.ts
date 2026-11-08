import { describe, expect, it, vi } from 'vitest'
import { apply } from '../src/index.ts'

/** Fake Host context with the optional settings service. */
function hostContext(settings: { configure: (policy: { auto: boolean }, fiber: unknown) => void } | undefined) {
  const fiber = { id: 'workspace-tags' }
  return { ctx: { get: (name: string) => name === 'settings' ? settings : undefined, fiber } as never, fiber }
}

describe('workspace-tags host apply', () => {
  it('suppresses the generated settings page when the service is available', () => {
    const settings = { configure: vi.fn() }
    const { ctx, fiber } = hostContext(settings)
    apply(ctx)
    expect(settings.configure).toHaveBeenCalledWith({ auto: false }, fiber)
  })

  it('loads before the optional settings service exists', () => {
    const { ctx } = hostContext(undefined)
    expect(() => { apply(ctx) }).not.toThrow()
  })
})
