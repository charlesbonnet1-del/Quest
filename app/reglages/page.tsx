"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clear } from "idb-keyval";
import { AUDIO_CACHE } from "@/lib/offline/pack";
import { isSimEnabled, setSimEnabled } from "@/lib/sim/flag";

export default function SettingsPage() {
  const [sim, setSim] = useState(false);
  const [usage, setUsage] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setSim(isSimEnabled());
    navigator.storage
      ?.estimate?.()
      .then((e) => setUsage(`${((e.usage ?? 0) / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo utilisés`))
      .catch(() => {});
  }, []);

  return (
    <main className="mx-auto max-w-md px-6 pt-10 pb-16 text-stone-300">
      <Link href="/" className="text-sm text-stone-500">
        ← Accueil
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-braise">Réglages</h1>

      <section className="mt-8">
        <h2 className="font-semibold text-stone-100">Données hors ligne</h2>
        <p className="mt-1 text-sm">{usage ?? "…"}</p>
        <button
          type="button"
          className="mt-3 rounded-xl border border-stone-700 px-4 py-3"
          onClick={async () => {
            await clear().catch(() => {});
            await caches.delete(AUDIO_CACHE).catch(() => {});
            setMsg("Quêtes, audio et données de lieux effacés de ce téléphone.");
          }}
        >
          Tout effacer
        </button>
        {msg && <p className="mt-2 text-sm text-emerald-300">{msg}</p>}
      </section>

      <section className="mt-10">
        <h2 className="font-semibold text-stone-100">Développeur</h2>
        <label className="mt-3 flex items-center gap-3">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={sim}
            onChange={(e) => {
              setSimEnabled(e.target.checked);
              setSim(e.target.checked);
            }}
          />
          Mode simulation (positions simulées, trajets prédéfinis)
        </label>
        <p className="mt-2 text-sm text-stone-500">Aussi activable avec «&nbsp;?sim=1&nbsp;» dans l&apos;adresse.</p>
      </section>
    </main>
  );
}
