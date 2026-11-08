/** `workspaceTags` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'workspaceTags'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'filter.label': '按标签筛选',
  'filter.empty': '暂无标签',
  'filter.emptyHint': '在工作区上右键，选择「设置标签…」',
  'filter.clear': '清除筛选',
  'filter.manage': '管理标签…',
  'action.edit': '设置标签…',
  'editor.title': '设置标签',
  'editor.close': '关闭',
  'editor.selected': '已选标签',
  'editor.none': '还没有标签',
  'editor.placeholder': '输入标签后回车',
  'editor.add': '添加',
  'editor.suggestions': '已有标签',
  'editor.save': '保存',
  'editor.cancel': '取消',
  'editor.limit': '每个工作区最多 {max} 个标签',
  'editor.invalid': '标签名需为 1–24 个字符',
  'editor.failed': '保存失败，请重试',
  'editor.remove': '移除标签 {name}',
  'manager.title': '管理标签',
  'manager.hint': '重命名或删除会立即应用到所有工作区',
  'manager.empty': '还没有任何标签',
  'manager.rename': '重命名',
  'manager.delete': '删除',
  'manager.confirm': '确认删除',
  'manager.cancel': '取消',
  'manager.duplicate': '已存在同名标签',
  'manager.count': '{count} 个工作区',
  'manager.failed': '保存失败，请重试',
  'chips.aria': '{name} 的标签',
} satisfies Record<string, string>

/** The namespace key union. */
export type WorkspaceTagsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'filter.label': 'Filter by tag',
  'filter.empty': 'No tags yet',
  'filter.emptyHint': 'Right-click a workspace to set tags',
  'filter.clear': 'Clear filter',
  'filter.manage': 'Manage tags…',
  'action.edit': 'Set tags…',
  'editor.title': 'Set tags',
  'editor.close': 'Close',
  'editor.selected': 'Selected tags',
  'editor.none': 'No tags yet',
  'editor.placeholder': 'Type a tag and press Enter',
  'editor.add': 'Add',
  'editor.suggestions': 'Existing tags',
  'editor.save': 'Save',
  'editor.cancel': 'Cancel',
  'editor.limit': 'A workspace holds at most {max} tags',
  'editor.invalid': 'A tag name needs 1–24 characters',
  'editor.failed': 'Saving failed, try again',
  'editor.remove': 'Remove tag {name}',
  'manager.title': 'Manage tags',
  'manager.hint': 'Renaming or deleting applies to every workspace immediately',
  'manager.empty': 'No tags yet',
  'manager.rename': 'Rename',
  'manager.delete': 'Delete',
  'manager.confirm': 'Delete it',
  'manager.cancel': 'Cancel',
  'manager.duplicate': 'A tag with that name already exists',
  'manager.count': '{count} workspaces',
  'manager.failed': 'Saving failed, try again',
  'chips.aria': 'Tags of {name}',
} satisfies Record<WorkspaceTagsKey, string>
