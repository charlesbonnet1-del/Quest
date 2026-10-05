"use client";

import Link from "next/link";
import { useState } from "react";
import type { QuestSummary } from "@/lib/content/server";
import { sendFeedback } from "@/lib/feedback/client";
import type { SessionSnapshot } from "@/lib/session/session";

const SMILEYS = ["😞", "🙁", "😐", "🙂", "😄"];

export function EndScreen({ snap, summary }: { snap: SessionSnapshot; summary: QuestSummary }) {
  const eng = snap.engine;
  const [note, setNote] = useState<number | null>(null);
  const [aBouge, setABouge] = useState<boolean | null>(null);
  const [commentaire, setCommentaire] = useState("");
  const [sent, setSent] = useState<null | "ok" | "attente">(null);
  const [sending, setSending] = useState(false);
  const distance = Math.round(eng?.distanceM ?? 0);
  const minutes = Math.round((eng?.activeMs ?? 0) / 60000);

  async function submit() {
    if (!eng) return;
    setSending(true);
    const ok = await sendFeedback({
      questId: summary.id,
      environnement: eng.envOverride ?? eng.env,
      dureeS: Math.round(eng.activeMs / 1000),
      distanceM: distance,
      note,
      aBouge,
      ...(commentaire.trim() ? { commentaire: commentaire.trim().slice(0, 1000) } : {}),
      ...(eng.endReason ? { fin: eng.endReason } : {}),
    });
    setSending(false);
    setSent(ok ? "ok" : "attente");
  }

  return (
    <main className="mx-auto max-w-md px-6 pt-14 pb-10">
      <h1 className="text-3xl font-bold text-braise">Bravo&nbsp;!</h1>
      <p className="mt-2 text-stone-400">{summary.titre}</p>
      <div className="mt-6 grid grid-cols-2 gap-3 text-center">
        <div className="rounded-2xl bg-ardoise p-4">
          <p className="text-3xl font-bold text-stone-100">
            {distance >= 1000 ? (distance / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : distance}
          </p>
          <p className="text-sm text-stone-400">{distance >= 1000 ? "km marchés" : "mètres marchés"}</p>
        </div>
        <div className="rounded-2xl bg-ardoise p-4">
          <p className="text-3xl font-bold text-stone-100">{minutes}</p>
          <p className="text-sm text-stone-400">minutes</p>
        </div>
      </div>

      {sent ? (
        <p className="mt-10 rounded-xl bg-emerald-950/60 p-4 text-emerald-200">
          {sent === "ok" ? "Merci pour votre retour !" : "Merci ! Votre retour sera envoyé dès que le réseau revient."}
        </p>
      ) : (
        <section className="mt-10 space-y-6">
          <p className="text-sm text-stone-400">Deux questions rapides, anonymes (ni position, ni identifiant)&nbsp;:</p>
          <div>
            <p className="mb-2 text-stone-200">Votre avis sur cette sortie&nbsp;?</p>
            <div className="flex justify-between">
              {SMILEYS.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  aria-label={`${i + 1} sur 5`}
                  aria-pressed={note === i + 1}
                  onClick={() => setNote(i + 1)}
                  className={`h-14 w-14 rounded-full text-3xl ${note === i + 1 ? "bg-braise/30 ring-2 ring-braise" : "bg-ardoise"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-stone-200">Votre enfant a-t-il couru ou exploré&nbsp;?</p>
            <div className="grid grid-cols-2 gap-3">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  aria-pressed={aBouge === v}
                  onClick={() => setABouge(v)}
                  className={`rounded-xl py-3 text-lg ${aBouge === v ? "bg-braise font-semibold text-black" : "bg-ardoise text-stone-200"}`}
                >
                  {v ? "Oui" : "Non"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="commentaire" className="mb-2 block text-stone-200">
              Un commentaire&nbsp;? <span className="text-stone-500">(facultatif, sans nom ni adresse svp)</span>
            </label>
            <textarea
              id="commentaire"
              maxLength={1000}
              rows={3}
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              className="w-full rounded-xl border border-stone-800 bg-ardoise p-3 text-stone-100"
            />
          </div>
          <button
            type="button"
            disabled={sending || (note === null && aBouge === null && !commentaire.trim())}
            onClick={() => void submit()}
            className="w-full rounded-2xl bg-braise py-4 text-xl font-bold text-black disabled:opacity-40"
          >
            Envoyer
          </button>
        </section>
      )}

      <Link href="/" className="mt-8 block text-center text-stone-400 underline underline-offset-4">
        Retour à l&apos;accueil
      </Link>
    </main>
  );
}
