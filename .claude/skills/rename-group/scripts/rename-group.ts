#!/usr/bin/env node

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find the project root (go up from .claude/skills/rename-group/scripts)
const projectRoot = path.resolve(__dirname, '../../../../');
const GROUPS_DIR = path.join(projectRoot, 'groups');
const STORE_DIR = path.join(projectRoot, 'store');
const DATA_DIR = path.join(projectRoot, 'data');
const DB_PATH = path.join(STORE_DIR, 'messages.db');

// Regex from src/group-folder.ts
const GROUP_FOLDER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const RESERVED_FOLDERS = new Set(['global', 'main']);

interface RenameOptions {
  dryRun: boolean;
}

function isValidGroupFolder(folder: string): boolean {
  if (!folder) return false;
  if (folder !== folder.trim()) return false;
  if (!GROUP_FOLDER_PATTERN.test(folder)) return false;
  if (folder.includes('/') || folder.includes('\\')) return false;
  if (folder.includes('..')) return false;
  if (RESERVED_FOLDERS.has(folder.toLowerCase())) return false;
  return true;
}

function validateArgs(oldName: string, newName: string): void {
  if (!oldName || !newName) {
    console.error('Error: Both old and new group names are required');
    console.error('Usage: npx tsx rename-group.ts <old-name> <new-name>');
    process.exit(1);
  }

  if (!isValidGroupFolder(oldName)) {
    console.error(
      `Error: Invalid old group name "${oldName}". Must be alphanumeric, dashes, underscores only.`,
    );
    process.exit(1);
  }

  if (!isValidGroupFolder(newName)) {
    console.error(
      `Error: Invalid new group name "${newName}". Must be alphanumeric, dashes, underscores only.`,
    );
    process.exit(1);
  }

  if (oldName === newName) {
    console.error('Error: Old and new names are the same');
    process.exit(1);
  }

  if (RESERVED_FOLDERS.has(oldName.toLowerCase())) {
    console.error(
      `Error: Cannot rename reserved group "${oldName}". It cannot be changed.`,
    );
    process.exit(1);
  }
}

function checkGroupExists(oldName: string): void {
  const oldPath = path.join(GROUPS_DIR, oldName);
  if (!fs.existsSync(oldPath)) {
    console.error(`Error: Group folder "${oldName}" does not exist at ${oldPath}`);
    process.exit(1);
  }
}

function checkNewGroupNotExists(newName: string): void {
  const newPath = path.join(GROUPS_DIR, newName);
  if (fs.existsSync(newPath)) {
    console.error(`Error: Group folder "${newName}" already exists at ${newPath}`);
    process.exit(1);
  }
}

function cleanupDataDirectories(oldName: string, newName: string, dryRun: boolean): void {
  // Rename data/ipc/{oldName} to data/ipc/{newName}
  const oldIpcPath = path.join(DATA_DIR, 'ipc', oldName);
  const newIpcPath = path.join(DATA_DIR, 'ipc', newName);
  if (fs.existsSync(oldIpcPath)) {
    if (dryRun) {
      console.log(`  - Rename IPC dir: ${oldIpcPath} → ${newIpcPath}`);
    } else {
      fs.renameSync(oldIpcPath, newIpcPath);
      console.log('✓ IPC directory renamed');
    }
  }

  // Rename data/sessions/{oldName} to data/sessions/{newName}
  const oldSessionPath = path.join(DATA_DIR, 'sessions', oldName);
  const newSessionPath = path.join(DATA_DIR, 'sessions', newName);
  if (fs.existsSync(oldSessionPath)) {
    if (dryRun) {
      console.log(`  - Rename sessions dir: ${oldSessionPath} → ${newSessionPath}`);
    } else {
      fs.renameSync(oldSessionPath, newSessionPath);
      console.log('✓ Sessions directory renamed');
    }
  }
}

