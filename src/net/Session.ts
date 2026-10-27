import { CARS, carById } from "../data/cars";
import { TRACKS } from "../data/tracks";
import { cleanName, cleanVisual, type Visual } from "../core/Save";
import type { RaceConfig, NetPlayer } from "../game/RaceManager";
import type { Snapshot } from "../game/RemoteCar";
import { LocalHub, RtcLink, type Link } from "./Link";
export const PROTOCOL = 1;
export const MAX_PLAYERS = 6;
export interface LobbyPlayer {
  id: string;
  name: string;
  car: string;
  visual: Visual;
  ready: boolean;
  host: boolean;
  ping: number;
}
export type NetConfig = Pick<
  RaceConfig,
  "mode" | "track" | "laps" | "reverse" | "weather"
>;
type Message =
  | { t: "hello"; v: number; name: string; car: string; visual: Visual }
  | { t: "roster"; players: LobbyPlayer[]; config: NetConfig; you: string }
  | { t: "profile"; name: string; car: string; visual: Visual }
  | { t: "ready"; ready: boolean }
  | { t: "start"; config: NetConfig; grid: NetPlayer[] }
  | { t: "loaded" }
  | { t: "go" }
  | ({ t: "s"; id?: string } & Omit<Snapshot, "at">)
  | { t: "finish"; id?: string; time: number; best: number | null }
  | { t: "chat"; id?: string; text: string }
  | { t: "lobby" }
  | { t: "leave"; id?: string }
  | { t: "retire"; id?: string }
  | { t: "kick"; reason: string }
  | { t: "ping"; ts: number }
  | { t: "pong"; ts: number };
const finite = (n: unknown, fallback = 0) =>
  typeof n === "number" && Number.isFinite(n) ? n : fallback;
const tuple = <N extends number>(v: unknown, n: N) =>
  (Array.isArray(v) && v.length === n
    ? v.map((x) => finite(x))
    : Array(n).fill(0)) as never;
export const randomId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
/** Validates host-provided race settings. */
export function cleanConfig(raw: unknown, fallback: NetConfig): NetConfig {
  const c = (raw ?? {}) as Partial<NetConfig>;
  return {
    mode: c.mode === "roam" ? "roam" : "race",
    track: TRACKS.some((t) => t.id === c.track) ? c.track! : fallback.track,
    laps: Math.max(1, Math.min(5, Math.floor(finite(c.laps, 3)))),
    reverse: c.reverse === true,
    weather: ["clear", "rain", "fog", "snow"].includes(c.weather ?? "")
      ? c.weather!
      : "clear",
  };
}
export interface SessionProfile {
  name: string;
  car: string;
  visual: Visual;
}
/**
 * Serverless lobby. The host keeps one link per guest and relays every guest message to the
 * others (star topology). Guests only ever talk to the host.
 */
