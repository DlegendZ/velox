export function controlHintsVisible(
  time: number,
  hintRace: number,
  force: boolean,
) {
  return force || (hintRace > 0 && hintRace <= 3 && time < 20);
}

/** Keep the player and adjacent rivals without exceeding six physical rows. */
export function standingsRows(
  total: number,
  player: number,
  height: number,
): (number | null)[] {
  if (height < 500)
    return Array.from({ length: Math.min(3, total) }, (_, i) => i);
  const priority =
    height <= 800
      ? [0, 1, 2, player, player - 1, player + 1]
      : [0, 1, 2, 3, 4, player, 5];
  const chosen = [...new Set(priority.filter((i) => i >= 0 && i < total))];
  const rows = () =>
    chosen
      .slice()
      .sort((a, b) => a - b)
      .flatMap((i, n, all) => (n && i > all[n - 1] + 1 ? [null, i] : [i]));
  while (rows().length > 6) chosen.pop();
  return rows();
}

type Notice = { text: string; at: number; active: boolean };
/** Short notices share two slots; unchanged sustained conditions do not retrigger. */
export class HUDNotices {
  private notices = new Map<string, Notice>();
  update(values: Record<string, string>, now: number) {
    for (const [id, text] of Object.entries(values)) {
      const old = this.notices.get(id);
      if (text && (!old || !old.active || text !== old.text))
        this.notices.set(id, { text, at: now, active: true });
      else if (old) old.active = !!text;
    }
    return [...this.notices]
      .filter(([, n]) => now - n.at < 1800)
      .slice(0, 2)
      .map(([id, n]) => ({
        id,
        text: n.text,
        opacity: Math.max(
          0,
          Math.min(1, (now - n.at) / 200, (1800 - now + n.at) / 200),
        ),
      }));
  }
}
