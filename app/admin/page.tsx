"use client";

import { useState } from "react";
import type { StoredFeedback } from "@/lib/feedback/schema";

/** Lecture des retours, protégée par ADMIN_SECRET (jamais stocké : saisi à chaque fois). */
export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [data, setData] = useState<{ stockage: string; total: number; items: StoredFeedback[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.status);
      setData(json);
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const items = data?.items ?? [];
  const notes = items.map((i) => i.note).filter((n): n is number => n !== null);
  const moy = notes.length ? (notes.reduce((a, b) => a + b, 0) / notes.length).toFixed(1) : "–";
  const bouge = items.filter((i) => i.aBouge !== null);
  const pctBouge = bouge.length ? Math.round((bouge.filter((i) => i.aBouge).length / bouge.length) * 100) : null;

  return (
    <main className="mx-auto max-w-5xl px-4 pt-8 pb-16 text-stone-300">
      <h1 className="text-2xl font-bold text-braise">Retours (administration)</h1>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <input
          type="password"
          autoComplete="off"
          placeholder="Secret d'administration"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          className="w-72 rounded-lg border border-stone-700 bg-ardoise px-3 py-2"
        />
        <button type="submit" disabled={!secret || loading} className="rounded-lg bg-braise px-4 py-2 font-semibold text-black disabled:opacity-40">
          {loading ? "…" : "Afficher"}
        </button>
      </form>
      {error && <p className="mt-4 text-red-300">Erreur : {error}</p>}
      {data && (
        <>
          <p className="mt-6 text-sm text-stone-400">
            {data.total} retour(s) · note moyenne {moy}/5 · a couru ou exploré : {pctBouge === null ? "–" : `${pctBouge} %`} · stockage :{" "}
            {data.stockage}
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-stone-500">
                <tr>
                  <th className="p-2">Reçu le</th>
                  <th className="p-2">Quête</th>
                  <th className="p-2">Lieu</th>
                  <th className="p-2">Durée</th>
                  <th className="p-2">Distance</th>
                  <th className="p-2">Note</th>
                  <th className="p-2">A bougé</th>
                  <th className="p-2">Fin</th>
                  <th className="p-2">Commentaire</th>
                </tr>
              </thead>
              <tbody>
                {items.map((f, i) => (
                  <tr key={i} className="border-t border-stone-800 align-top">
                    <td className="p-2 whitespace-nowrap">{new Date(f.recuLe).toLocaleString("fr-FR")}</td>
                    <td className="p-2">{f.questId}</td>
                    <td className="p-2">{f.environnement}</td>
                    <td className="p-2">{Math.round(f.dureeS / 60)} min</td>
                    <td className="p-2">{f.distanceM} m</td>
                    <td className="p-2">{f.note ?? "–"}</td>
                    <td className="p-2">{f.aBouge === null ? "–" : f.aBouge ? "oui" : "non"}</td>
                    <td className="p-2">{f.fin ?? "–"}</td>
                    <td className="max-w-xs p-2 break-words">{f.commentaire ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
