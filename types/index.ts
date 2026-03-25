// types/index.ts

export interface DriveFile {
  file_id: string;
  name: string;
  folder_id: string;
  mime_type: string;
  last_modified: string;
  checksum: string | null;
  size: number | null;
  version: number | null;
  last_seen: string;
  deleted_at: string | null;
}

export interface ScanJob {
  id: string;
  status: "running" | "done" | "failed";
  started_at: string;
  finished_at: string | null;
}

export interface DriveAPIFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  md5Checksum?: string;
  size?: string;
  version?: string;
  parents?: string[];
}

export interface FileChange {
  type: "NEW" | "UPDATED" | "DELETED";
  file: DriveFile;
}

export interface ScanSummary {
  new: number;
  updated: number;
  deleted: number;
  total_scanned: number;
  duration_ms: number;
  job_id: string;
}

export interface ScanResult {
  success: boolean;
  summary: ScanSummary;
  changes: FileChange[];
  error?: string;
}

export interface FilesResponse {
  files: DriveFile[];
  total: number;
  page: number;
  page_size: number;
}
