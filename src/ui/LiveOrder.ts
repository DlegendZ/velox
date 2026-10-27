import type { Standing } from "../game/RaceManager";
import { TRACK_SECTORS } from "../game/TrackGeometry";

/** The HUD and pause overlay must describe the same live race order. */
export function liveGap(row: Standing, player: Standing, trackLength: number) {
  if (row.out) return "OUT";
  if (row.time !== null && !row.estimated) return "FIN";
  if (row === player) return "";
  const metres = Math.round(
    (Math.abs(row.progress - player.progress) * trackLength) / TRACK_SECTORS,
  );
  return `${row.progress > player.progress ? "+" : "−"}${metres} m`;
}
