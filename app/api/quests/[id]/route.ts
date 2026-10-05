import { NextResponse } from "next/server";
import { loadAllQuests } from "@/lib/content/load";
import { buildBundle } from "@/lib/content/server";

// Généré au build : ajouter une quête = déposer le fichier JSON et redéployer.
export const dynamic = "force-static";

export function generateStaticParams() {
  return loadAllQuests().map((q) => ({ id: q.id }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = buildBundle(id);
  if (!bundle) return NextResponse.json({ error: "quête inconnue" }, { status: 404 });
  return NextResponse.json(bundle);
}
