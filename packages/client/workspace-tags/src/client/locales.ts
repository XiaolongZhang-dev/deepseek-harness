/** `workspaceTags` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'workspaceTags'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'filter.label': '按标签筛选',
  'filter.empty': '暂无标签',
  'filter.emptyHint': '在工作区上右键，选择「设置标签…」',
  'filter.clear': '清除筛选',
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
  'chips.aria': '{name} 的标签',
  'chips.more': '还有 {count} 个标签',
} satisfies Record<string, string>

/** The namespace key union. */
export type WorkspaceTagsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'filter.label': 'Filter by tag',
  'filter.empty': 'No tags yet',
  'filter.emptyHint': 'Right-click a workspace to set tags',
  'filter.clear': 'Clear filter',
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
  'chips.aria': 'Tags of {name}',
  'chips.more': '{count} more tags',
} satisfies Record<WorkspaceTagsKey, string>