function renameGroup(oldName: string, newName: string, options: RenameOptions): void {
  const oldPath = path.join(GROUPS_DIR, oldName);
  const newPath = path.join(GROUPS_DIR, newName);

  console.log(`Renaming group: "${oldName}" → "${newName}"`);

  if (!fs.existsSync(DB_PATH)) {
    console.error(`Error: Database not found at ${DB_PATH}`);
    process.exit(1);
  }

  // Open database
  const db = new Database(DB_PATH);

  try {
    if (options.dryRun) {
      console.log('[DRY RUN] Changes would be:');
      console.log(`  - Rename folder: ${oldPath} → ${newPath}`);

      const groups = db
        .prepare('SELECT jid, name, folder FROM registered_groups WHERE folder = ?')
        .all(oldName);
      console.log(`  - Update registered_groups: ${groups.length} entry(ies)`);

      const tasks = db
        .prepare('SELECT COUNT(*) as count FROM scheduled_tasks WHERE group_folder = ?')
        .get(oldName) as { count: number };
      console.log(`  - Update scheduled_tasks: ${tasks.count} task(s)`);

      const sessions = db
        .prepare('SELECT COUNT(*) as count FROM sessions WHERE group_folder = ?')
        .get(oldName) as { count: number };
      console.log(`  - Delete sessions (to force fresh session): ${sessions.count} session(s)`);

      cleanupDataDirectories(oldName, newName, true);

      console.log('[DRY RUN] No changes made');
      return;
    }

    // Start transaction
    const transaction = db.transaction(() => {
      // Check group exists in DB
      const groupCount = db
        .prepare('SELECT COUNT(*) as count FROM registered_groups WHERE folder = ?')
        .get(oldName) as { count: number };

      if (groupCount.count === 0) {
        throw new Error(`Group "${oldName}" not found in registered_groups table`);
      }

      // Update registered_groups
      const groupsStmt = db.prepare('UPDATE registered_groups SET folder = ? WHERE folder = ?');
      const groupsInfo = groupsStmt.run(newName, oldName);
      console.log(`✓ Updated registered_groups (${groupsInfo.changes} rows)`);

      // Update scheduled_tasks
      const tasksStmt = db.prepare('UPDATE scheduled_tasks SET group_folder = ? WHERE group_folder = ?');
      const tasksInfo = tasksStmt.run(newName, oldName);
      if (tasksInfo.changes > 0) {
        console.log(`✓ Updated scheduled_tasks (${tasksInfo.changes} rows)`);
      }

      // DELETE sessions to force fresh session creation (avoid stale session IDs)
      const deleteSessionsStmt = db.prepare('DELETE FROM sessions WHERE group_folder = ?');
      const deletedSessions = deleteSessionsStmt.run(oldName);
      if (deletedSessions.changes > 0) {
        console.log(
          `✓ Deleted sessions to force fresh session on next message (${deletedSessions.changes} rows)`,
        );
      }
    });

    transaction();

    // Cleanup data directories (IPC, sessions)
    cleanupDataDirectories(oldName, newName, false);

    // Rename folder (after DB transaction succeeds)
    console.log(`Renaming folder: ${oldPath} → ${newPath}`);
    fs.renameSync(oldPath, newPath);
    console.log('✓ Folder renamed');

    console.log(
      `\n✅ Group successfully renamed: "${oldName}" → "${newName}"\nNext message will create a fresh session.`,
    );
  } catch (err) {
    const error = err as Error;
    console.error(`\n❌ Error: ${error.message}`);

    // Check if folder was already renamed (shouldn't happen with our transaction order)
    if (fs.existsSync(newPath)) {
      console.log('\nNote: Folder was renamed but database transaction failed.');
      console.log('Consider manually reverting with:');
      console.log(`  mv ${newPath} ${oldPath}`);
    }

    process.exit(1);
  } finally {
    db.close();
  }
}

// Main execution
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const positionalArgs = args.filter((arg) => !arg.startsWith('--'));
const [oldName, newName] = positionalArgs;

if (!oldName || !newName) {
  console.error('Error: Old and new group names required');
  console.error('Usage: npx tsx rename-group.ts <old-name> <new-name> [--dry-run]');
  console.error('');
  console.error('Examples:');
  console.error('  npx tsx rename-group.ts dev development');
  console.error('  npx tsx rename-group.ts test staging --dry-run');
  process.exit(1);
}

validateArgs(oldName, newName);
checkGroupExists(oldName);
checkNewGroupNotExists(newName);
renameGroup(oldName, newName, { dryRun });
