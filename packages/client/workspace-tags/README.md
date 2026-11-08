# @deepseek-ai/dsh-client-workspace-tags

English | [中文](README.zh.md)

## Summary

Give Workspaces tags and narrow the Workspace list by them, entirely from the browser. A Workspace context-menu entry opens a tag editor, the Workspace row shows its tags, the Workspace browser's View options gains a "Filter by tag" group, and that group's "Manage tags…" row renames or deletes a tag across every Workspace. The tag vocabulary is one global list derived from the assignments; nothing else is stored, so a tag no Workspace references disappears.

## Use this package

Compose the plugin into a Web profile. The browser half registers three contributions against ui-workspace's generic seams (`workspaceViewFilters` and `sidebar.workspaces.workspace.row.trailing`), so the plugin never edits the Workspace browser itself.

```yaml
- id: workspace-tags
  name: '@deepseek-ai/dsh-client-workspace-tags'
```

The Host half declares the `assignments` configuration field: the durable Workspace id -> tag list map, read and written through the generic settings Remote. Its namespace is the profile row id (`workspace-tags`).

### Limits

| Rule | Value |
|---|---|
| Tag name | 1–24 characters after trimming, no control characters |
| Tags per Workspace | 10 |
| Tags overall | 50 |
| Deduplication | case-insensitive, first spelling kept |

A Workspace row shows at most two tags plus a `+N` remainder; hovering the capsules lists every tag. Assignments for Workspaces the registry no longer holds are pruned on the next read.

## Model Experience

This package adds no tools, prompts, request context, or session events; it is invisible to the model. Token, cost, and KV-cache effects: none.

## Known Limitations and Deferred Work

- Changes made by another window reach this mirror on the next read (plugin load or a local save); the settings document has no forwarded change event wired here.
- The row capsules and the two dialogs have no component-level tests yet; the plugin body, filter seam and tag rules are covered.
- The seam caches a filter's rows and predicate until the filter re-registers; the plugin does so on every state change, and any future filter must follow the same contract.
