// @vitest-environment jsdom
/**
 * Component behaviour for the three tag surfaces: the row capsules, the
 * Workspace editor, and the global manager. Props are the derived shares a
 * real composition hands these entries; the injected tag state is a fixed
 * snapshot and the Host write is a spy.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import {
  allowAllAccess, contextMenuHook, makeTranslate,
} from '@deepseek-ai/dsh-client-test-runtime'
import { zh } from '../src/client/locales.ts'
import { EMPTY_TAGS_STATE, type WorkspaceTagsState } from '../src/client/state.ts'
import { TagEditorDialog } from '../src/client/TagEditor.tsx'
import { TagManagerDialog } from '../src/client/TagManager.tsx'
import { WorkspaceTagChips } from '../src/client/WorkspaceTagChips.tsx'

afterEach(cleanup)

/** The plugin's locale seat, resolving through its own dictionary. */
const t = makeTranslate(zh)

/** Selector hook over one fixed snapshot, as the renderer binds an injected source. */
function hook<T>(snapshot: T) {
  return function select<S>(selector: (state: T) => S): S { return selector(snapshot) }
}

/** Global standard seats these root-scope entries receive; only the API-access ones matter here. */
const standard: GlobalStandardProps = {
  ...allowAllAccess,
  useContextMenu: contextMenuHook(),
  usePanelInfo: select => select({ activePanelId: null }),
  useSessions: select => select({ ids: [], byId: {}, phase: 'ready', projectionsBySession: {} }),
  useSessionStatus: select => select(new Map()),
  useSessionRetainInfo: () => undefined,
  useWorkspaces: select => select({
    items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  }),
  useResource: () => ({ status: 'none', value: undefined, failure: undefined, reload: () => {} }),
} as GlobalStandardProps

/** State snapshot carrying one tagged Workspace. */
function tagsState(patch: Partial<WorkspaceTagsState> = {}): WorkspaceTagsState {
  return { ...EMPTY_TAGS_STATE, ...patch }
}

const wid = (id: string) => id as WorkspaceId

/** Render the row capsules for one Workspace owner share. */
function showChips(state: WorkspaceTagsState, workspaceId = 'w1', displayTitle = 'demo') {
  return render(
    <WorkspaceTagChips
      workspaceId={wid(workspaceId)} displayTitle={displayTitle}
      t={t} useTags={hook(state)} {...standard}
    />,
  )
}

type EditorProps = ComponentProps<typeof TagEditorDialog>
type ManagerProps = ComponentProps<typeof TagManagerDialog>

/** Render the editor over a fixed state and a Host save spy. */
function showEditor(state: WorkspaceTagsState, save: EditorProps['save']) {
  const close = vi.fn()
  render(<TagEditorDialog t={t} useTags={hook(state)} close={close} save={save} {...standard} />)
  return { close }
}

/** Render the manager over a fixed state and a Host save spy. */
function showManager(state: WorkspaceTagsState, save: ManagerProps['save']) {
  const close = vi.fn()
  render(<TagManagerDialog t={t} useTags={hook(state)} close={close} save={save} {...standard} />)
  return { close }
}

describe('WorkspaceTagChips', () => {
  it('renders nothing for an untagged Workspace', () => {
    const view = showChips(tagsState())
    expect(view.container.textContent).toBe('')
  })

  it('shows at most two capsules plus the folded remainder', () => {
    showChips(tagsState({ assignments: { w1: ['前端', '研究', '工具'] } }))
    expect(screen.getByText('前端')).toBeTruthy()
    expect(screen.getByText('研究')).toBeTruthy()
    expect(screen.queryByText('工具')).toBeNull()
    expect(screen.getByText('+1')).toBeTruthy()
  })

  it('highlights only the tags the active filter selected', () => {
    showChips(tagsState({ assignments: { w1: ['前端', '研究'] }, selected: ['前端'] }))
    expect(screen.getByText('前端').getAttribute('data-tone')).toBe('info')
    expect(screen.getByText('研究').getAttribute('data-tone')).toBe('neutral')
  })

  it('exposes the tags through the row seat', () => {
    showChips(tagsState({ assignments: { w1: ['前端'] } }), 'w1', 'My project')
    expect(screen.getByLabelText('My project 的标签')).toBeTruthy()
  })
})

