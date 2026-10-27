import { Box3, Vector3 } from "three";
import type { RaceManager } from "../game/RaceManager";

const cache = new WeakMap<
  RaceManager,
  { canvas: HTMLCanvasElement; cx: number; cz: number; scale: number }
>();
export function drawRaceMap(canvas: HTMLCanvasElement, r: RaceManager) {
  let base = cache.get(r);
  if (!base) {
    const bounds = new Box3().setFromPoints(r.track.points),
      size = bounds.getSize(new Vector3()),
      center = bounds.getCenter(new Vector3()),
      scale = 205 / Math.hypot(size.x, size.z);
    const art = document.createElement("canvas");
    art.width = art.height = 260;
    const b = art.getContext("2d")!;
    b.lineCap = "round";
    b.lineJoin = "round";
    for (let i = 0; i < r.track.samples; i += 5) {
      const t = i / r.track.samples,
        p = r.track.at(t).point,
        q = r.track.at((i + 5) / r.track.samples).point;
      const tunnel = r.track.inSection("tunnel", t),
        bridge = r.track.inSection("bridge", t);
      b.strokeStyle = bridge ? "#f5f7fa" : tunnel ? "#7f8a99" : "#b9c2cf";
      b.lineWidth = bridge ? 4 : 2.5;
      b.setLineDash(tunnel ? [3, 3] : []);
      b.beginPath();
      b.moveTo((p.x - center.x) * scale + 130, (p.z - center.z) * scale + 130);
      b.lineTo((q.x - center.x) * scale + 130, (q.z - center.z) * scale + 130);
      b.stroke();
    }
    base = { canvas: art, cx: center.x, cz: center.z, scale };
    cache.set(r, base);
  }
  const ctx = canvas.getContext("2d")!,
    { cx, cz, scale } = base;
  const forward = new Vector3(0, 0, 1).applyQuaternion(r.player.quaternion),
    angle = Math.atan2(forward.x, forward.z) - Math.PI;
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  const point = (x: number, z: number) => {
    const dx = (x - cx) * scale,
      dz = (z - cz) * scale;
    return [130 + cos * dx - sin * dz, 130 + sin * dx + cos * dz];
  };
  ctx.clearRect(0, 0, 260, 260);
  ctx.save();
  ctx.translate(130, 130);
  ctx.rotate(angle);
  ctx.drawImage(base.canvas, -130, -130);
  ctx.restore();
  const dot = (
    x: number,
    z: number,
    color: string,
    radius: number,
    initial = "",
  ) => {
    const [px, py] = point(x, z);
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#07090d";
    ctx.lineWidth = 2;
    ctx.stroke();
    if (initial) {
      ctx.font = "600 12px Inter";
      ctx.fillStyle = "#f5f7fa";
      ctx.textAlign = "center";
      ctx.strokeStyle = "#07090d";
      ctx.lineWidth = 3;
      ctx.strokeText(initial, px, py - 10);
      ctx.fillText(initial, px, py - 10);
    }
  };
  r.vehicles.forEach((v, i) => {
    if (i && !r.ai[i - 1].eliminated)
      dot(v.position.x, v.position.z, r.colors[i], 4);
  });
  for (const remote of r.remotes.values())
    dot(
      remote.position.x,
      remote.position.z,
      "#4fd8ff",
      5,
      remote.name.charAt(0),
    );
  if (r.config.mode === "roam")
    for (const token of r.track.tokens)
      if (token.visible) dot(token.position.x, token.position.z, "#ffc94a", 2);
  const [px, py] = point(r.player.position.x, r.player.position.z);
  ctx.beginPath();
  ctx.moveTo(px, py - 9);
  ctx.lineTo(px + 6, py + 7);
  ctx.lineTo(px, py + 4);
  ctx.lineTo(px - 6, py + 7);
  ctx.closePath();
  ctx.fillStyle = "#c6ff3d";
  ctx.strokeStyle = "#07090d";
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
}
