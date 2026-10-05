"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { QuestSummary } from "@/lib/content/server";
import { flushFeedbackOutbox } from "@/lib/feedback/client";
import { QuestSession } from "@/lib/session/session";
import { isSimEnabled } from "@/lib/sim/flag";
import { EndScreen } from "./EndScreen";
import { Preparation } from "./Preparation";
import { QuestScreen } from "./QuestScreen";
import { SimPanel } from "./SimPanel";

/** Préparation, quête et fin sur une seule page : aucune navigation réseau pendant la sortie. */
export function QuestRunner({ summary }: { summary: QuestSummary }) {
  const [session, setSession] = useState<QuestSession | null>(null);

  useEffect(() => {
    const s = new QuestSession(summary.id, isSimEnabled());
    setSession(s);
    void s.init();
    void flushFeedbackOutbox();
    return () => s.destroy();
  }, [summary.id]);

  if (!session) return <main className="min-h-dvh bg-nuit" />;
  return <Screens session={session} summary={summary} />;
}

function Screens({ session, summary }: { session: QuestSession; summary: QuestSummary }) {
  const snap = useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot);
  return (
    <>
      {snap.phase === "preparation" && <Preparation session={session} snap={snap} summary={summary} />}
      {snap.phase === "quete" && <QuestScreen session={session} snap={snap} />}
      {snap.phase === "fin" && <EndScreen snap={snap} summary={summary} />}
      {snap.sim && snap.phase !== "fin" && <SimPanel session={session} snap={snap} />}
    </>
  );
}
