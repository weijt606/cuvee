import { NextResponse } from "next/server";
import { sponsors, isDemoMode } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    demoMode: isDemoMode,
    sponsors,
    timestamp: new Date().toISOString(),
  });
}
