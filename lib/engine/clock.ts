/** Horloge abstraite : réelle sur le terrain, accélérable en simulation. */
export interface Clock {
  now(): number;
}

export const realClock: Clock = { now: () => Date.now() };

/** Horloge manuelle pour les tests et le rejeu en console. */
export class ManualClock implements Clock {
  constructor(private t = 0) {}
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
  set(ms: number): void {
    this.t = ms;
  }
}
