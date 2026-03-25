// app/api/cron/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * Vercel Cron endpoint.
 * vercel.json: { "crons": [{ "path": "/api/cron", "schedule": "*/15 * * * *" }] }
 *
 * Vercel automatically sends Authorization: Bearer <CRON_SECRET>.
 * This calls /api/scan with X-Cron-Secret so scan uses service account auth.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || authHeader !== expectedAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

  try {
    const res = await fetch(`${baseUrl}/api/scan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cron-Secret": process.env.CRON_SECRET,
      },
    });

    const data = await res.json();
    return NextResponse.json({ cron: true, triggered_at: new Date().toISOString(), result: data });
  } catch (err) {
    return NextResponse.json({ cron: true, error: String(err) }, { status: 500 });
  }
}
