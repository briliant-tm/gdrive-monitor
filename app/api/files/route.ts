// app/api/files/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { FilesResponse } from "@/types";

export async function GET(req: NextRequest): Promise<NextResponse<FilesResponse | { error: string }>> {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const filter = searchParams.get("filter") ?? "active"; // active | deleted | all
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = Math.min(parseInt(searchParams.get("page_size") ?? "50", 10), 200);
  const search = searchParams.get("search") ?? "";
  const offset = (page - 1) * pageSize;

  let query = supabaseAdmin
    .from("files")
    .select("*", { count: "exact" });

  // Filter
  if (filter === "active") {
    query = query.is("deleted_at", null);
  } else if (filter === "deleted") {
    query = query.not("deleted_at", "is", null);
  }
  // "all" = no filter

  // Search
  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  // Paginate
  query = query
    .order("last_seen", { ascending: false })
    .range(offset, offset + pageSize - 1);

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    files: data ?? [],
    total: count ?? 0,
    page,
    page_size: pageSize,
  });
}
