// lib/drive.ts
import { DriveAPIFile } from "@/types";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  accessToken: string,
  retries = MAX_RETRIES
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      // Rate limit: back off and retry
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("Retry-After") || "5", 10);
        await sleep(retryAfter * 1000);
        continue;
      }

      // Token expired
      if (res.status === 401) {
        throw new Error("TOKEN_EXPIRED");
      }

      if (!res.ok) {
        throw new Error(`Drive API error: ${res.status} ${res.statusText}`);
      }

      return res;
    } catch (err) {
      if (err instanceof Error && err.message === "TOKEN_EXPIRED") throw err;
      if (attempt === retries) throw err;
      await sleep(RETRY_DELAY_MS * Math.pow(2, attempt)); // exponential backoff
    }
  }
  throw new Error("Max retries exceeded");
}

/**
 * List all files (non-folders) in a single folder, with pagination.
 */
async function listFolderFiles(
  folderId: string,
  accessToken: string
): Promise<DriveAPIFile[]> {
  const files: DriveAPIFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields:
        "nextPageToken, files(id,name,mimeType,modifiedTime,md5Checksum,size,version,parents)",
      pageSize: "1000",
      ...(pageToken ? { pageToken } : {}),
    });

    const url = `${DRIVE_API_BASE}/files?${params}`;
    const res = await fetchWithRetry(url, accessToken);
    const data = await res.json();

    files.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return files;
}

/**
 * BFS traversal of all nested folders. Returns flat list of all files.
 */
export async function getAllFilesInFolder(
  rootFolderId: string,
  accessToken: string
): Promise<{ files: DriveAPIFile[]; folderCount: number }> {
  const allFiles: DriveAPIFile[] = [];
  const queue: string[] = [rootFolderId];
  const visited = new Set<string>();
  let folderCount = 0;

  while (queue.length > 0) {
    const currentFolderId = queue.shift()!;
    if (visited.has(currentFolderId)) continue;
    visited.add(currentFolderId);
    folderCount++;

    const items = await listFolderFiles(currentFolderId, accessToken);

    for (const item of items) {
      if (item.mimeType === FOLDER_MIME) {
        // Enqueue subfolder for traversal
        queue.push(item.id);
      } else {
        // It's a file — tag it with its parent folder
        allFiles.push({ ...item, parents: [currentFolderId] });
      }
    }
  }

  return { files: allFiles, folderCount };
}

/**
 * Refresh access token using refresh token (NextAuth compatible)
 */
export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to refresh access token");
  }

  const data = await res.json();
  return data.access_token;
}
