/**
 * Global tag manager: rename or delete one vocabulary entry across every
 * Workspace. Each action rewrites the whole assignment map through the Host
 * settings Remote, so a tag never survives in one Workspace only.
 */

import { useState } from 'react'
import { Button, Input, Modal, Pill } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { normalizeTagName, tagKey, vocabularyOf } from '../tags-settings.ts'
import { NS } from './locales.ts'
import type { TagManagerInjected } from './slots.ts'
import type { WorkspaceTagsState } from './state.ts'
import css from './TagManager.module.css'
import dialogCss from './dialog.module.css'

/** Full props of the tag manager overlay entry. */
export type TagManagerDialogProps =
  PropsRuntime<'shell.overlay'>
  & PropsLocale<typeof NS>
  & InjectFace<TagManagerInjected>

/**
 * Render the manager while it is open.
 * @param props.useTags - selector hook over the shared tag state.
 * @param props.close - dismiss the dialog.
 * @param props.save - persist the complete assignment map.
 * @param props.t - tag copy seat.
 * @returns the open dialog, or nothing.
 */
export function TagManagerDialog({ useTags, close, save, t }: TagManagerDialogProps) {
  const state = useTags(value => value)
  if (!state.manager) return null
  return <ManagerBody state={state} close={close} save={save} t={t} />
}

/** One dialog's editing state; it resets every time the dialog reopens. */
function ManagerBody({ state, close, save, t }: {
  state: WorkspaceTagsState
  close: () => void
  save: TagManagerInjected['save']
  t: TagManagerDialogProps['t']
}) {
  const vocabulary = vocabularyOf(state.assignments)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const rewrite = (next: Record<string, string[]>): void => {
    setSaving(true)
    setError(null)
    save(next).then(() => {
      setSaving(false)
      setEditing(null)
      setPendingDelete(null)
    }).catch(() => {
      setSaving(false)
      setError(t('manager.failed'))
    })
  }

  const rename = (current: string): void => {
    const normalized = normalizeTagName(draft)
    if (normalized === undefined) {
      setError(t('editor.invalid'))
      return
    }
    if (tagKey(normalized) !== tagKey(current) && vocabulary.some(tag => tagKey(tag) === tagKey(normalized))) {
      setError(t('manager.duplicate'))
      return
    }
    if (tagKey(normalized) === tagKey(current)) {
      setEditing(null)
      return
    }
    const next: Record<string, string[]> = {}
    for (const [workspaceId, tags] of Object.entries(state.assignments)) {
      const seen = new Set<string>()
      const names: string[] = []
      for (const tag of tags) {
        const candidate = tagKey(tag) === tagKey(current) ? normalized : tag
        const key = tagKey(candidate)
        if (seen.has(key)) continue
        seen.add(key)
        names.push(candidate)
      }
      if (names.length > 0) next[workspaceId] = names
    }
    rewrite(next)
  }

  const remove = (current: string): void => {
    const next: Record<string, string[]> = {}
    for (const [workspaceId, tags] of Object.entries(state.assignments)) {
      const names = tags.filter(tag => tagKey(tag) !== tagKey(current))
      if (names.length > 0) next[workspaceId] = names
    }
    rewrite(next)
  }

  const footer = <Button variant="ghost" onClick={close}>{t('editor.close')}</Button>

  return (
    <Modal
      open
      onClose={close}
      className={dialogCss.wide ?? ''}
      title={t('manager.title')}
      description={t('manager.hint')}
      closeLabel={t('editor.close')}
      footer={footer}
    >
      <div className={css.body}>
        {vocabulary.length === 0
          ? <span className={css.empty}>{t('manager.empty')}</span>
          : (
            <div className={css.list}>
              {vocabulary.map(tag => (
              <div key={tag} className={css.row}>
                {editing === tag
                  ? (
                    <>
                      <Input
                        className={css.renameInput ?? ''}
                        value={draft}
                        aria-label={t('manager.rename')}
                        onChange={(event) => { setDraft(event.target.value); setError(null) }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') { event.preventDefault(); rename(tag) }
                          if (event.key === 'Escape') { setEditing(null); setError(null) }
                        }}
                        data-modal-autofocus
                      />
                      <Button size="sm" variant="primary" disabled={saving} onClick={() => { rename(tag) }}>{t('editor.save')}</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(null); setError(null) }}>{t('manager.cancel')}</Button>
                    </>
                  )
                  : (
                    <>
                      <span className={css.tagCell}><Pill>{tag}</Pill></span>
                      <span className={css.count}>{t('manager.count', { count: countOf(state.assignments, tag) })}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setEditing(tag); setDraft(tag); setPendingDelete(null); setError(null) }}
                      >
                        {t('manager.rename')}
                      </Button>
                      {pendingDelete === tag
                        ? (
                          <>
                            <Button size="sm" variant="outline" disabled={saving} onClick={() => { remove(tag) }}>{t('manager.confirm')}</Button>
                            <Button size="sm" variant="ghost" onClick={() => { setPendingDelete(null) }}>{t('manager.cancel')}</Button>
                          </>
                        )
                        : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setPendingDelete(tag); setEditing(null); setError(null) }}
                          >
                            {t('manager.delete')}
                          </Button>
                        )}
                    </>
                  )}
              </div>
              ))}
            </div>
          )}
        {error !== null && <div className={css.error}>{error}</div>}
      </div>
    </Modal>
  )
}

/**
 * How many Workspaces reference one tag.
 * @param assignments - current assignment map.
 * @param tag - tag to count.
 * @returns the referencing Workspace count.
 */
function countOf(assignments: WorkspaceTagsState['assignments'], tag: string): number {
  let count = 0
  for (const tags of Object.values(assignments)) {
    if (tags.some(name => tagKey(name) === tagKey(tag))) count += 1
  }
  return count
}
