export interface Controls {
  throttle: number;
  brake: number;
  /** Screen convention: +1 turns right, -1 turns left in the chase camera. */
  steer: number;
  handbrake: boolean;
  nitro: boolean;
  rear: boolean;
}
export class Input {
  keys = new Set<string>();
  touch = new Set<string>();
  steer = 0;
  deadzone = 0.1;
  dragSteer: number | null = null;
  private dragId: number | null = null;
  private dragOrigin = 0;
  onAction = (action: string) => {};
  capture: ((key: string) => void) | null = null;
  private padButtons: boolean[] = [];
  constructor(private bindings: () => Record<string, string>) {
    window.addEventListener("keydown", (e) => {
      if (this.capture) {
        e.preventDefault();
        this.capture(e.code);
        return;
      }
      if ((e.target as HTMLElement).matches("input,select,textarea")) {
        if (e.code === "Escape") this.onAction(e.code);
        return;
      }
      if (
        ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
          e.code,
        )
      )
        e.preventDefault();
      if (!this.keys.has(e.code)) this.onAction(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.clear());
    document.addEventListener("pointerdown", (e) => {
      const pad = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-drag-pad]",
      );
      if (pad && this.dragId === null) {
        e.preventDefault();
        pad.setPointerCapture(e.pointerId);
        this.dragId = e.pointerId;
        this.dragOrigin = e.clientX;
        this.dragSteer = 0;
        pad.classList.add("pressed");
        return;
      }
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-touch]");
      if (el) {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        this.touch.add(el.dataset.touch!);
        el.classList.add("pressed");
      }
    });
    document.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.dragId) return;
      this.dragSteer = Math.max(
        -1,
        Math.min(1, (e.clientX - this.dragOrigin) / 80),
      );
      const pad = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-drag-pad]",
      );
      pad?.style.setProperty("--drag", `${this.dragSteer * 60}px`);
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      document.addEventListener(type, (e) => {
        if ((e as PointerEvent).pointerId === this.dragId) {
          this.dragId = null;
          this.dragSteer = null;
          const pad = (e.target as HTMLElement).closest<HTMLElement>(
            "[data-drag-pad]",
          );
          pad?.classList.remove("pressed");
          pad?.style.setProperty("--drag", "0px");
        }
        const el = (e.target as HTMLElement).closest<HTMLElement>(
          "[data-touch]",
        );
        if (el) {
          this.touch.delete(el.dataset.touch!);
          el.classList.remove("pressed");
        }
      });
  }
  clear() {
    this.keys.clear();
    this.touch.clear();
    this.steer = 0;
    this.dragId = null;
    this.dragSteer = null;
  }
  read(dt: number): Controls {
    const b = this.bindings();
    const has = (a: string, extra?: string) =>
      this.keys.has(b[a]) ||
      (!!extra && this.keys.has(extra)) ||
      this.touch.has(a);
    const pad = navigator.getGamepads?.().find((p) => p?.connected);
    let steer =
      Number(has("right", "ArrowRight")) - Number(has("left", "ArrowLeft"));
    let throttle = Number(has("throttle", "ArrowUp")),
      brake = Number(has("brake", "ArrowDown"));
    let handbrake = has("handbrake"),
      nitro = has("nitro") || this.keys.has("ShiftRight"),
      rear = this.keys.has("KeyX");
    let analog = this.dragSteer !== null;
    if (analog) steer = this.dragSteer!;
    if (pad) {
      this.pad = pad;
      // Rescaled dead zone plus a gentle curve: precise near centre, full lock at the edge.
      const axis = pad.axes[0] ?? 0,
        dead = this.deadzone;
      if (Math.abs(axis) > dead) {
        const x = (Math.abs(axis) - dead) / (1 - dead);
        steer = Math.sign(axis) * x ** 1.35;
        analog = true;
      }
      const trigger = (v: number) => (v < 0.04 ? 0 : (v - 0.04) / 0.96);
      throttle = Math.max(throttle, trigger(pad.buttons[7]?.value ?? 0));
      brake = Math.max(brake, trigger(pad.buttons[6]?.value ?? 0));
      handbrake ||= !!pad.buttons[0]?.pressed || !!pad.buttons[2]?.pressed;
      nitro ||= !!pad.buttons[1]?.pressed;
      rear ||= !!pad.buttons[11]?.pressed;
      const map: Record<number, string> = {
        1: "GamepadBack",
        3: "KeyC",
        4: "KeyQ",
        5: "KeyE",
        8: "KeyR",
        9: "Escape",
        12: "ArrowUp",
        13: "ArrowDown",
        14: "ArrowLeft",
        15: "ArrowRight",
        0: "GamepadEnter",
      };
      for (const [i, key] of Object.entries(map)) {
        const pressed = !!pad.buttons[+i]?.pressed;
        if (pressed && !this.padButtons[+i]) this.onAction(key);
        this.padButtons[+i] = pressed;
      }
    }
    if (analog) this.steer = steer;
    else {
      // Digital keys ramp in quickly and snap back to centre even faster.
      const returning =
        steer === 0 ||
        (this.steer !== 0 && Math.sign(steer) !== Math.sign(this.steer));
      const rate = returning ? 11 : 6.5;
      const delta = steer - this.steer;
      this.steer += Math.sign(delta) * Math.min(Math.abs(delta), rate * dt);
    }
    return { throttle, brake, steer: this.steer, handbrake, nitro, rear };
  }
  private pad: Gamepad | null = null;
  /** Controller rumble (where the browser supports it). */
  rumble(strength: number, ms = 120) {
    const actuator = (
      this.pad as Gamepad & {
        vibrationActuator?: {
          playEffect: (type: string, params: object) => Promise<unknown>;
        };
      }
    )?.vibrationActuator;
    void actuator
      ?.playEffect("dual-rumble", {
        duration: ms,
        strongMagnitude: Math.min(1, strength),
        weakMagnitude: Math.min(1, strength * 0.6),
      })
      .catch(() => {});
  }
}
