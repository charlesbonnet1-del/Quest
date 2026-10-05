"use client";

import Link from "next/link";
import { useState } from "react";
import { ENVIRONMENT_LABELS } from "@/lib/content/schema";
import type { QuestSummary } from "@/lib/content/server";
import type { QuestSession, SessionSnapshot } from "@/lib/session/session";
import { EnvironmentPicker } from "./EnvironmentPicker";

export const SAFETY_TEXT =
  "Vous restez responsable de la surveillance de votre enfant. Choisissez un endroit sans circulation et gardez l'enfant en vue.";

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <section className="border-b border-stone-900 py-5">
      <h2 className="flex items-center gap-3 text-lg font-semibold">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm ${
            done ? "bg-emerald-600 text-white" : "bg-stone-800 text-stone-300"
          }`}
          aria-hidden
        >
          {done ? "✓" : n}
        </span>
        {title}
      </h2>
      <div className="mt-3 pl-10 text-stone-300">{children}</div>
    </section>
  );
}

export function Preparation({ session, snap, summary }: { session: QuestSession; snap: SessionSnapshot; summary: QuestSummary }) {
  const [showEnv, setShowEnv] = useState(false);
  const eng = snap.engine;
  const env = eng ? (eng.envOverride ?? eng.env) : "default";
  const dl = snap.download;
  const pct = dl && dl.total > 0 ? Math.round(((dl.done + dl.failed) / dl.total) * 100) : 0;
  const missing = snap.bundle?.missingAudio ?? 0;

  if (snap.bundleError) {
    return (
      <main className="mx-auto max-w-md px-6 pt-16">
        <h1 className="text-2xl font-bold text-braise">{summary.titre}</h1>
        <p className="mt-6 rounded-xl bg-red-950/60 p-4 text-red-200">{snap.bundleError}</p>
        <Link href="/" className="mt-6 inline-block underline">
          Retour à l&apos;accueil
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-5 pt-8 pb-40">
      <Link href="/" className="text-sm text-stone-500">
        ← Accueil
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-braise">{summary.titre}</h1>
      <p className="text-sm text-stone-400">
        Préparation du départ · {summary.dureeEstimeeMin} min environ
        {summary.provisoire ? " · contenu provisoire" : ""}
      </p>
      {!snap.online && (
        <p className="mt-3 rounded-lg bg-stone-900 p-3 text-sm text-stone-300">
          Hors ligne{snap.bundleFromCache ? " : quête déjà enregistrée sur le téléphone." : "."}
        </p>
      )}

      {snap.resumable && (
        <div className="mt-4 rounded-xl border border-braise/50 p-4">
          <p>
            Une quête était en cours ({Math.round(snap.resumable.distanceM)} m parcourus). La reprendre&nbsp;?
          </p>
          <div className="mt-3 flex gap-3">
            <button type="button" className="rounded-lg bg-braise px-4 py-2 font-semibold text-black" onClick={() => session.useResumable()}>
              Reprendre
            </button>
            <button type="button" className="rounded-lg border border-stone-700 px-4 py-2" onClick={() => void session.discardResumable()}>
              Recommencer
            </button>
          </div>
        </div>
      )}

      <Step n={1} title="Localisation" done={!!snap.position}>
        {snap.position ? (
          <p>
            Position trouvée{snap.sim ? " (simulée)" : ""} · précision ±{Math.round(snap.position.accuracy)} m
          </p>
        ) : snap.positionError ? (
          <div className="text-red-300">
            {snap.positionError.kind === "refusee" ? (
              <p>
                La localisation est refusée. Sans elle, la quête ne peut pas avancer. Autorisez-la dans les réglages du
                navigateur (Réglages › Safari › Position sur iPhone, ou l&apos;icône de cadenas dans la barre d&apos;adresse), puis
                réessayez.
              </p>
            ) : (
              <p>Position introuvable pour le moment. Mettez-vous à découvert et réessayez.</p>
            )}
            <button type="button" className="mt-3 rounded-lg border border-stone-600 px-4 py-2 text-stone-200" onClick={() => session.requestLocation()}>
              Réessayer
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm">
              La position sert à mesurer la distance marchée et à reconnaître le décor. Elle reste sur le téléphone.
            </p>
            <button
              type="button"
              disabled={snap.locating || !eng}
              className="mt-3 w-full rounded-xl bg-stone-100 py-3 font-semibold text-black disabled:opacity-50"
              onClick={() => session.requestLocation()}
            >
              {snap.locating ? "Recherche de la position…" : "Autoriser la localisation"}
            </button>
          </>
        )}
      </Step>

      <Step n={2} title="Où êtes-vous ?" done={snap.contextStatus === "ok" || snap.contextStatus === "echec"}>
        {snap.contextStatus === "attente" && <p className="text-sm text-stone-500">Après la localisation.</p>}
        {snap.contextStatus === "chargement" && <p>Reconnaissance des lieux autour de vous…</p>}
        {(snap.contextStatus === "ok" || snap.contextStatus === "echec") && (
          <>
            {snap.contextNote && <p className="mb-2 text-sm text-amber-300">{snap.contextNote}</p>}
            <p>
              <span className="text-xl text-stone-100">{ENVIRONMENT_LABELS[env]}</span>
              {eng?.envOverride ? " (choisi par vous)" : snap.contextStatus === "ok" ? " (détecté)" : ""}
            </p>
            <button type="button" className="mt-2 text-sm text-stone-400 underline" onClick={() => setShowEnv((v) => !v)}>
              On est plutôt…
            </button>
            {showEnv && eng && (
              <div className="mt-3">
                <EnvironmentPicker detected={eng.env} override={eng.envOverride} onPick={(e) => session.setEnvironment(e)} />
              </div>
            )}
          </>
        )}
      </Step>

      <Step n={3} title="Téléchargement" done={!!dl && dl.done + dl.failed >= dl.total}>
        {!dl ? (
          <p className="text-sm text-stone-500">Démarre une fois le lieu reconnu.</p>
        ) : (
          <>
            <div className="h-3 w-full overflow-hidden rounded-full bg-stone-800" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-braise transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-sm">
              {dl.done}/{dl.total} fichiers audio
              {dl.failed > 0 ? ` · ${dl.failed} échec(s)` : ""}
              {dl.done + dl.failed < dl.total ? " · vous pouvez partir, la suite se télécharge pendant la marche" : " · prêt pour le mode avion"}
            </p>
          </>
        )}
        {missing > 0 && (
          <p className="mt-2 text-sm text-amber-300">
            {missing} passage(s) sans voix enregistrée : la voix du téléphone les lira.
          </p>
        )}
      </Step>

      <Step n={4} title="Écran allumé" done={snap.wakeLockActive}>
        {snap.wakeLockSupported ? (
          <>
            <p className="text-sm">
              L&apos;écran doit rester allumé (presque noir) pendant la marche, sinon le téléphone arrête de suivre la position.
            </p>
            {!snap.wakeLockActive && (
              <button type="button" className="mt-3 w-full rounded-xl border border-stone-600 py-3" onClick={() => void session.requestWakeLock()}>
                Garder l&apos;écran allumé
              </button>
            )}
          </>
        ) : (
          <p className="text-sm text-amber-300">
            Ce navigateur ne sait pas garder l&apos;écran allumé. Avant de partir, réglez la mise en veille automatique sur
            «&nbsp;Jamais&nbsp;» (iPhone&nbsp;: Réglages › Luminosité et affichage › Verrouillage auto&nbsp;; Android&nbsp;: Paramètres ›
            Affichage › Mise en veille), et pensez à la remettre après.
          </p>
        )}
      </Step>

      <Step n={5} title="Sécurité" done={snap.safetyAccepted}>
        {snap.sunset?.warn && <p className="mb-3 rounded-lg bg-amber-950/60 p-3 text-sm text-amber-200">{snap.sunset.message}</p>}
        <p className="text-stone-200">{SAFETY_TEXT}</p>
        <p className="mt-2 text-sm text-stone-400">
          L&apos;application ne vous dit jamais où aller&nbsp;: c&apos;est vous qui choisissez le chemin.
        </p>
        <label className="mt-4 flex items-center gap-3 text-stone-100">
          <input
            type="checkbox"
            className="h-6 w-6 accent-orange-500"
            checked={snap.safetyAccepted}
            onChange={(e) => session.acceptSafety(e.target.checked)}
          />
          J&apos;ai compris
        </label>
      </Step>

      <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-nuit via-nuit to-transparent px-5 pt-8 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={!session.canStart}
          onClick={() => session.depart()}
          className="mx-auto block w-full max-w-md rounded-2xl bg-braise py-5 text-2xl font-bold text-black disabled:opacity-30"
        >
          {snap.engine?.status === "en_pause" ? "Reprendre" : "Partir"}
        </button>
      </div>
    </main>
  );
}
