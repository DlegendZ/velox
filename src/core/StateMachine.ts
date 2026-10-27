export type State =
  | "title"
  | "menu"
  | "garage"
  | "modes"
  | "tracks"
  | "career"
  | "prerace"
  | "race"
  | "pause"
  | "results"
  | "settings"
  | "photo"
  | "replay"
  | "profile"
  | "lobby";
export class StateMachine {
  current: State = "title";
  previous: State = "title";
  constructor(private changed: (s: State, p: State) => void) {}
  go(s: State) {
    const p = this.current;
    this.previous = p;
    this.current = s;
    this.changed(s, p);
  }
}
