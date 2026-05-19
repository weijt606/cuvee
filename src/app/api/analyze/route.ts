import { NextResponse } from "next/server";
import { z } from "zod";
import { analyze } from "@/lib/agents/orchestrator";
import { SponsorUnavailableError } from "@/lib/utils";

export const runtime = "nodejs";

const Body = z.object({
  region: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    parent: z.enum(["burgundy", "bordeaux"]),
  }),
  timeframe: z.object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  persona: z.enum(["vineyard", "trade"]),
  tradePersona: z.enum(["merchant", "restaurant", "wineshop"]).optional(),
  question: z.string().max(500).optional(),
  chateau: z.string().max(120).optional(),
  uploads: z
    .array(
      z.object({
        name: z.string().max(200),
        size: z.number().int().min(0),
        mime: z.string().max(120),
      }),
    )
    .max(20)
    .optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await analyze(parsed.data, { signal: req.signal });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof SponsorUnavailableError) {
      return NextResponse.json({ error: err.message, sponsor: err.sponsor }, { status: 503 });
    }
    console.error("[/api/analyze]", err);
    return NextResponse.json({ error: "Analyze call failed" }, { status: 500 });
  }
}
