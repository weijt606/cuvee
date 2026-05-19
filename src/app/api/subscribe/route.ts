import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const Body = z.object({
  email: z.string().email().max(200),
  regionId: z.string().min(1).max(100).optional(),
  persona: z.enum(["vineyard", "trade"]).optional(),
});

/**
 * Subscribe stub — accepts an email + optional context and logs it. Replace
 * with a real provider (Resend / Postmark / SendGrid) by adding an env-gated
 * adapter under src/lib/email/ and calling it from here. Returns 200 even
 * when stubbed so the UI flow can be demoed end-to-end.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  // TODO(dev): wire a real mail provider once a sponsor key is available.
  // We log the submission shape (not the raw email) so the dev console
  // confirms the route fired without leaking subscriber PII into shared
  // terminals / log aggregators.
  const masked = maskEmail(parsed.data.email);
  console.log(
    "[subscribe] stub recorded:",
    JSON.stringify({
      email: masked,
      regionId: parsed.data.regionId,
      persona: parsed.data.persona,
      at: new Date().toISOString(),
    }),
  );
  return NextResponse.json({ ok: true, stub: true });
}

/** "alice@example.com" → "a***e@example.com" — keep enough for debugging
 *  routing issues without exposing the full subscriber address. */
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local[0]}***${domain}`;
  return `${local[0]}***${local[local.length - 1]}${domain}`;
}
