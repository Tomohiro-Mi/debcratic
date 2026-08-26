import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { processAllActiveProposals } from "@/lib/catchup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (process.env.NODE_ENV === "production" && (!secret || secret.length < 32)) {
    return Response.json({ ok: false, error: "cron_not_configured" }, { status: 503 });
  }
  if (secret) {
    const auth = req.headers.get("authorization");
    const expected = Buffer.from(`Bearer ${secret}`);
    const actual = Buffer.from(auth ?? "");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }
  try {
    const result = await processAllActiveProposals();
    return Response.json({ ok: true, ts: new Date().toISOString(), ...result });
  } catch (err) {
    console.error("[cron]", err);
    return Response.json({ ok: false, error: "cron_failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
