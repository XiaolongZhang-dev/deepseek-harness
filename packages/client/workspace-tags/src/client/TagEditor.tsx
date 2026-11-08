/**
 * Workspace tag editor: the `shell.overlay` dialog opened from the Workspace
 * context menu. One draft per Workspace; adding normalizes and de-duplicates
 * case-insensitively, and the durable write goes through the generic settings
 * Remote.
 */

import { useRef, useState } from 'react'
import { Button, Input, Modal, Pill } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import {
  normalizeTagName, tagKey, TAGS_PER_WORKSPACE_MAX, TAGS_TOTAL_MAX, vocabularyOf,
} from '../tags-settings.ts'
import { NS } from './locales.ts'
import type { TagEditorInjected } from './slots.ts'
import type { TagEditorRequest, WorkspaceTagsState } from './state.ts'
import css from './TagEditor.module.css'

/** Full props of the tag editor overlay entry. */
export type TagEditorDialogProps =
  PropsRuntime<'shell.overlay'>
  & PropsLocale<typeof NS>
  & InjectFace<TagEditorInjected>

/**
 * Render the editor while a Workspace requested it.
 * @param props.useTags - selector hook over the shared tag state.
 * @param props.close - dismiss without writing.
 * @param props.save - persist one Workspace's tag list.
 * @param props.t - tag copy seat.
 * @returns the open dialog, or nothing.
 */
export function TagEditorDialog({ useTags, close, save, t }: TagEditorDialogProps) {
  const state = useTags(value => value)
  const request = state.editor
  if (request === null) return null
  return (
    <TagEditorForm key={request.workspaceId} request={request} state={state} close={close} save={save} t={t} />
  )
}

/** One request's dialog; the draft dies with the request key. */
function TagEditorForm({ request, state, close, save, t }: {
  request: TagEditorRequest
  state: WorkspaceTagsState
  close: () => void
  save: TagEditorInjected['save']
  t: TagEditorDialogProps['t']
}) {
  const [draft, setDraft] = useState<string[]>(() => [...(state.assignments[request.workspaceId] ?? [])])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const composingRef = useRef(false)
  const vocabulary = vocabularyOf(state.assignments)
  const suggestions = vocabulary.filter(tag => !draft.some(item => tagKey(item) === tagKey(tag)))
  const atLimit = draft.length >= TAGS_PER_WORKSPACE_MAX

  const add = (raw: string): void => {
    const normalized = normalizeTagName(raw)
    if (normalized === undefined) {
      setError(t('editor.invalid'))
      return
    }
    if (draft.some(tag => tagKey(tag) === tagKey(normalized))) {
      setInput('')
      return
    }
    if (draft.length >= TAGS_PER_WORKSPACE_MAX) {
      setError(t('editor.limit', { max: TAGS_PER_WORKSPACE_MAX }))
      return
    }
    if (vocabulary.some(tag => tagKey(tag) === tagKey(normalized)) && vocabulary.length >= TAGS_TOTAL_MAX
      && !draft.some(tag => tagKey(tag) === tagKey(normalized))) {
      setError(t('editor.limit', { max: TAGS_TOTAL_MAX }))
      return
    }
    setError(null)
    setDraft([...draft, normalized])
    setInput('')
  }

  const remove = (tag: string): void => {
    setError(null)
    setDraft(draft.filter(item => tagKey(item) !== tagKey(tag)))
  }

  const confirm = (): void => {
    if (saving) return
    setSaving(true)
    setError(null)
    save(request.workspaceId, draft).then(() => {
      setSaving(false)
      close()
    }).catch(() => {
      setSaving(false)
      setError(t('editor.failed'))
    })
  }

  const footer = (
    <>
      <Button variant="ghost" onClick={close}>{t('editor.cancel')}</Button>
      <Button variant="primary" onClick={confirm} disabled={saving} data-modal-autofocus>{t('editor.save')}</Button>
    </>
  )

  return (
    <Modal
      open
      onClose={close}
      title={t('editor.title')}
      description={request.displayTitle}
      closeLabel={t('editor.close')}
      footer={footer}
    >
      <div className={css.body}>
        <div className={css.label}>{t('editor.selected')}</div>
        <div className={css.chips}>
          {draft.length === 0
            ? <span className={css.empty}>{t('editor.none')}</span>
            : draft.map(tag => (
              <Pill key={tag} active aria-label={t('editor.remove', { name: tag })} onClick={() => { remove(tag) }}>
                {`${tag} ×`}
              </Pill>
            ))}
        </div>
        <div className={css.entry}>
          <Input
            value={input}
            placeholder={t('editor.placeholder')}
            aria-label={t('editor.placeholder')}
            onChange={(event) => { setInput(event.target.value); setError(null) }}
            onCompositionStart={() => { composingRef.current = true }}
            onCompositionEnd={() => { composingRef.current = false }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || composingRef.current) return
              event.preventDefault()
              add(input)
            }}
            data-modal-autofocus
          />
          <Button variant="outline" disabled={atLimit} onClick={() => { add(input) }}>{t('editor.add')}</Button>
        </div>
        {suggestions.length > 0 && (
          <>
            <div className={css.label}>{t('editor.suggestions')}</div>
            <div className={css.chips}>
              {suggestions.map(tag => (
                <Pill key={tag} onClick={() => { add(tag) }}>{tag}</Pill>
              ))}
            </div>
          </>
        )}
        <div className={error === null ? css.hint : css.error}>
          {error ?? t('editor.limit', { max: TAGS_PER_WORKSPACE_MAX })}
        </div>
      </div>
    </Modal>
  )
}
