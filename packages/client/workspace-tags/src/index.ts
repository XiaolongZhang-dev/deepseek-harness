/**
 * Host configuration owner for Workspace tags: the durable assignment map the
 * browser half reads and writes through the generic settings Remote. The plugin
 * has no Host service of its own — the settings document is the store.
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from './tags-settings.ts'

/** Durable assignment map: Workspace id -> attached tag names. */
export interface Config {
  assignments: Record<string, string[]>
}

/**
 * Settings schema inferred into the profile's user document. The field is
 * volatile: settings only accept writes to volatile fields, and this map is
 * user data written from the Workspace UI rather than deployment config.
 */
export const Config = z.object({
  assignments: z.dict(z.array(z.string())).default({}).volatile(),
})

/** The settings surface this plugin uses; declared structurally so the package stays one client project. */
interface SettingsFormsLike {
  configure(policy: { readonly auto: boolean }, fiber: unknown): void
}

/**
 * Suppress the generated settings page: tags are edited from the Workspace UI,
 * and the raw assignment map is not a form.
 * @param ctx - Host plugin context.
 */
export function apply(ctx: Context): void {
  const settings = ctx.get('settings') as SettingsFormsLike | undefined
  settings?.configure({ auto: false }, ctx.fiber)
}
