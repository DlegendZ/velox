import { CARS, carById } from "../data/cars";
import { TRACKS } from "../data/tracks";
import { cleanName, cleanVisual, type Visual } from "../core/Save";
import type { RaceConfig, NetPlayer } from "../game/RaceManager";
import type { Snapshot } from "../game/RemoteCar";
import {
  hasRelay,
  iceServers,
  LocalHub,
  PeerLink,
  RtcLink,
  type BrokeredConnection,
  type Link,
} from "./Link";
export const PROTOCOL = 1;
export const MAX_PLAYERS = 6;
/** How long a dropped room-code guest may take to come back before losing their spot. */
export const REJOIN_MS = 30000;
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
> & {
  /** "open": every player may race any car with all upgrades, without touching saves. */
  garage: "own" | "open";
};
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
  | { t: "leave"; id?: string; reason?: string }
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
/** Room codes avoid look-alike characters (0/O, 1/I) so they survive being read aloud. */
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_LENGTH = 6;
const ROOM_PREFIX = "velox-room-";
export const cleanRoomCode = (text: string) =>
  text.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const isRoomCode = (code: string) =>
  code.length === ROOM_LENGTH && [...code].every((c) => ROOM_ALPHABET.includes(c));
const newRoomCode = () =>
  Array.from(
    crypto.getRandomValues(new Uint8Array(ROOM_LENGTH)),
    (b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length],
  ).join("");
/** The PeerJS broker object, typed loosely so the library loads only when needed. */
interface Broker {
  destroyed: boolean;
  disconnected: boolean;
  on(event: string, fn: (arg: never) => void): unknown;
  once(event: string, fn: (arg: never) => void): unknown;
  connect(id: string, options: object): BrokeredConnection;
  reconnect(): void;
  destroy(): void;
}
const brokerError = (e: unknown) => {
  const type = (e as { type?: string })?.type ?? "";
  if (type === "peer-unavailable")
    return "No room with that code. Check it with your host.";
  if (type === "browser-incompatible")
    return "This browser cannot play online. Try Chrome, Edge or Firefox.";
  return "Cannot reach the room server. Check your internet connection.";
};
/**
 * Same-origin relay (api/peerjs.ts) for networks that cannot reach the public broker,
 * e.g. ISP DNS blocks. VITE_BROKER_RELAY overrides it for local testing.
 */
