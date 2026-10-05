"use client";

import { useEffect, useState } from "react";
import type { QuestSession, SessionSnapshot } from "@/lib/session/session";
import { parseGpx, type SimStatus } from "@/lib/sim/provider";
import { SIM_ROUTES } from "@/lib/sim/routes";

/** Panneau de simulation (mode ?sim=1) : trajets prédéfinis, GPX, avance manuelle, vitesse. */
export function SimPanel({ session, snap }: { session: QuestSession; snap: SessionSnapshot }) {
  const sim = session.simProvider;
  // Replié par défaut sur téléphone pour ne pas masquer les boutons.
  const [open, setOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 640);
  const [st, setSt] = useState<SimStatus | null>(null);
  const [start, setStart] = useState("48.8796, 2.3090");
  useEffect(() => sim?.subscribe(setSt), [sim]);
  if (!sim) return null;
  const eng = snap.engine;

  return (
    <aside
      className={`fixed top-2 right-2 z-50 max-h-[85dvh] max-w-[calc(100vw-1rem)] overflow-auto rounded-xl border border-sky-900 bg-slate-950/95 text-xs text-sky-100 shadow-xl ${
        open ? "w-80 p-3" : "px-2 py-1"
      }`}
    >
      <button type="button" aria-label="Simulation" className="w-full text-left font-bold text-sky-300" onClick={() => setOpen((o) => !o)}>
        {open ? "▾ Simulation" : "SIM"}
        {eng ? ` · ${Math.round(eng.distanceM)} m${open ? ` · ${eng.envOverride ?? eng.env} · ${eng.status}` : ""}` : ""}
      </button>
      {open && (
        <div className="mt-2 space-y-3">
          <div>
            <p className="mb-1 text-sky-400">Trajet prédéfini</p>
            <div className="flex flex-wrap gap-1">
              {SIM_ROUTES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  title={r.description}
                  onClick={() => session.setSimRoute(r.id)}
                  className={`rounded px-2 py-1 ${snap.simRouteId === r.id && st?.routeId === r.id ? "bg-sky-700" : "bg-slate-800"}`}
                >
                  {r.nom}
                </button>
              ))}
            </div>
            <label className="mt-1 block">
              GPX&nbsp;:{" "}
              <input
                type="file"
                accept=".gpx,application/gpx+xml"
                className="w-48"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const pts = parseGpx(await f.text());
                  if (pts.length > 1) {
                    sim.loadRoute(`gpx:${f.name}`, pts);
                    void session.redetect();
                  }
                }}
              />
            </label>
          </div>
          <div>
            <p className="mb-1 text-sky-400">Départ libre (lat, lon)</p>
            <div className="flex gap-1">
              <input value={start} onChange={(e) => setStart(e.target.value)} className="w-full rounded bg-slate-800 px-2 py-1" />
              <button
                type="button"
                className="rounded bg-slate-800 px-2"
                onClick={() => {
                  const [lat, lon] = start.split(/[,; ]+/).map(Number);
                  if (Number.isFinite(lat) && Number.isFinite(lon)) {
                    sim.setStart({ lat: lat as number, lon: lon as number });
                    void session.redetect();
                  }
                }}
              >
                OK
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <button type="button" className="rounded bg-sky-700 px-2 py-1" onClick={() => (st?.playing ? sim.pausePlayback() : sim.play())}>
              {st?.playing ? "⏸ Stop" : "▶ Marcher"}
            </button>
            {[20, 50, 200].map((m) => (
              <button key={m} type="button" className="rounded bg-slate-800 px-2 py-1" onClick={() => sim.advance(m)}>
                +{m} m
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2">
            Vitesse ×
            <select value={st?.speed ?? 1} onChange={(e) => sim.setSpeed(Number(e.target.value))} className="rounded bg-slate-800 px-1">
              {[1, 2, 5, 10, 20].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            {st && st.routeLengthM > 0 && (
              <span className="text-sky-400">
                {Math.round(st.routeDistanceM)} / {Math.round(st.routeLengthM)} m
              </span>
            )}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={snap.simFixture} onChange={(e) => session.setSimFixture(e.target.checked)} />
            Données OSM de test (hors ligne, sans Overpass)
          </label>
          {snap.download && (
            <p className="text-sky-400">
              Audio en cache : {snap.download.done}/{snap.download.total}
            </p>
          )}
          <div className="max-h-40 overflow-auto rounded bg-black/50 p-2 font-mono text-[10px] leading-tight text-sky-200">
            {snap.logs.length === 0 ? "Journal vide (aussi dans la console)." : snap.logs.slice(-30).map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>
      )}
    </aside>
  );
}
