import { TUNING } from "../data/tuning";
export class Loop {
  private previous = 0;
  private accumulator = 0;
  private frame = 0;
  running = true;
  fps = 60;
  constructor(
    private fixed: (dt: number) => void,
    private render: (dt: number, alpha: number) => void,
  ) {}
  start() {
    const tick = (time: number) => {
      if (!this.running) return;
      const dt = this.previous
        ? Math.min((time - this.previous) / 1000, 0.1)
        : 0;
      this.previous = time;
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= TUNING.step && steps < TUNING.maxSubsteps) {
        this.fixed(TUNING.step);
        this.accumulator -= TUNING.step;
        steps++;
      }
      if (steps === TUNING.maxSubsteps) this.accumulator = 0;
      this.fps += (1 / Math.max(dt, 0.001) - this.fps) * 0.04;
      this.render(dt, this.accumulator / TUNING.step);
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }
}
