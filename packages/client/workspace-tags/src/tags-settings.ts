/**
 * Workspace tag contract shared by the Host configuration schema and the
 * browser half: the settings namespace identity, the limits, and the pure
 * validation helpers both faces apply.
 *
 * Tags are one global vocabulary: a Workspace stores the tag names it
 * references, and the vocabulary is their first-seen union, so a tag nobody
 * references disappears from every surface without a second store to clean.
 */

/** Profile entry id whose configuration document carries the assignment map. */
export const WORKSPACE_TAGS_NAMESPACE = 'workspace-tags'

/** Longest accepted tag name, counted in Unicode code points after trimming. */
export const TAG_NAME_MAX_LENGTH = 24

/** Tags one Workspace may carry. */
export const TAGS_PER_WORKSPACE_MAX = 10

/** Tags the whole vocabulary may carry. */
export const TAGS_TOTAL_MAX = 50

/** Workspace id -> attached tag names, in display order. */
export type WorkspaceTagAssignments = Record<string, readonly string[]>

/** Control characters are invisible in row and dialog copy, so names reject them. */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u

/**
 * Normalize a user-entered tag name.
 * @param raw - editor input.
 * @returns the trimmed name, or undefined for an empty, over-long, or control-character name.
 */
export function normalizeTagName(raw: string): string | undefined {
  const trimmed = raw.trim()
  if ([...trimmed].length === 0 || [...trimmed].length > TAG_NAME_MAX_LENGTH) return undefined
  if (CONTROL_CHARACTERS.test(trimmed)) return undefined
  return trimmed
}

/**
 * Deduplication key: tag names compare case-insensitively.
 * @param name - displayed tag name.
 * @returns the comparison key.
 */
export function tagKey(name: string): string {
  return name.toLocaleLowerCase()
}

/**
 * The vocabulary in first-seen order across every Workspace.
 * @param assignments - durable assignment map.
 * @returns unique tag names.
 */
export function vocabularyOf(assignments: WorkspaceTagAssignments): string[] {
  const seen = new Map<string, string>()
  for (const tags of Object.values(assignments)) {
    for (const tag of tags) {
      const key = tagKey(tag)
      if (!seen.has(key)) seen.set(key, tag)
    }
  }
  return [...seen.values()]
}

/**
 * Drop assignments whose Workspace no longer exists.
 * @param assignments - durable assignment map.
 * @param known - Workspace ids the registry currently holds.
 * @returns a pruned copy, preserving each surviving tag list's order.
 */
export function pruneAssignments(
  assignments: WorkspaceTagAssignments,
  known: ReadonlySet<string>,
): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  for (const [workspaceId, tags] of Object.entries(assignments)) {
    if (known.has(workspaceId)) result[workspaceId] = [...tags]
  }
  return result
}

/**
 * Read one stored settings value, dropping malformed entries.
 * @param value - raw settings value for this namespace.
 * @returns a well-formed assignment map.
 */
export function readAssignments(value: unknown): Record<string, string[]> {
  if (typeof value !== 'object' || value === null) return {}
  const source = (value as { assignments?: unknown }).assignments
  if (typeof source !== 'object' || source === null) return {}
  const result: Record<string, string[]> = {}
  for (const [workspaceId, tags] of Object.entries(source as Record<string, unknown>)) {
    if (!Array.isArray(tags)) continue
    const names: string[] = []
    for (const tag of tags) {
      if (typeof tag !== 'string') continue
      const normalized = normalizeTagName(tag)
      if (normalized !== undefined) names.push(normalized)
    }
    if (names.length > 0) result[workspaceId] = names
  }
  return result
}
