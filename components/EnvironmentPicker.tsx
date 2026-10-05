"use client";

import { ENVIRONMENT_LABELS, ENVIRONMENTS, type Environment } from "@/lib/content/schema";

/** Correction manuelle « On est plutôt... » (null = détection automatique). */
export function EnvironmentPicker({
  detected,
  override,
  onPick,
  compact = false,
}: {
  detected: Environment;
  override: Environment | null;
  onPick: (env: Environment | null) => void;
  compact?: boolean;
}) {
  const options: Array<Environment | null> = [null, ...ENVIRONMENTS];
  return (
    <div className={`grid grid-cols-2 gap-2 ${compact ? "text-sm" : ""}`}>
      {options.map((env) => {
        const active = env === override;
        const label = env === null ? `Automatique (${ENVIRONMENT_LABELS[detected].toLowerCase()})` : ENVIRONMENT_LABELS[env];
        return (
          <button
            key={env ?? "auto"}
            type="button"
            onClick={() => onPick(env)}
            aria-pressed={active}
            className={`rounded-xl border px-3 py-3 text-left ${
              active ? "border-braise text-braise" : "border-stone-800 text-stone-300"
            } ${env === null ? "col-span-2" : ""}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
