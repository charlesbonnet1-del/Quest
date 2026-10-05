/**
 * POST /api/feedback : retour anonyme de fin de quête (aucune position, aucun identifiant,
 *   l'adresse IP n'est ni lue ni stockée).
 * GET  /api/feedback : lecture pour l'administration, protégée par ADMIN_SECRET
 *   (en-tête Authorization: Bearer <secret>).
 */
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { FeedbackSchema } from "@/lib/feedback/schema";
import { feedbackStorageName, listFeedback, saveFeedback } from "@/lib/feedback/store";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  const text = await req.text();
  if (text.length > 4000) return NextResponse.json({ error: "trop long" }, { status: 413, headers: noStore });
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "requête invalide" }, { status: 400, headers: noStore });
  }
  const parsed = FeedbackSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "requête invalide" }, { status: 400, headers: noStore });
  try {
    await saveFeedback({ ...parsed.data, recuLe: new Date().toISOString() });
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "enregistrement impossible" }, { status: 503, headers: noStore });
  }
}

function authorized(req: Request): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || secret.length < 12) return false;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!process.env.ADMIN_SECRET || process.env.ADMIN_SECRET.length < 12) {
    return NextResponse.json({ error: "ADMIN_SECRET non configuré (12 caractères minimum)" }, { status: 503, headers: noStore });
  }
  if (!authorized(req)) return NextResponse.json({ error: "non autorisé" }, { status: 401, headers: noStore });
  const items = await listFeedback();
  return NextResponse.json({ stockage: feedbackStorageName(), total: items.length, items }, { headers: noStore });
}
