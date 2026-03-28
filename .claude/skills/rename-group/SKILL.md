---
name: rename-group
description: Safely rename a NanoClaw group with database updates
---

# Rename Group

Safely rename a NanoClaw group, updating:
- The physical folder in `groups/`
- The `registered_groups` table in SQLite
- The `sessions` table (if applicable)
- All scheduled tasks referencing the old folder

## Usage

```bash
npx tsx ${CLAUDE_SKILL_DIR}/scripts/rename-group.ts <old-name> <new-name>
```

### Examples

```bash
# Rename group "dev" to "development"
npx tsx ${CLAUDE_SKILL_DIR}/scripts/rename-group.ts dev development

# Rename group "test-1" to "staging"
npx tsx ${CLAUDE_SKILL_DIR}/scripts/rename-group.ts test-1 staging
```

## Validation

The script validates the new name using the same rules as NanoClaw:
- Alphanumeric, dashes, underscores only
- 1-64 characters
- Cannot be "global" (reserved)
- No spaces or special characters

## What Gets Updated

1. **Folder**: `groups/{old-name}/` → `groups/{new-name}/`
2. **Database**:
   - `registered_groups`: Updated folder reference
   - `scheduled_tasks`: Updated folder reference
   - `sessions`: **Deleted** to force fresh session on next message (prevents stale session errors)
3. **Data directories**:
   - `data/ipc/{old-name}/` → `data/ipc/{new-name}/`
   - `data/sessions/{old-name}/` → `data/sessions/{new-name}/`
4. **Configuration**: If the group has a `CLAUDE.md`, it's preserved in the new location
5. **Message history**: All messages, metadata, and logs move with the folder

## Safety

- Validates the new name before making changes
- Checks that the old group exists
- Rolls back on error (folder rename reverted if DB update fails)
- Logs all changes
- Dry-run mode available (add `--dry-run` flag)

## Important Notes

### Fresh Session Creation

Sessions are **deleted** during the rename to prevent "No conversation found" errors from stale session IDs. The next message to the renamed group will create a fresh session automatically. This is safe and normal.

## Limitations

- NanoClaw must be stopped before renaming (to avoid conflicting writes)
- Cannot rename to a name that already exists
- The "main" group cannot be renamed