const RELAY_PATH: string = import.meta.env?.VITE_BROKER_RELAY ?? "/api/peerjs/";
/** Once the relay was needed, later rooms skip the direct attempt (?relay=1 forces it). */
let useRelay =
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).get("relay") === "1";
function relayOptions() {
  if (typeof location === "undefined") return null;
  const url = new URL(RELAY_PATH, location.href),
    secure = url.protocol === "https:";
  return {
    host: url.hostname,
    port: Number(url.port) || (secure ? 443 : 80),
    secure,
    path: url.pathname,
  };
}
type PeerClass = typeof import("peerjs").default;
function tryBroker(Peer: PeerClass, id: string | undefined, options: object, wait: number) {
  return new Promise<Broker>((resolve, reject) => {
    const peer = (
      id ? new Peer(id, { ...options, debug: 0 }) : new Peer({ ...options, debug: 0 })
    ) as unknown as Broker;
    const timer = setTimeout(() => {
      peer.destroy();
      reject({ type: "network" });
    }, wait);
    peer.once("open", () => {
      clearTimeout(timer);
      resolve(peer);
    });
    peer.once("error", (e) => {
      clearTimeout(timer);
      peer.destroy();
      reject(e);
    });
  });
}
async function openBroker(id?: string) {
  const { default: Peer } = await import("peerjs");
  const config = { iceServers: await iceServers() },
    relay = relayOptions();
  if (!useRelay || !relay)
    try {
      return await tryBroker(Peer, id, { config }, relay ? 6000 : 12000);
    } catch (e) {
      const type = (e as { type?: string })?.type ?? "";
      if (!relay || ["unavailable-id", "invalid-id", "browser-incompatible"].includes(type))
        throw e;
    }
  const peer = await tryBroker(Peer, id, { config, ...relay }, 12000);
  useRelay = true;
  return peer;
}
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
    garage: c.garage === "open" ? "open" : "own",
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
    garage: "own",
  };
  inRace = false;
  localRoom = "";
  closed = false;
  onChange = () => {};
  onStart = (_config: NetConfig, _grid: NetPlayer[]) => {};
  onGo = () => {};
  onState = (_id: string, _s: Snapshot) => {};
  onFinish = (_id: string, _time: number, _best: number | null) => {};
  onPlayerLeft = (_name: string, _id: string, _reason?: string) => {};
  onPlayerJoined = (_name: string) => {};
  /** Host: a room-code guest dropped and their spot is held (away) or they came back. */
  onPlayerAway = (_name: string, _away: boolean) => {};
  /** Guest: lost the host and is redialling (true), or got back in (false). */
  onReconnecting = (_active: boolean) => {};
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
  static host(profile: SessionProfile, config?: Partial<NetConfig>) {
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
    const link = new RtcLink(await iceServers());
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
    const link = new RtcLink(await iceServers());
    const reply = await link.acceptOffer(code, this.selfId);
    this.adopt(link, "host");
    return reply;
  }
  /** Short code friends type to join, once the room is registered. */
  roomCode = "";
  /** Guest: the host accepted us at least once, so a drop is worth redialling. */
  private connectedOnce = false;
  roomError = "";
  private broker: Broker | null = null;
  /** Host: register a room code on the public PeerJS broker. It only introduces peers. */
  async openOnlineRoom() {
    for (let attempt = 0; !this.closed; attempt++) {
      const code = newRoomCode();
      try {
        const peer = await openBroker(ROOM_PREFIX + code);
        if (this.closed) {
          peer.destroy();
          return;
        }
        this.broker = peer;
        this.roomCode = code;
        this.roomError = "";
        peer.on("connection", (conn: BrokeredConnection & { metadata?: { id?: unknown } }) => {
          const asked = conn.metadata?.id,
            valid = typeof asked === "string" && /^[0-9a-f]{12}$/.test(asked),
            // A known player redialling replaces their old link, which may not have
            // noticed the drop yet.
            returning = valid && this.players.some((p) => p.id === asked),
            id = valid && (returning || !this.links.has(asked)) ? asked : randomId();
          if (
            !returning &&
            this.players.length + this.pendingCount() >= MAX_PLAYERS
          ) {
            conn.close();
            return;
          }
          const previous = this.links.get(id);
          this.adopt(new PeerLink(conn, id), id);
          previous?.close();
        });
        // The broker drops idle sockets; reconnect so new friends can still join.
        peer.on("disconnected", () =>
          setTimeout(() => {
            if (!this.closed && !peer.destroyed && peer.disconnected) peer.reconnect();
          }, 2000),
        );
        peer.on("error", () => {});
        this.onChange();
        return;
      } catch (e) {
        if ((e as { type?: string })?.type !== "unavailable-id" || attempt >= 3) {
          this.roomError = brokerError(e);
          this.onChange();
          return;
        }
      }
    }
  }
  /** Guest: join a host's room by its short code. */
  async joinOnlineRoom(text: string) {
    const code = cleanRoomCode(text);
    if (!isRoomCode(code))
      throw new Error(`Room codes are ${ROOM_LENGTH} letters and numbers.`);
    this.roomCode = code;
    let peer: Broker;
    try {
      peer = await openBroker();
    } catch (e) {
      throw new Error(brokerError(e));
    }
    if (this.closed) {
      peer.destroy();
      return;
    }
    this.broker = peer;
    // Once linked, the broker is no longer needed; its socket may drop (relay time limit).
    peer.on("error", (e) => {
      if (!this.connected && !this.rejoining && this.broker === peer)
        this.close(brokerError(e));
    });
    this.dialHost(peer);
    setTimeout(() => {
      if (this.connected || this.closed) return;
      this.close(
        hasRelay()
          ? "Could not connect to the host. Check both connections and try again."
          : "Found the room but could not connect. One of you is on a strict network (often mobile data). Try both on home Wi-Fi.",
      );
    }, 20000);
  }
  private dialHost(peer: Broker) {
    const conn = peer.connect(ROOM_PREFIX + this.roomCode, {
      reliable: true,
      serialization: "raw",
      metadata: { id: this.selfId },
    });
    const link = new PeerLink(conn, "host");
    this.adopt(link, "host");
    return link;
  }
  /** Guests that dropped mid-session and keep their spot for now: peer → removal timer. */
  private away = new Map<string, number>();
  /** Reliable messages a dropped peer missed, replayed when it is back. */
  private outbox = new Map<string, string[]>();
  private rejoining = false;
  /**
   * Guest: a room-code link died (Wi-Fi blip, NAT rebinding). Dial the host again through
   * a fresh broker; the host keeps our slot and car meanwhile.
   */
  private async rejoin() {
    if (this.rejoining || this.closed) return;
    this.rejoining = true;
    this.onReconnecting(true);
    const deadline = performance.now() + REJOIN_MS;
    while (!this.closed && performance.now() < deadline) {
      try {
        this.broker?.destroy();
        this.broker = null;
        const peer = await openBroker();
        if (this.closed) {
          peer.destroy();
          break;
        }
        this.broker = peer;
        peer.on("error", () => {});
        const link = this.dialHost(peer);
        const opened = await new Promise<boolean>((resolve) => {
          const start = performance.now(),
            timer = setInterval(() => {
              if (link.open || this.closed || performance.now() - start > 10000) {
                clearInterval(timer);
                resolve(link.open);
              }
            }, 100);
        });
        if (opened) {
          this.rejoining = false;
          for (const data of this.outbox.get("host")?.splice(0) ?? [])
            link.send(data);
          this.onReconnecting(false);
          return;
        }
        link.close();
      } catch {
        /* Broker unreachable for now; retry below. */
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    this.rejoining = false;
    if (!this.closed) this.close("Lost connection to the host.");
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
    link.onclose = () => this.dropped(peer, link);
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
  private dropped(peer: string, link: Link) {
    // A replaced link closing late must not drop its successor.
    if (this.links.get(peer) !== link) return;
    this.links.delete(peer);
    if (this.closed) return;
    const resumable = link instanceof PeerLink;
    if (!this.isHost) {
      if (resumable && this.roomCode && this.connectedOnce) void this.rejoin();
      else if (!this.rejoining) this.close("Lost connection to the host.");
      return;
    }
    const held = this.players.find((p) => p.id === peer);
    if (held && resumable) {
      clearTimeout(this.away.get(peer));
      this.away.set(
        peer,
        window.setTimeout(() => this.removePlayer(peer), REJOIN_MS + 5000),
      );
      this.outbox.set(peer, this.outbox.get(peer) ?? []);
      this.onPlayerAway(held.name, true);
      return;
    }
    this.removePlayer(peer);
  }
  private removePlayer(peer: string, reason = "") {
    clearTimeout(this.away.get(peer));
    this.away.delete(peer);
    this.outbox.delete(peer);
    const p = this.players.find((p) => p.id === peer);
    this.players = this.players.filter((p) => p.id !== peer);
    if (p) {
      this.broadcast({ t: "leave", id: peer });
      this.broadcastRoster();
      this.onPlayerLeft(p.name, peer, reason);
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
    if (reliable)
      for (const peer of this.away.keys())
        if (peer !== except) this.hold(peer, data);
  }
  private send(msg: Message, reliable = true) {
    if (this.isHost) this.broadcast(msg, undefined, reliable);
    else if (this.rejoining) {
      if (reliable) this.hold("host", JSON.stringify(msg));
    } else this.sendTo(this.links.get("host"), msg, reliable);
  }
  private hold(peer: string, data: string) {
    const queue = this.outbox.get(peer) ?? [];
    if (queue.length < 100) queue.push(data);
    this.outbox.set(peer, queue);
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
        if (player) {
          // A held player came back on a new link: replay what they missed.
          const back = this.away.has(peer);
          clearTimeout(this.away.get(peer));
          this.away.delete(peer);
          const link = this.links.get(peer);
          for (const data of this.outbox.get(peer)?.splice(0) ?? [])
            link?.send(data);
          this.outbox.delete(peer);
          this.broadcastRoster();
          if (back) this.onPlayerAway(player.name, false);
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
      case "leave": {
        // Leaving on purpose frees the slot at once; only drops are held.
        const link = this.links.get(peer);
        this.links.delete(peer);
        link?.close();
        this.removePlayer(
          peer,
          typeof msg.reason === "string" ? msg.reason.slice(0, 80) : "",
        );
        return;
      }
    }
  }
  private guestReceive(msg: Message) {
    switch (msg.t) {
      case "roster":
        if (!Array.isArray(msg.players)) return;
        this.connectedOnce = true;
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
        this.released = false;
        this.onStart(this.config, grid);
        return;
      }
      case "go":
        this.released = true;
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
        if (msg.id === undefined) {
          this.close("The host closed the room.");
          return;
        }
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
    // Never wait forever on a slow loader; it starts as soon as it is ready.
    setTimeout(() => this.release(), 20000);
  }
  /** Local race finished loading. */
  markLoaded() {
    if (this.isHost) {
      this.loaded.add(this.selfId);
      this.checkAllLoaded();
    } else this.send({ t: "loaded" });
  }
  private released = false;
  /** The host has sent "go" for the current race (it can arrive before we finish loading). */
  get started() {
    return this.released;
  }
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
    for (const timer of this.away.values()) clearTimeout(timer);
    this.away.clear();
    try {
      this.send(this.isHost ? { t: "leave" } : { t: "leave", reason });
    } catch {
      /* Peer already gone. */
    }
    for (const l of this.pending) l.close();
    for (const l of [...this.links.values()]) l.close();
    this.hub?.close();
    this.broker?.destroy();
    this.links.clear();
    this.onClosed(reason);
  }
}
export const isValidCar = (id: string) => CARS.some((c) => c.id === id);