describe('TagEditorDialog', () => {
  it('renders nothing without an open request', () => {
    const view = showEditor(tagsState(), vi.fn(async () => {}))
    expect(view.close).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('lists the draft, existing suggestions, and saves through the Host', async () => {
    const save = vi.fn(async () => {})
    const { close } = showEditor(tagsState({
      assignments: { w1: ['研究'], w2: ['工具'] },
      editor: { workspaceId: 'w1', displayTitle: 'demo' },
    }), save)
    expect(screen.getByRole('dialog', { name: '设置标签' })).toBeTruthy()
    expect(screen.getByLabelText('移除标签 研究')).toBeTruthy()
    expect(screen.getByText('工具')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByText('保存')) })
    expect(save).toHaveBeenCalledWith('w1', ['研究'])
    expect(close).toHaveBeenCalledOnce()
  })

  it('adds a typed tag on Enter, rejecting invalid and duplicate names', () => {
    showEditor(tagsState({ editor: { workspaceId: 'w1', displayTitle: 'demo' } }), vi.fn(async () => {}))
    const input = screen.getByLabelText<HTMLInputElement>('输入标签后回车')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('标签名需为 1–24 个字符')).toBeTruthy()

    fireEvent.change(input, { target: { value: '前端' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByLabelText('移除标签 前端')).toBeTruthy()

    fireEvent.change(input, { target: { value: '前端' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getAllByLabelText('移除标签 前端')).toHaveLength(1)
  })

  it('keeps a pending IME composition from adding a tag', () => {
    showEditor(tagsState({ editor: { workspaceId: 'w1', displayTitle: 'demo' } }), vi.fn(async () => {}))
    const input = screen.getByLabelText<HTMLInputElement>('输入标签后回车')
    fireEvent.change(input, { target: { value: '前端' } })
    fireEvent.compositionStart(input)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.queryByLabelText('移除标签 前端')).toBeNull()
    fireEvent.compositionEnd(input)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByLabelText('移除标签 前端')).toBeTruthy()
  })

  it('disables adding once the Workspace holds the limit', () => {
    const ten = Array.from({ length: 10 }, (_, index) => `tag${index}`)
    showEditor(tagsState({
      assignments: { w1: ten },
      editor: { workspaceId: 'w1', displayTitle: 'demo' },
    }), vi.fn(async () => {}))
    expect(screen.getByText('添加').closest('button')?.disabled).toBe(true)
  })

  it('reports a Host refusal and keeps the request open', async () => {
    const save = vi.fn(async () => { throw new Error('refused') })
    const { close } = showEditor(tagsState({
      assignments: { w1: ['研究'] },
      editor: { workspaceId: 'w1', displayTitle: 'demo' },
    }), save)
    await act(async () => { fireEvent.click(screen.getByText('保存')) })
    expect(screen.getByText('保存失败，请重试')).toBeTruthy()
    expect(close).not.toHaveBeenCalled()
  })

  it('removes a selected tag and cancels without writing', () => {
    const save = vi.fn(async () => {})
    const { close } = showEditor(tagsState({
      assignments: { w1: ['研究'] },
      editor: { workspaceId: 'w1', displayTitle: 'demo' },
    }), save)
    fireEvent.click(screen.getByLabelText('移除标签 研究'))
    expect(screen.getByText('还没有标签')).toBeTruthy()
    fireEvent.click(screen.getByText('取消'))
    expect(close).toHaveBeenCalledOnce()
    expect(save).not.toHaveBeenCalled()
  })
})

describe('TagManagerDialog', () => {
  const assignments = { w1: ['前端', '研究'], w2: ['前端'] }

  it('renders nothing while closed', () => {
    showManager(tagsState({ assignments }), vi.fn(async () => {}))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('lists every tag with its Workspace count', () => {
    showManager(tagsState({ assignments, manager: true }), vi.fn(async () => {}))
    expect(screen.getByRole('dialog', { name: '管理标签' })).toBeTruthy()
    expect(screen.getByText('2 个工作区')).toBeTruthy()
    expect(screen.getByText('1 个工作区')).toBeTruthy()
  })

  it('renames a tag across every Workspace that references it', async () => {
    const save = vi.fn(async () => {})
    showManager(tagsState({ assignments, manager: true }), save)
    fireEvent.click(screen.getAllByText('重命名')[0]!)
    const input = screen.getByLabelText<HTMLInputElement>('重命名')
    fireEvent.change(input, { target: { value: '前端工程' } })
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }) })
    expect(save).toHaveBeenCalledWith({ w1: ['前端工程', '研究'], w2: ['前端工程'] })
  })

  it('refuses a duplicate name without writing', () => {
    const save = vi.fn(async () => {})
    showManager(tagsState({ assignments, manager: true }), save)
    fireEvent.click(screen.getAllByText('重命名')[0]!)
    const input = screen.getByLabelText<HTMLInputElement>('重命名')
    fireEvent.change(input, { target: { value: '研究' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('已存在同名标签')).toBeTruthy()
    expect(save).not.toHaveBeenCalled()
  })

  it('deletes a tag after the inline confirmation', async () => {
    const save = vi.fn(async () => {})
    showManager(tagsState({ assignments, manager: true }), save)
    fireEvent.click(screen.getAllByText('删除')[0]!)
    await act(async () => { fireEvent.click(screen.getByText('确认删除')) })
    expect(save).toHaveBeenCalledWith({ w1: ['研究'] })
  })

  it('cancels a pending delete and closes the manager', () => {
    const save = vi.fn(async () => {})
    const { close } = showManager(tagsState({ assignments, manager: true }), save)
    fireEvent.click(screen.getAllByText('删除')[0]!)
    fireEvent.click(screen.getByText('取消'))
    expect(save).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('关闭'))
    expect(close).toHaveBeenCalledOnce()
  })

  it('reports a Host refusal on rename', async () => {
    const save = vi.fn(async () => { throw new Error('refused') })
    showManager(tagsState({ assignments, manager: true }), save)
    fireEvent.click(screen.getAllByText('重命名')[0]!)
    const input = screen.getByLabelText<HTMLInputElement>('重命名')
    fireEvent.change(input, { target: { value: '前端工程' } })
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }) })
    expect(screen.getByText('保存失败，请重试')).toBeTruthy()
  })

  it('shows the empty state without a vocabulary', () => {
    showManager(tagsState({ manager: true }), vi.fn(async () => {}))
    expect(screen.getByText('还没有任何标签')).toBeTruthy()
  })
})

