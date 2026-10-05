"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { QuestSummary } from "@/lib/content/server";
import { isSimEnabled } from "@/lib/sim/flag";

export function QuestPicker({ quests }: { quests: QuestSummary[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(quests[0]?.id ?? "");
  const [sim, setSim] = useState(false);
  useEffect(() => setSim(isSimEnabled()), []);

  return (
    <section className="mt-10">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-stone-400 uppercase">Choisir une quête</h2>
      <ul className="space-y-3">
        {quests.map((q) => (
          <li key={q.id}>
            <button
              type="button"
              onClick={() => setSelected(q.id)}
              aria-pressed={selected === q.id}
              className={`w-full rounded-2xl border p-4 text-left transition ${
                selected === q.id ? "border-braise bg-ardoise" : "border-stone-800 bg-transparent"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-lg font-semibold text-stone-100">{q.titre}</span>
                {q.provisoire && (
                  <span className="shrink-0 rounded bg-amber-900/60 px-2 py-0.5 text-xs text-amber-200">provisoire</span>
                )}
              </div>
              <div className="mt-1 text-sm text-stone-400">
                Avec {q.heros} · {q.dureeEstimeeMin} min
                {q.distanceEstimeeM ? ` · ~${(q.distanceEstimeeM / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km` : ""} ·{" "}
                {q.age.min}-{q.age.max} ans
              </div>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={!selected}
        onClick={() => router.push(`/jouer/${selected}${sim ? "?sim=1" : ""}`)}
        className="mt-6 w-full rounded-2xl bg-braise py-5 text-xl font-bold text-black disabled:opacity-40"
      >
        Préparer le départ
      </button>
      {sim && <p className="mt-3 text-center text-sm text-sky-400">Mode simulation activé</p>}
    </section>
  );
}
