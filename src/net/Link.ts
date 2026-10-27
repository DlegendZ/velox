import { packCode, unpackCode } from "./codec";
/** A bidirectional message pipe to one peer. */
export interface Link {
  readonly peer: string;
  open: boolean;
  send(data: string, reliable?: boolean): void;
  onmessage: (data: string) => void;
  onopen: () => void;
  onclose: () => void;
  close(): void;
}
/** Public STUN only discovers each player's address; game data always flows peer to peer. */
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];
interface Signal {
  /** Session description type and SDP. */
  t: RTCSdpType;
  s: string;
  /** Sender id. */
  i: string;
}
/** WebRTC data-channel link: reliable ordered control channel plus an unreliable state channel. */
export class RtcLink implements Link {
  open = false;
  peer = "";
  onmessage = (_: string) => {};
  onopen = () => {};
  onclose = () => {};
  private pc: RTCPeerConnection;
  private reliable: RTCDataChannel | null = null;
  private fast: RTCDataChannel | null = null;
  private closed = false;
  constructor() {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc.addEventListener("connectionstatechange", () => {
      const s = this.pc.connectionState;
      if (s === "failed" || s === "closed") this.close();
    });
    this.pc.addEventListener("datachannel", (e) => this.attach(e.channel));
  }
  private attach(channel: RTCDataChannel) {
    if (channel.label === "ctl") this.reliable = channel;
    else this.fast = channel;
    channel.addEventListener("message", (e) => {
      if (typeof e.data === "string") this.onmessage(e.data);
    });
    channel.addEventListener("open", () => this.checkOpen());
    channel.addEventListener("close", () => this.close());
    if (channel.readyState === "open") this.checkOpen();
  }
  private checkOpen() {
    if (
      !this.open &&
      this.reliable?.readyState === "open" &&
      this.fast?.readyState === "open"
    ) {
      this.open = true;
      this.onopen();
    }
  }
  /** Waits for ICE gathering so the code carries every candidate (no trickle server needed). */
  private async gathered() {
    if (this.pc.iceGatheringState === "complete") return;
    await new Promise<void>((resolve) => {
      const done = () => {
        this.pc.removeEventListener("icegatheringstatechange", check);
        clearTimeout(timer);
        resolve();
      };
      const check = () => {
        if (this.pc.iceGatheringState === "complete") done();
      };
      const timer = setTimeout(done, 3500);
      this.pc.addEventListener("icegatheringstatechange", check);
    });
  }
  /** Host: create the invite code for one guest. */
  async createOffer(selfId: string) {
    this.attach(this.pc.createDataChannel("ctl", { ordered: true }));
    this.attach(
      this.pc.createDataChannel("state", { ordered: false, maxRetransmits: 0 }),
    );
    await this.pc.setLocalDescription(await this.pc.createOffer());
    await this.gathered();
    const d = this.pc.localDescription!;
    return packCode({ t: d.type, s: d.sdp, i: selfId } satisfies Signal);
  }
  /** Guest: accept an invite code and produce the reply code. */
  async acceptOffer(code: string, selfId: string) {
    const offer = await unpackCode<Signal>(code);
    if (offer?.t !== "offer" || typeof offer.s !== "string")
      throw new Error("That is a reply code. Paste the host's invite code here.");
    this.peer = String(offer.i ?? "host");
    await this.pc.setRemoteDescription({ type: "offer", sdp: offer.s });
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    await this.gathered();
    const d = this.pc.localDescription!;
    return packCode({ t: d.type, s: d.sdp, i: selfId } satisfies Signal);
  }
  /** Host: finish the handshake with the guest's reply code. */
  async acceptAnswer(code: string) {
    const answer = await unpackCode<Signal>(code);
    if (answer?.t !== "answer" || typeof answer.s !== "string")
      throw new Error("That is an invite code. Paste your friend's reply code.");
    this.peer = String(answer.i ?? "guest");
    await this.pc.setRemoteDescription({ type: "answer", sdp: answer.s });
  }
  send(data: string, reliable = true) {
    const channel = reliable ? this.reliable : this.fast;
    if (channel?.readyState === "open") {
      // Drop unreliable state when the buffer backs up instead of adding latency.
      if (!reliable && channel.bufferedAmount > 64 * 1024) return;
      channel.send(data);
    }
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    const wasOpen = this.open;
    this.open = false;
    try {
      this.reliable?.close();
      this.fast?.close();
      this.pc.close();
    } catch {
      /* Already closed. */
    }
    if (wasOpen || this.peer) this.onclose();
  }
}
interface LocalPacket {
  room: string;
  from: string;
  to: string;
  kind: "hello" | "data" | "bye";
  data?: string;
}
/** Same-device link over BroadcastChannel: lets two browser tabs play together with no network at all. */
export class LocalLink implements Link {
  open = false;
  onmessage = (_: string) => {};
  onopen = () => {};
  onclose = () => {};
  constructor(
    private channel: BroadcastChannel,
    private room: string,
    private self: string,
    public peer: string,
    private dispose: () => void,
  ) {}
  receive(p: LocalPacket) {
    if (p.kind === "data" && p.data !== undefined) this.onmessage(p.data);
    if (p.kind === "bye") this.close(false);
  }
  markOpen() {
    if (this.open) return;
    this.open = true;
    this.onopen();
  }
  send(data: string) {
    if (!this.open) return;
    this.channel.postMessage({
      room: this.room,
      from: this.self,
      to: this.peer,
      kind: "data",
      data,
    } satisfies LocalPacket);
  }
  close(notify = true) {
    if (!this.open) return;
    this.open = false;
    this.dispose();
    if (notify)
      this.channel.postMessage({
        room: this.room,
        from: this.self,
        to: this.peer,
        kind: "bye",
      } satisfies LocalPacket);
    this.onclose();
  }
}
/** Routes BroadcastChannel packets for one room to per-peer LocalLinks. */
export class LocalHub {
  private channel: BroadcastChannel;
  private links = new Map<string, LocalLink>();
  onconnect = (_: LocalLink) => {};
  constructor(
    public room: string,
    private self: string,
    private host: boolean,
  ) {
    this.channel = new BroadcastChannel("velox-local");
    this.channel.addEventListener("message", (e) => {
      const p = e.data as LocalPacket;
      if (!p || p.room !== this.room || p.to !== this.self) return;
      let link = this.links.get(p.from);
      if (p.kind === "hello" && this.host && !link) {
        link = this.link(p.from);
        this.onconnect(link);
        this.post(p.from, "hello");
        link.markOpen();
        return;
      }
      if (p.kind === "hello" && !this.host && link) {
        link.markOpen();
        return;
      }
      link?.receive(p);
    });
  }
  private link(peer: string) {
    const link = new LocalLink(this.channel, this.room, this.self, peer, () =>
      this.links.delete(peer),
    );
    this.links.set(peer, link);
    return link;
  }
  private post(to: string, kind: LocalPacket["kind"]) {
    this.channel.postMessage({
      room: this.room,
      from: this.self,
      to,
      kind,
    } satisfies LocalPacket);
  }
  /** Guest: connect to the room host. */
  connect() {
    const link = this.link("host");
    this.post("host", "hello");
    return link;
  }
  close() {
    for (const l of [...this.links.values()]) l.close();
    this.channel.close();
  }
}