describe('TagEditorDialog limits and entry points', () => {
  it('reports the per-Workspace limit when adding an eleventh tag', () => {
    const ten = Array.from({ length: 10 }, (_, index) => `tag${index}`)
    showEditor(tagsState({ assignments: { w1: ten }, editor: { workspaceId: 'w1', displayTitle: 'demo' } }), vi.fn(async () => {}))
    const input = screen.getByLabelText<HTMLInputElement>('输入标签后回车')
    fireEvent.change(input, { target: { value: '第十一个' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('每个工作区最多 10 个标签')).toBeTruthy()
  })

  it('reports the global limit when a new tag would exceed it', () => {
    const fifty = Array.from({ length: 50 }, (_, index) => `tag${index}`)
    showEditor(tagsState({
      assignments: { other: fifty },
      editor: { workspaceId: 'w1', displayTitle: 'demo' },
    }), vi.fn(async () => {}))
    const input = screen.getByLabelText<HTMLInputElement>('输入标签后回车')
    fireEvent.change(input, { target: { value: '新标签' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('每个工作区最多 50 个标签')).toBeTruthy()
  })

  it('adds through the Add button and the suggestion capsules', () => {
    showEditor(tagsState({
      assignments: { w2: ['工具'] },
      editor: { workspaceId: 'w1', displayTitle: 'demo' },
    }), vi.fn(async () => {}))
    const input = screen.getByLabelText<HTMLInputElement>('输入标签后回车')
    fireEvent.change(input, { target: { value: '前端' } })
    fireEvent.click(screen.getByText('添加'))
    expect(screen.getByLabelText('移除标签 前端')).toBeTruthy()
    fireEvent.click(screen.getByText('工具'))
    expect(screen.getByLabelText('移除标签 工具')).toBeTruthy()
  })

  it('ignores a second save while the first is in flight', async () => {
    const pending = Promise.withResolvers<undefined>()
    const save = vi.fn(() => pending.promise)
    showEditor(tagsState({ editor: { workspaceId: 'w1', displayTitle: 'demo' } }), save)
    fireEvent.click(screen.getByText('保存'))
    await act(async () => {})
    fireEvent.click(screen.getByText('保存'))
    expect(save).toHaveBeenCalledOnce()
    await act(async () => { pending.resolve(undefined) })
  })
})

describe('TagManagerDialog editing entry points', () => {
  const assignments = { w1: ['前端', '研究'], w2: ['前端'] }

  it('reports an invalid and an unchanged rename without writing', () => {
    const save = vi.fn(async () => {})
    showManager(tagsState({ assignments, manager: true }), save)
    fireEvent.click(screen.getAllByText('重命名')[0]!)
    const input = screen.getByLabelText<HTMLInputElement>('重命名')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('标签名需为 1–24 个字符')).toBeTruthy()

    fireEvent.change(input, { target: { value: '前端' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(save).not.toHaveBeenCalled()
    // The editor closed: the rename button is back.
    expect(screen.queryByLabelText('重命名')).toBeNull()
  })

  it('collapses duplicate references a hand-edited map may hold', async () => {
    const save = vi.fn(async () => {})
    showManager(tagsState({
      // A hand-edited document can repeat a name inside one Workspace; the
      // rename path rewrites every reference and de-duplicates the result.
      assignments: { w1: ['前端', '前端'] },
      manager: true,
    }), save)
    fireEvent.click(screen.getAllByText('重命名')[0]!)
    const input = screen.getByLabelText<HTMLInputElement>('重命名')
    fireEvent.change(input, { target: { value: '前端工程' } })
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }) })
    expect(save).toHaveBeenCalledWith({ w1: ['前端工程'] })
  })

  it('cancels rename editing with Escape and the Cancel button', () => {
    const save = vi.fn(async () => {})
    showManager(tagsState({ assignments, manager: true }), save)
    fireEvent.click(screen.getAllByText('重命名')[0]!)
    const input = screen.getByLabelText<HTMLInputElement>('重命名')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByLabelText('重命名')).toBeNull()

    fireEvent.click(screen.getAllByText('重命名')[0]!)
    fireEvent.click(screen.getByText('取消'))
    expect(screen.queryByLabelText('重命名')).toBeNull()
    expect(save).not.toHaveBeenCalled()
  })

  it('renames through the inline Save button', async () => {
    const save = vi.fn(async () => {})
    showManager(tagsState({ assignments, manager: true }), save)
    fireEvent.click(screen.getAllByText('重命名')[0]!)
    const input = screen.getByLabelText<HTMLInputElement>('重命名')
    fireEvent.change(input, { target: { value: '前端工程' } })
    await act(async () => { fireEvent.click(screen.getByText('保存')) })
    expect(save).toHaveBeenCalledWith({ w1: ['前端工程', '研究'], w2: ['前端工程'] })
  })
})
