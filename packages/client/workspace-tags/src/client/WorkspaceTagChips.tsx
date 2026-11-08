/**
 * Workspace row tag decoration: the tags one Workspace carries, at most two
 * capsules with a `+N` remainder, hit-highlighted against the active filter.
 * The seat is declared by ui-workspace; this component only renders the
 * Workspace owner share it was handed.
 */

import { Tag, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { tagKey } from '../tags-settings.ts'
import { NS } from './locales.ts'
import type { TagsInjected } from './slots.ts'
import css from './WorkspaceTagChips.module.css'

/** Capsules one row shows before folding the rest into `+N`. */
const SHOWN_TAG_LIMIT = 2

/** Full props of one Workspace row's tag decoration. */
export type WorkspaceTagChipsProps =
  PropsRuntime<'sidebar.workspaces.workspace.row.trailing'>
  & PropsLocale<typeof NS>
  & InjectFace<TagsInjected>

/**
 * Render the row's tags while the Workspace carries any.
 * @param props.workspaceId - Workspace this row shows.
 * @param props.displayTitle - localized title the row shows.
 * @param props.useTags - selector hook over the shared tag state.
 * @param props.t - tag copy seat.
 * @returns the capsules, or nothing while the Workspace has no tags.
 */
export function WorkspaceTagChips({ workspaceId, displayTitle, useTags, t }: WorkspaceTagChipsProps) {
  const state = useTags(value => value)
  const tags = state.assignments[workspaceId]
  if (tags === undefined || tags.length === 0) return null
  const shown = tags.slice(0, SHOWN_TAG_LIMIT)
  const hidden = tags.length - shown.length
  const isHit = (tag: string): boolean => state.selected.some(item => tagKey(item) === tagKey(tag))
  return (
    <Tooltip label={t('chips.aria', { name: displayTitle })} side="top" delayMs={500} portal>
      <span className={css.row}>
        {shown.map(tag => <Tag key={tag} tone={isHit(tag) ? 'info' : 'neutral'}>{tag}</Tag>)}
        {hidden > 0 && <span className={css.more}>{`+${hidden}`}</span>}
      </span>
    </Tooltip>
  )
}
