/** Envoi des retours depuis le téléphone, avec file d'attente si le réseau manque. */
import { get, set } from "idb-keyval";
import type { Feedback } from "./schema";

const OUTBOX = "retours:attente";

async function post(f: Feedback): Promise<boolean> {
  try {
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    });
    // 400 : invalide, inutile de réessayer.
    return res.ok || res.status === 400;
  } catch {
    return false;
  }
}

/** Renvoie true si envoyé tout de suite, false si mis en attente. */
export async function sendFeedback(f: Feedback): Promise<boolean> {
  if (await post(f)) return true;
  const pending = (await get<Feedback[]>(OUTBOX).catch(() => undefined)) ?? [];
  await set(OUTBOX, [...pending, f].slice(-20)).catch(() => {});
  return false;
}

export async function flushFeedbackOutbox(): Promise<void> {
  const pending = (await get<Feedback[]>(OUTBOX).catch(() => undefined)) ?? [];
  if (!pending.length || !navigator.onLine) return;
  const left: Feedback[] = [];
  for (const f of pending) if (!(await post(f))) left.push(f);
  await set(OUTBOX, left).catch(() => {});
}
