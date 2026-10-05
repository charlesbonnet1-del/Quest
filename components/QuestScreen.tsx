"use client";

import { useState } from "react";
import { ENVIRONMENT_LABELS } from "@/lib/content/schema";
import type { QuestSession, SessionSnapshot } from "@/lib/session/session";
import { EnvironmentPicker } from "./EnvironmentPicker";

type Icon = "parle" | "cherche" | "marche" | "pause";

function StatusIcon({ icon }: { icon: Icon }) {
  const common = "h-16 w-16 text-stone-500";
  switch (icon) {
    case "parle":
      return (
        <svg viewBox="0 0 24 24" className={`${common} animate-pulse`} fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <path d="M4 9v6h4l5 4V5L8 9H4z" />
          <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />
        </svg>
      );
    case "cherche":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "pause":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="currentColor" aria-hidden>
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <path d="M8 3c1.7 0 2.5 2 2.5 4.5S9.5 12 8 12 5.5 10 5.5 7.5 6.3 3 8 3zM16 9c1.7 0 2.5 2 2.5 4.5S17.5 18 16 18s-2.5-2-2.5-4.5S14.3 9 16 9z" />
          <path d="M6 14.5h4M14 20.5h4" />
        </svg>
      );
  }
}

const btn = "rounded-2xl border border-stone-800 bg-ardoise py-5 text-lg font-semibold text-stone-300 active:bg-stone-800";

export function QuestScreen({ session, snap }: { session: QuestSession; snap: SessionSnapshot }) {
  const [confirm, setConfirm] = useState<null | "fatigue" | "terminer">(null);
  const [showEnv, setShowEnv] = useState(false);
  const eng = snap.engine;
  if (!eng || !snap.bundle) return null;
  const quest = snap.bundle.quest;
  const paused = eng.status === "en_pause";
  const ch = eng.challenge;
  const icon: Icon = paused ? "pause" : snap.speaking ? "parle" : ch ? "cherche" : "marche";
  const label = paused
    ? "En pause"
    : snap.speaking
      ? `${quest.heros.nom} parle…`
      : ch?.phase === "confirmation"
        ? "Défi en cours"
        : ch
          ? "À vous de jouer !"
          : "En marche";
  const env = eng.envOverride ?? eng.env;
  const weakGps = !snap.sim && snap.position && snap.position.accuracy > 30;

  return (
    <main className="flex min-h-dvh flex-col bg-black px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] select-none">
      <header className="text-center">
        <p className="text-sm tracking-widest text-stone-600 uppercase">{quest.titre}</p>
        <p className="mt-1 text-2xl font-semibold text-braise/70">{quest.heros.nom}</p>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center" aria-live="polite">
        <StatusIcon icon={icon} />
        <p className="text-lg text-stone-500">{label}</p>
        {snap.audioSource === "voix" && snap.speaking && <p className="text-xs text-stone-600">(voix du téléphone)</p>}
        {weakGps && <p className="text-xs text-amber-700">Signal GPS faible</p>}
        {snap.autoPaused && paused && (
          <p className="max-w-xs rounded-xl bg-stone-900 p-4 text-stone-300">
            La quête s&apos;est mise en pause pendant que l&apos;écran était éteint ou que l&apos;app était cachée. Appuyez sur
            «&nbsp;Reprendre&nbsp;» quand vous êtes prêts.
          </p>
        )}
        {ch?.phase === "confirmation" && !paused && (
          <button
            type="button"
            onClick={() => session.confirmChallenge()}
            className="mt-2 w-full max-w-xs rounded-3xl bg-emerald-700 py-8 text-3xl font-bold text-white active:bg-emerald-600"
          >
            C&apos;est fait&nbsp;!
          </button>
        )}
      </section>

      {confirm ? (
        <div className="mb-4 rounded-2xl border border-stone-800 bg-ardoise p-5 text-center">
          <p className="text-lg text-stone-200">
            {confirm === "fatigue" ? `${quest.heros.nom} va conclure l'aventure maintenant.` : "Arrêter la quête tout de suite ?"}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button type="button" className={btn} onClick={() => setConfirm(null)}>
              Annuler
            </button>
            <button
              type="button"
              className="rounded-2xl bg-braise/80 py-5 text-lg font-bold text-black"
              onClick={() => {
                if (confirm === "fatigue") session.tired();
                else session.finish();
                setConfirm(null);
              }}
            >
              {confirm === "fatigue" ? "Conclure" : "Terminer"}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <button type="button" className={`${btn} col-span-2 py-7 text-2xl`} onClick={() => (paused ? session.resume() : session.pause())}>
            {paused ? "Reprendre" : "Pause"}
          </button>
          <button type="button" className={btn} disabled={paused} onClick={() => session.repeat()}>
            Répéter
          </button>
          <button type="button" className={btn} onClick={() => setConfirm("fatigue")}>
            On est fatigués
          </button>
          <button type="button" className={`${btn} col-span-2 py-4 text-base text-stone-500`} onClick={() => setConfirm("terminer")}>
            Terminer
          </button>
        </div>
      )}

      <footer className="mt-4 text-center">
        <button type="button" className="text-sm text-stone-700 underline underline-offset-4" onClick={() => setShowEnv((v) => !v)}>
          {ENVIRONMENT_LABELS[env]} · on est plutôt…
        </button>
        {showEnv && (
          <div className="mt-3 text-left">
            <EnvironmentPicker
              compact
              detected={eng.env}
              override={eng.envOverride}
              onPick={(e) => {
                session.setEnvironment(e);
                setShowEnv(false);
              }}
            />
          </div>
        )}
      </footer>
    </main>
  );
}
