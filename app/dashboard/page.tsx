"use client";
// app/dashboard/page.tsx
import { useSession, signOut } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import { DriveFile, ScanSummary, FileChange } from "@/types";

const MIME_ICONS: Record<string, string> = {
  "application/vnd.google-apps.document": "📝",
  "application/vnd.google-apps.spreadsheet": "📊",
  "application/vnd.google-apps.presentation": "📽️",
  "application/pdf": "📄",
  "image/jpeg": "🖼️",
  "image/png": "🖼️",
  "video/mp4": "🎬",
  "audio/mpeg": "🎵",
  default: "📁",
};

function mimeIcon(mimeType: string) {
  return MIME_ICONS[mimeType] ?? MIME_ICONS.default;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

type FilterType = "active" | "deleted" | "all";

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<FilterType>("active");
  const [search, setSearch] = useState("");
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<ScanSummary | null>(null);
  const [lastChanges, setLastChanges] = useState<FileChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"files" | "changes">("files");

  const PAGE_SIZE = 50;

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        filter,
        page: String(page),
        page_size: String(PAGE_SIZE),
        ...(search ? { search } : {}),
      });
      const res = await fetch(`/api/files?${params}`);
      const data = await res.json();
      setFiles(data.files ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError("Failed to load files");
    } finally {
      setLoading(false);
    }
  }, [filter, page, search]);

  useEffect(() => {
    if (status === "authenticated") fetchFiles();
  }, [status, fetchFiles]);

  async function runScan() {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/scan", { method: "POST" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setLastScan(data.summary);
      setLastChanges(data.changes ?? []);
      await fetchFiles();
      setActiveTab("changes");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#00ff88] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e0e0e0] font-mono">
      {/* Header */}
      <header className="border-b border-[#1a1a2e] bg-[#0d0d1a]/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#00ff88] rounded flex items-center justify-center text-black font-bold text-sm">G</div>
            <span className="text-lg font-bold tracking-tight text-white">Drive Monitor</span>
            <span className="text-xs text-[#555] bg-[#111] px-2 py-0.5 rounded border border-[#222]">v1.0</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-[#555]">{session?.user?.email}</span>
            <button
              onClick={() => signOut()}
              className="text-xs text-[#555] hover:text-[#e0e0e0] transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Scan Control Row */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              File Monitor
            </h1>
            {lastScan && (
              <p className="text-xs text-[#555] mt-1">
                Last scan: {timeAgo(new Date().toISOString())} ·{" "}
                {lastScan.total_scanned} files · {(lastScan.duration_ms / 1000).toFixed(2)}s
              </p>
            )}
          </div>

          <button
            onClick={runScan}
            disabled={scanning}
            className={`flex items-center gap-2 px-5 py-2.5 rounded text-sm font-bold transition-all
              ${scanning
                ? "bg-[#1a1a2e] text-[#555] cursor-not-allowed"
                : "bg-[#00ff88] text-black hover:bg-[#00cc6a] shadow-[0_0_20px_rgba(0,255,136,0.3)] hover:shadow-[0_0_30px_rgba(0,255,136,0.5)]"
              }`}
          >
            {scanning ? (
              <>
                <span className="w-3 h-3 border border-[#555] border-t-transparent rounded-full animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <span>▶</span> Run Scan
              </>
            )}
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="bg-[#2a0a0a] border border-[#ff4444] rounded px-4 py-3 text-[#ff6666] text-sm">
            ⚠ {error}
          </div>
        )}

        {/* Summary Cards */}
        {lastScan && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "New", value: lastScan.new, color: "#00ff88", bg: "#001a0d" },
              { label: "Updated", value: lastScan.updated, color: "#ffcc00", bg: "#1a1400" },
              { label: "Deleted", value: lastScan.deleted, color: "#ff4444", bg: "#1a0000" },
              { label: "Total", value: lastScan.total_scanned, color: "#6688ff", bg: "#0a0a1a" },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-lg border p-4"
                style={{ borderColor: s.color + "33", backgroundColor: s.bg }}
              >
                <div className="text-2xl font-bold" style={{ color: s.color }}>
                  {s.value.toLocaleString()}
                </div>
                <div className="text-xs text-[#555] mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[#1a1a2e]">
          {(["files", "changes"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm capitalize transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? "border-[#00ff88] text-[#00ff88]"
                  : "border-transparent text-[#555] hover:text-[#999]"
              }`}
            >
              {tab}
              {tab === "changes" && lastChanges.length > 0 && (
                <span className="ml-2 bg-[#00ff88]/20 text-[#00ff88] text-xs px-1.5 rounded">
                  {lastChanges.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Files Tab */}
        {activeTab === "files" && (
          <div className="space-y-4">
            {/* Filter + Search */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex gap-1 bg-[#111] rounded-lg p-1 border border-[#1a1a2e]">
                {(["active", "all", "deleted"] as FilterType[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => { setFilter(f); setPage(1); }}
                    className={`px-3 py-1.5 text-xs rounded capitalize transition-colors ${
                      filter === f
                        ? "bg-[#1a1a2e] text-white"
                        : "text-[#555] hover:text-[#999]"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Search files..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="flex-1 bg-[#111] border border-[#1a1a2e] rounded-lg px-4 py-2 text-sm text-[#e0e0e0] placeholder-[#333] focus:outline-none focus:border-[#00ff88]/50"
              />
            </div>

            {/* File Table */}
            <div className="rounded-lg border border-[#1a1a2e] overflow-hidden">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr] text-xs text-[#444] bg-[#0d0d1a] px-4 py-2 border-b border-[#1a1a2e]">
                <span>Name</span>
                <span>Type</span>
                <span>Size</span>
                <span>Modified</span>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16 text-[#333]">
                  <div className="w-5 h-5 border border-[#333] border-t-[#00ff88] rounded-full animate-spin" />
                </div>
              ) : files.length === 0 ? (
                <div className="text-center py-16 text-[#333] text-sm">
                  No files found. Run a scan to detect files.
                </div>
              ) : (
                files.map((file) => (
                  <div
                    key={file.file_id}
                    className={`grid grid-cols-[2fr_1fr_1fr_1fr] px-4 py-3 border-b border-[#111] text-sm hover:bg-[#0d0d1a] transition-colors ${
                      file.deleted_at ? "opacity-40" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span>{mimeIcon(file.mime_type)}</span>
                      <span className="truncate text-[#ccc]">{file.name}</span>
                      {file.deleted_at && (
                        <span className="shrink-0 text-xs text-[#ff4444] bg-[#ff444411] px-1.5 rounded">del</span>
                      )}
                    </div>
                    <div className="text-[#444] text-xs truncate flex items-center">
                      {file.mime_type.split("/").pop()}
                    </div>
                    <div className="text-[#444] text-xs flex items-center">
                      {formatBytes(file.size)}
                    </div>
                    <div className="text-[#444] text-xs flex items-center">
                      {timeAgo(file.last_modified)}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between text-xs text-[#444]">
                <span>
                  {total.toLocaleString()} files · Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                    className="px-3 py-1.5 bg-[#111] border border-[#1a1a2e] rounded hover:border-[#00ff88]/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Prev
                  </button>
                  <button
                    disabled={page === totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="px-3 py-1.5 bg-[#111] border border-[#1a1a2e] rounded hover:border-[#00ff88]/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Changes Tab */}
        {activeTab === "changes" && (
          <div>
            {lastChanges.length === 0 ? (
              <div className="text-center py-16 text-[#333] text-sm">
                No changes from last scan. Run a scan to detect differences.
              </div>
            ) : (
              <div className="space-y-2">
                {lastChanges.map((change, i) => (
                  <div
                    key={`${change.file.file_id}-${i}`}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm ${
                      change.type === "NEW"
                        ? "bg-[#001a0d] border-[#00ff88]/20 text-[#ccc]"
                        : change.type === "UPDATED"
                        ? "bg-[#1a1400] border-[#ffcc00]/20 text-[#ccc]"
                        : "bg-[#1a0000] border-[#ff4444]/20 text-[#ccc]"
                    }`}
                  >
                    <span
                      className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded ${
                        change.type === "NEW"
                          ? "bg-[#00ff88]/20 text-[#00ff88]"
                          : change.type === "UPDATED"
                          ? "bg-[#ffcc00]/20 text-[#ffcc00]"
                          : "bg-[#ff4444]/20 text-[#ff4444]"
                      }`}
                    >
                      {change.type === "NEW" ? "+" : change.type === "UPDATED" ? "~" : "−"} {change.type}
                    </span>
                    <span>{mimeIcon(change.file.mime_type)}</span>
                    <span className="truncate flex-1">{change.file.name}</span>
                    <span className="text-[#444] text-xs shrink-0">
                      {formatBytes(change.file.size)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
