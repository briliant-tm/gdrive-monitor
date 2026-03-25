// lib/diff.ts
import { DriveAPIFile, DriveFile, FileChange } from "@/types";
import { supabaseAdmin } from "./supabase";

/**
 * Build effective checksum from available fields (priority order).
 */
function effectiveChecksum(file: DriveAPIFile): string {
  if (file.md5Checksum) return `md5:${file.md5Checksum}`;
  return `fallback:${file.modifiedTime}:${file.size ?? ""}:${file.version ?? ""}`;
}

/**
 * Core O(n) diff engine.
 * Compares API results against DB snapshot and returns classified changes.
 */
export async function computeDiff(
  apiFiles: DriveAPIFile[],
  folderId: string
): Promise<{
  changes: FileChange[];
  inserts: Partial<DriveFile>[];
  updates: Partial<DriveFile>[];
  deletedIds: string[];
}> {
  // Load all current DB records for this root scan into a Map — O(n)
  const { data: dbFiles, error } = await supabaseAdmin
    .from("files")
    .select("*")
    .is("deleted_at", null);

  if (error) throw new Error(`DB fetch error: ${error.message}`);

  const dbMap = new Map<string, DriveFile>();
  for (const f of dbFiles ?? []) {
    dbMap.set(f.file_id, f);
  }

  // Build a Set of all API file IDs for O(1) deletion detection
  const apiFileIds = new Set(apiFiles.map((f) => f.id));

  const changes: FileChange[] = [];
  const inserts: Partial<DriveFile>[] = [];
  const updates: Partial<DriveFile>[] = [];
  const now = new Date().toISOString();

  // Classify each API file
  for (const apiFile of apiFiles) {
    const parentFolder = apiFile.parents?.[0] ?? folderId;
    const checksum = effectiveChecksum(apiFile);

    if (!dbMap.has(apiFile.id)) {
      // NEW FILE
      const record: Partial<DriveFile> = {
        file_id: apiFile.id,
        name: apiFile.name,
        folder_id: parentFolder,
        mime_type: apiFile.mimeType,
        last_modified: apiFile.modifiedTime,
        checksum,
        size: apiFile.size ? parseInt(apiFile.size, 10) : null,
        version: apiFile.version ? parseInt(apiFile.version, 10) : null,
        last_seen: now,
        deleted_at: null,
      };
      inserts.push(record);
      changes.push({ type: "NEW", file: record as DriveFile });
    } else {
      const dbFile = dbMap.get(apiFile.id)!;
      const modifiedChanged = dbFile.last_modified !== apiFile.modifiedTime;
      const checksumChanged = dbFile.checksum !== checksum;
      const sizeChanged =
        dbFile.size !== (apiFile.size ? parseInt(apiFile.size, 10) : null);

      if (modifiedChanged || checksumChanged || sizeChanged) {
        // UPDATED FILE
        const record: Partial<DriveFile> = {
          file_id: apiFile.id,
          name: apiFile.name,
          folder_id: parentFolder,
          mime_type: apiFile.mimeType,
          last_modified: apiFile.modifiedTime,
          checksum,
          size: apiFile.size ? parseInt(apiFile.size, 10) : null,
          version: apiFile.version ? parseInt(apiFile.version, 10) : null,
          last_seen: now,
          deleted_at: null,
        };
        updates.push(record);
        changes.push({ type: "UPDATED", file: record as DriveFile });
      } else {
        // Unchanged — just update last_seen
        updates.push({ file_id: apiFile.id, last_seen: now });
      }
      dbMap.delete(apiFile.id); // remove from map to track what's left
    }
  }

  // Remaining DB entries not in API = DELETED
  const deletedIds: string[] = [];
  for (const [fileId, dbFile] of dbMap.entries()) {
    deletedIds.push(fileId);
    changes.push({ type: "DELETED", file: dbFile });
  }

  return { changes, inserts, updates, deletedIds };
}

/**
 * Apply computed diff to DB in batches.
 */
export async function applyDiff(
  inserts: Partial<DriveFile>[],
  updates: Partial<DriveFile>[],
  deletedIds: string[]
): Promise<void> {
  const BATCH_SIZE = 500;
  const now = new Date().toISOString();

  // Batch inserts
  for (let i = 0; i < inserts.length; i += BATCH_SIZE) {
    const batch = inserts.slice(i, i + BATCH_SIZE);
    const { error } = await supabaseAdmin.from("files").insert(batch);
    if (error) throw new Error(`Batch insert error: ${error.message}`);
  }

  // Batch upserts for updates
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    const { error } = await supabaseAdmin
      .from("files")
      .upsert(batch, { onConflict: "file_id" });
    if (error) throw new Error(`Batch upsert error: ${error.message}`);
  }

  // Batch soft-deletes
  for (let i = 0; i < deletedIds.length; i += BATCH_SIZE) {
    const batch = deletedIds.slice(i, i + BATCH_SIZE);
    const { error } = await supabaseAdmin
      .from("files")
      .update({ deleted_at: now })
      .in("file_id", batch);
    if (error) throw new Error(`Batch delete error: ${error.message}`);
  }
}
