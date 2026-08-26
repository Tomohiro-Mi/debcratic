import { NextRequest } from "next/server";
import { processAllActiveProposals } from "@/lib/catchup";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }
  try {
    const result = await processAllActiveProposals();
    return Response.json({ ok: true, ts: new Date().toISOString(), ...result });
  } catch (err) {
    console.error("[cron]", err);
    return Response.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
