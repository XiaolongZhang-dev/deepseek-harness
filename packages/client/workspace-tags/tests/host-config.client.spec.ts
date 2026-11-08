import { describe, expect, it } from 'vitest'
import { Config } from '../src/index.ts'

/**
 * Regression: the settings layer only accepts writes to volatile fields, so
 * the Host config must keep `assignments` volatile or every tag save fails in
 * the browser with a generic "save failed" notice.
 */
describe('workspace-tags host config', () => {
  it('marks the assignment map volatile so the settings layer accepts writes', () => {
    const field = Config.dict?.assignments
    expect(field).toBeDefined()
    expect(field?.meta.volatile).toBe(true)
    expect(field?.type).toBe('dict')
  })
})
