// app/api/scan/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { getAllFilesInFolder } from "@/lib/drive";
import { computeDiff, applyDiff } from "@/lib/diff";
import { sendNotification } from "@/lib/notify";
import { getServiceAccountToken } from "@/lib/service-account";
import { ScanResult } from "@/types";

export const maxDuration = 300; // 5 min Vercel function timeout

export async function POST(req: NextRequest): Promise<NextResponse<ScanResult>> {
  const startTime = Date.now();

  // === AUTH — support both user session and cron service account ===
  let accessToken: string | null = null;
  const isCron =
    req.headers.get("X-Cron-Secret") === process.env.CRON_SECRET &&
    !!process.env.CRON_SECRET;

  if (isCron) {
    try {
      accessToken = await getServiceAccountToken();
    } catch (e) {
      return NextResponse.json(
        { success: false, summary: emptySummary(""), changes: [], error: `Service account error: ${e}` },
        { status: 500 }
      );
    }
  } else {
    const session = await getServerSession(authOptions);
    if (session?.error === "RefreshAccessTokenError") {
      return NextResponse.json(
        { success: false, summary: emptySummary(""), changes: [], error: "Session expired. Please sign in again." },
        { status: 401 }
      );
    }
    accessToken = session?.accessToken ?? null;
  }

  if (!accessToken) {
    return NextResponse.json(
      { success: false, summary: emptySummary(""), changes: [], error: "Unauthorized" },
      { status: 401 }
    );
  }

  const folderId = process.env.DRIVE_FOLDER_ID;
  if (!folderId) {
    return NextResponse.json(
      { success: false, summary: emptySummary(""), changes: [], error: "DRIVE_FOLDER_ID is not configured" },
      { status: 500 }
    );
  }

  // === CONCURRENCY CONTROL ===
  const { data: runningJobs } = await supabaseAdmin
    .from("scan_jobs")
    .select("id, started_at")
    .eq("status", "running")
    .limit(1);

  if (runningJobs && runningJobs.length > 0) {
    const runningJob = runningJobs[0];
    const runningFor = Date.now() - new Date(runningJob.started_at).getTime();
    if (runningFor < 10 * 60 * 1000) {
      return NextResponse.json(
        {
          success: false,
          summary: emptySummary(runningJob.id),
          changes: [],
          error: `Scan already running (job: ${runningJob.id})`,
        },
        { status: 409 }
      );
    }
    await supabaseAdmin
      .from("scan_jobs")
      .update({ status: "failed", finished_at: new Date().toISOString() })
      .eq("id", runningJob.id);
  }

  // === CREATE JOB ===
  const { data: job, error: jobError } = await supabaseAdmin
    .from("scan_jobs")
    .insert({ status: "running", started_at: new Date().toISOString() })
    .select()
    .single();

  if (jobError || !job) {
    return NextResponse.json(
      { success: false, summary: emptySummary(""), changes: [], error: "Failed to create scan job" },
      { status: 500 }
    );
  }

  try {
    const { files: apiFiles } = await getAllFilesInFolder(folderId, accessToken);
    const { changes, inserts, updates, deletedIds } = await computeDiff(apiFiles, folderId);
    await applyDiff(inserts, updates, deletedIds);

    const duration = Date.now() - startTime;
    const realUpdates = updates.filter((u) => Object.keys(u).length > 2).length;

    const summary = {
      new: inserts.length,
      updated: realUpdates,
      deleted: deletedIds.length,
      total_scanned: apiFiles.length,
      duration_ms: duration,
      job_id: job.id,
    };

    await supabaseAdmin
      .from("scan_jobs")
      .update({ status: "done", finished_at: new Date().toISOString() })
      .eq("id", job.id);

    await sendNotification(summary);

    return NextResponse.json({ success: true, summary, changes: changes.slice(0, 100) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabaseAdmin
      .from("scan_jobs")
      .update({ status: "failed", finished_at: new Date().toISOString() })
      .eq("id", job.id);
    return NextResponse.json(
      { success: false, summary: emptySummary(job.id), changes: [], error: message },
      { status: 500 }
    );
  }
}

function emptySummary(jobId: string) {
  return { new: 0, updated: 0, deleted: 0, total_scanned: 0, duration_ms: 0, job_id: jobId };
}
