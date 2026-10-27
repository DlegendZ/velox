import { TRACK_SECTORS, type TrackGeometry } from "./TrackGeometry";
import { Vector3, type Quaternion } from "three";
const nose = new Vector3();
export function noseProgress(
  track: TrackGeometry,
  position: Vector3,
  quaternion: Quaternion,
  length: number,
  hint = -1,
) {
  nose
    .set(0, 0, length / 2)
    .applyQuaternion(quaternion)
    .add(position);
  return track.nearest(nose, hint);
}
export class Checkpoints {
  expected = 1;
  passed = 0;
  lap = 1;
  lapStart = 0;
  times: number[] = [];
  lastSafe = 0;
  wrongWay = false;
  private lastT = 0;
  constructor(private sectors = TRACK_SECTORS) {}
  update(t: number, time: number, forwardDot: number) {
    const sector = Math.floor(t * this.sectors) % this.sectors;
    this.wrongWay = forwardDot < -0.3;
    let result: "checkpoint" | "lap" | null = null;
    if (sector === this.expected && !this.wrongWay) {
      this.passed++;
      this.lastSafe = t;
      this.expected = (this.expected + 1) % this.sectors;
      result = "checkpoint";
      if (this.expected === 1) {
        this.times.push(time - this.lapStart);
        this.lapStart = time;
        this.lap++;
        result = "lap";
      }
    }
    this.lastT = t;
    return result;
  }
  get progress() {
    return this.passed / this.sectors;
  }
}