export class NetSession {
  selfId: string;
  players: LobbyPlayer[] = [];
  config: NetConfig = {
    mode: "race",
    track: "neon_a",
    laps: 3,
    reverse: false,
    weather: "clear",
  };
  inRace = false;
  localRoom = "";
  closed = false;
  onChange = () => {};
  onStart = (_config: NetConfig, _grid: NetPlayer[]) => {};
  onGo = () => {};
  onState = (_id: string, _s: Snapshot) => {};
  onFinish = (_id: string, _time: number, _best: number | null) => {};
  onPlayerLeft = (_name: string, _id: string) => {};
  onPlayerJoined = (_name: string) => {};
  onChat = (_name: string, _text: string) => {};
  onLobby = () => {};
  onRetire = (_id: string) => {};
  onClosed = (_reason: string) => {};
  private links = new Map<string, Link>();
  private hub: LocalHub | null = null;
  private loaded = new Set<string>();
  private pingTimer = 0;
  private constructor(
    public role: "host" | "guest",
    private profile: SessionProfile,
  ) {
    this.selfId = role === "host" ? "host" : randomId();
    if (role === "host") {
      this.players.push(this.lobbyEntry(this.selfId, profile, true));
      this.pingTimer = window.setInterval(() => this.pingAll(), 2000);
    }
  }
  static host(profile: SessionProfile, config?: NetConfig) {
    const s = new NetSession("host", profile);
    if (config) s.config = cleanConfig(config, s.config);
    return s;
  }
  static guest(profile: SessionProfile) {
    return new NetSession("guest", profile);
  }
  get isHost() {
    return this.role === "host";
  }
  get self() {
    return this.players.find((p) => p.id === this.selfId);
  }
  get connected() {
    return this.isHost || [...this.links.values()].some((l) => l.open);
  }
  private lobbyEntry(id: string, p: SessionProfile, host = false): LobbyPlayer {
    return {
      id,
      name: cleanName(p.name),
      car: carById(p.car).id,
      visual: cleanVisual(p.visual, carById(p.car).id),
      ready: host,
      host,
      ping: 0,
    };
  }
  // ---------- connection setup ----------
  /** Host: create one invite (one guest per code). Returns the code and a function taking the reply. */
  async createInvite() {
    if (this.players.length + this.pendingCount() >= MAX_PLAYERS)
      throw new Error(`The grid is full (${MAX_PLAYERS} players).`);
    const link = new RtcLink();
    const code = await link.createOffer(this.selfId);
    this.pending.add(link);
    return {
      code,
      accept: async (reply: string) => {
        await link.acceptAnswer(reply);
        this.pending.delete(link);
        this.adopt(link, link.peer);
      },
      cancel: () => {
        this.pending.delete(link);
        link.close();
      },
    };
  }
  private pending = new Set<RtcLink>();
  private pendingCount() {
    return this.pending.size;
  }
  /** Guest: answer an invite. Resolves to the reply code the host must paste. */
  async answerInvite(code: string) {
    const link = new RtcLink();
    const reply = await link.acceptOffer(code, this.selfId);
    this.adopt(link, "host");
    return reply;
  }
  /** Host: allow guests from other tabs of this browser to join by room code. */
  openLocalRoom() {
    if (this.hub) return this.localRoom;
    this.localRoom = Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) =>
      "ABCDEFGHJKLMNPQRSTUVWXYZ"[b % 24],
    ).join("");
    this.hub = new LocalHub(this.localRoom, "host", true);
    this.hub.onconnect = (link) => this.adopt(link, link.peer);
    return this.localRoom;
  }
  /** Guest: join a host in another tab of this browser. */
  joinLocalRoom(room: string) {
    this.localRoom = room.trim().toUpperCase();
    this.hub = new LocalHub(this.localRoom, this.selfId, false);
    this.adopt(this.hub.connect(), "host");
    setTimeout(() => {
      if (!this.connected && !this.closed)
        this.close(`No host found for room ${this.localRoom} in this browser.`);
    }, 4000);
  }
  private adopt(link: Link, peer: string) {
    this.links.set(peer, link);
    link.onmessage = (data) => this.receive(peer, data);
    link.onopen = () => {
      if (!this.isHost) this.sendTo(link, this.helloMessage());
    };
    link.onclose = () => this.dropped(peer);
    if (link.open) link.onopen();
  }
  private helloMessage(): Message {
    return {
      t: "hello",
      v: PROTOCOL,
      name: this.profile.name,
      car: this.profile.car,
      visual: this.profile.visual,
    };
  }
  private dropped(peer: string) {
    this.links.delete(peer);
    if (this.closed) return;
    if (!this.isHost) {
      this.close("Lost connection to the host.");
      return;
    }
    const p = this.players.find((p) => p.id === peer);
    this.players = this.players.filter((p) => p.id !== peer);
    if (p) {
      this.broadcast({ t: "leave", id: peer });
      this.broadcastRoster();
      this.onPlayerLeft(p.name, peer);
      this.onChange();
      if (this.inRace) this.checkAllLoaded();
    }
  }
  // ---------- messaging ----------
  private sendTo(link: Link | undefined, msg: Message, reliable = true) {
    link?.send(JSON.stringify(msg), reliable);
  }
  /** Host → every guest (optionally except one). */
  private broadcast(msg: Message, except?: string, reliable = true) {
    const data = JSON.stringify(msg);
    for (const [peer, link] of this.links)
      if (peer !== except) link.send(data, reliable);
  }
  private send(msg: Message, reliable = true) {
    if (this.isHost) this.broadcast(msg, undefined, reliable);
    else this.sendTo(this.links.get("host"), msg, reliable);
  }
  private broadcastRoster() {
    for (const [peer, link] of this.links)
      this.sendTo(link, {
        t: "roster",
        players: this.players,
        config: this.config,
        you: peer,
      });
  }
  private receive(peer: string, data: string) {
    if (data.length > 16000) return;
    let msg: Message;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    if (this.isHost) this.hostReceive(peer, msg);
    else this.guestReceive(msg);
  }
  private hostReceive(peer: string, msg: Message) {
    const player = this.players.find((p) => p.id === peer);
    switch (msg.t) {
      case "hello": {
        if (msg.v !== PROTOCOL) {
          this.sendTo(this.links.get(peer), {
            t: "kick",
            reason: "Your game version does not match the host's.",
          });
          return;
        }
        if (this.inRace || this.players.length >= MAX_PLAYERS) {
          this.sendTo(this.links.get(peer), {
            t: "kick",
            reason: this.inRace
              ? "A race is in progress. Try again after it ends."
              : "The lobby is full.",
          });
          return;
        }
        if (player) return;
        const entry = this.lobbyEntry(peer, msg);
        this.players.push(entry);
        this.broadcastRoster();
        this.onPlayerJoined(entry.name);
        this.onChange();
        return;
      }
      case "profile":
        if (!player) return;
        Object.assign(player, this.lobbyEntry(peer, msg), {
          ready: player.ready,
          ping: player.ping,
        });
        this.broadcastRoster();
        this.onChange();
        return;
      case "ready":
        if (!player) return;
        player.ready = msg.ready === true;
        this.broadcastRoster();
        this.onChange();
        return;
      case "loaded":
        this.loaded.add(peer);
        this.checkAllLoaded();
        return;
      case "s": {
        if (!player || !this.inRace) return;
        const s = this.cleanSnapshot(msg);
        this.broadcast({ t: "s", id: peer, ...s }, peer, false);
        this.onState(peer, { ...s, at: performance.now() });
        return;
      }
      case "finish": {
        if (!player) return;
        const time = finite(msg.time),
          best = msg.best === null ? null : finite(msg.best);
        this.broadcast({ t: "finish", id: peer, time, best }, peer);
        this.onFinish(peer, time, best);
        return;
      }
      case "chat": {
        if (!player) return;
        const text = String(msg.text ?? "").slice(0, 80);
        this.broadcast({ t: "chat", id: peer, text }, peer);
        this.onChat(player.name, text);
        return;
      }
      case "retire":
        if (!player) return;
        this.broadcast({ t: "retire", id: peer }, peer);
        this.onRetire(peer);
        return;
      case "pong":
        if (player) player.ping = Math.round(performance.now() - finite(msg.ts));
        return;
      case "leave":
        this.links.get(peer)?.close();
        return;
    }
  }
  private guestReceive(msg: Message) {
    switch (msg.t) {
      case "roster":
        if (!Array.isArray(msg.players)) return;
        this.selfId = typeof msg.you === "string" ? msg.you : this.selfId;
        this.players = msg.players.slice(0, MAX_PLAYERS).map((p) => ({
          ...this.lobbyEntry(String(p.id), p, p.host === true),
          ready: p.ready === true,
          ping: finite(p.ping),
        }));
        this.config = cleanConfig(msg.config, this.config);
        this.onChange();
        return;
      case "start": {
        this.config = cleanConfig(msg.config, this.config);
        const grid = this.cleanGrid(msg.grid);
        this.inRace = true;
        this.onStart(this.config, grid);
        return;
      }
      case "go":
        this.onGo();
        return;
      case "s":
        if (typeof msg.id === "string" && msg.id !== this.selfId)
          this.onState(msg.id, { ...this.cleanSnapshot(msg), at: performance.now() });
        return;
      case "finish":
        if (typeof msg.id === "string")
          this.onFinish(
            msg.id,
            finite(msg.time),
            msg.best === null ? null : finite(msg.best),
          );
        return;
      case "chat": {
        const name =
          this.players.find((p) => p.id === msg.id)?.name ?? "PLAYER";
        this.onChat(name, String(msg.text ?? "").slice(0, 80));
        return;
      }
      case "leave": {
        const p = this.players.find((p) => p.id === msg.id);
        if (p) this.onPlayerLeft(p.name, p.id);
        return;
      }
      case "retire":
        if (typeof msg.id === "string") this.onRetire(msg.id);
        return;
      case "lobby":
        this.inRace = false;
        this.onLobby();
        return;
      case "kick":
        this.close(String(msg.reason ?? "Removed from the lobby."));
        return;
      case "ping":
        this.send({ t: "pong", ts: finite(msg.ts) });
        return;
    }
  }
  private cleanSnapshot(m: Partial<Omit<Snapshot, "at">>): Omit<Snapshot, "at"> {
    return {
      p: tuple(m.p, 3),
      q: tuple(m.q, 4),
      v: tuple(m.v, 3),
      sp: finite(m.sp),
      st: Math.max(-1, Math.min(1, finite(m.st))),
      fl: Math.floor(finite(m.fl)) & 15,
      pr: finite(m.pr),
      lap: Math.floor(finite(m.lap, 1)),
    };
  }
  private cleanGrid(raw: unknown): NetPlayer[] {
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, MAX_PLAYERS).map((p, i) => {
      const car = carById(String(p?.car)).id;
      return {
        id: String(p?.id ?? i),
        name: cleanName(p?.name),
        car,
        visual: cleanVisual(p?.visual, car),
        slot: Math.max(0, Math.min(MAX_PLAYERS - 1, Math.floor(finite(p?.slot, i)))),
      };
    });
  }
  private pingAll() {
    if (!this.isHost) return;
    this.broadcast({ t: "ping", ts: performance.now() });
    if (!this.inRace) this.broadcastRoster();
    this.onChange();
  }
  // ---------- lobby actions ----------
  updateProfile(profile: SessionProfile) {
    this.profile = profile;
    if (this.isHost) {
      const me = this.self;
      if (me) Object.assign(me, this.lobbyEntry(me.id, profile, true));
      this.broadcastRoster();
      this.onChange();
    } else
      this.send({
        t: "profile",
        name: profile.name,
        car: profile.car,
        visual: profile.visual,
      });
  }
  setReady(ready: boolean) {
    if (!this.isHost) this.send({ t: "ready", ready });
  }
  setConfig(config: Partial<NetConfig>) {
    if (!this.isHost) return;
    this.config = cleanConfig({ ...this.config, ...config }, this.config);
    this.broadcastRoster();
    this.onChange();
  }
  get canStart() {
    return (
      this.isHost &&
      !this.inRace &&
      this.players.length >= 1 &&
      this.players.every((p) => p.ready)
    );
  }
  /** Host: assign grid slots and start everyone's race. */
  start() {
    if (!this.isHost) return;
    this.inRace = true;
    this.loaded.clear();
    const grid: NetPlayer[] = this.players.map((p, slot) => ({
      id: p.id,
      name: p.name,
      car: p.car,
      visual: p.visual,
      slot,
    }));
    this.broadcast({ t: "start", config: this.config, grid });
    this.onStart(this.config, grid);
    // Never wait forever on a slow loader.
    setTimeout(() => this.release(), 12000);
  }
  /** Local race finished loading. */
  markLoaded() {
    if (this.isHost) {
      this.loaded.add(this.selfId);
      this.checkAllLoaded();
    } else this.send({ t: "loaded" });
  }
  private released = false;
  private checkAllLoaded() {
    if (this.players.every((p) => this.loaded.has(p.id))) this.release();
  }
  private release() {
    if (!this.isHost || !this.inRace || this.released) return;
    this.released = true;
    this.broadcast({ t: "go" });
    this.onGo();
  }
  /** Host: everyone back to the lobby. */
  returnToLobby() {
    if (!this.isHost) return;
    this.inRace = false;
    this.released = false;
    for (const p of this.players) p.ready = p.host;
    this.broadcast({ t: "lobby" });
    this.broadcastRoster();
    this.onLobby();
    this.onChange();
  }
  /** Leaving the current race early (the session stays open). */
  retire() {
    this.send({ t: "retire", id: this.selfId });
  }
  sendState(s: Omit<Snapshot, "at">) {
    this.send({ t: "s", id: this.selfId, ...s }, false);
  }
  sendFinish(time: number, best: number | null) {
    this.send({ t: "finish", id: this.selfId, time, best });
  }
  chat(text: string) {
    const clean = text.trim().slice(0, 80);
    if (!clean) return;
    this.send({ t: "chat", id: this.selfId, text: clean });
    this.onChat(this.self?.name ?? this.profile.name, clean);
  }
  close(reason = "") {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.pingTimer);
    try {
      this.send({ t: "leave" });
    } catch {
      /* Peer already gone. */
    }
    for (const l of this.pending) l.close();
    for (const l of [...this.links.values()]) l.close();
    this.hub?.close();
    this.links.clear();
    this.onClosed(reason);
  }
}
export const isValidCar = (id: string) => CARS.some((c) => c.id === id);
