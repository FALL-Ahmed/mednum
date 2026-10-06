/*
  Ambiances sonores pour réviser, entièrement générées dans le navigateur (Web Audio) :
  aucun fichier audio, aucun droit d'auteur à gérer, rien à télécharger, et ça marche sans connexion.
  Chaque son est une « couche » avec son propre volume ; on peut en mélanger plusieurs.
*/

export type SoundId = string;

export const SOUNDS: { id: SoundId; label: string; hint: string; group: "nature" | "lieu" | "bruit" }[] = [
  { id: "storm", label: "Orage", hint: "Grondements lointains", group: "nature" },
  { id: "waves", label: "Vagues", hint: "Mer calme", group: "nature" },
  { id: "birds", label: "Oiseaux", hint: "Matin en forêt", group: "nature" },
  { id: "fire", label: "Feu de bois", hint: "Crépitements", group: "nature" },
  { id: "cafe", label: "Café", hint: "Murmures et tasses", group: "lieu" },
  { id: "pink", label: "Bruit rose", hint: "Doux et équilibré", group: "bruit" },
  { id: "brown", label: "Bruit brun", hint: "Grave et enveloppant", group: "bruit" },
  { id: "white", label: "Bruit blanc", hint: "Masque les bruits", group: "bruit" },
];

export const PRESETS: { id: string; label: string; hint: string; mix: Record<string, number>; music?: "lofi" | "nappes" }[] = [
  { id: "lofi", label: "Lo-fi", hint: "Playlist de beats doux", mix: {}, music: "lofi" },
  { id: "rain", label: "Pluie douce", hint: "Averse et grondement grave", mix: { "pluie-1": 0.7, brown: 0.25 } },
  { id: "forest", label: "Forêt", hint: "Oiseaux, vent, ruisseau", mix: { birds: 0.55, "vent-1": 0.3, "ruisseau-1": 0.35 } },
  { id: "sea", label: "Bord de mer", hint: "Vagues et brise", mix: { waves: 0.7, "vent-1": 0.2, birds: 0.15 } },
  { id: "fire", label: "Coin du feu", hint: "Feu qui crépite sous la pluie", mix: { fire: 0.7, "pluie-1": 0.25 } },
  { id: "storm", label: "Nuit d'orage", hint: "Pluie et tonnerre", mix: { storm: 0.6, "pluie-2": 0.55 } },
  { id: "deep", label: "Concentration profonde", hint: "Bruit brun et nappes calmes", mix: { brown: 0.5 }, music: "nappes" },
];

type Layer = { out: GainNode; stop: () => void };
type Ctx = AudioContext;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Bruit blanc, rose ou brun en boucle (la jonction est fondue pour éviter tout clic). */
function noiseBuffer(ctx: Ctx, kind: "white" | "pink" | "brown"): AudioBuffer {
  const rate = ctx.sampleRate;
  const seconds = 8;
  const fade = Math.floor(rate * 0.25);
  const total = rate * seconds + fade;
  const raw = new Float32Array(total);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < total; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === "white") raw[i] = w * 0.5;
    else if (kind === "pink") {
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else {
      last = (last + 0.02 * w) / 1.02;
      raw[i] = last * 3.5;
    }
  }
  // Fondu enchaîné entre la fin et le début pour une boucle sans couture
  const buf = ctx.createBuffer(1, rate * seconds, rate);
  const out = buf.getChannelData(0);
  for (let i = 0; i < out.length; i++) out[i] = raw[i];
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    out[i] = raw[i] * Math.sin((t * Math.PI) / 2) + raw[rate * seconds + i] * Math.cos((t * Math.PI) / 2);
  }
  return buf;
}

export class Soundscape {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private layers = new Map<SoundId, Layer>();
  private levels = new Map<SoundId, number>();
  private buffers = new Map<string, AudioBuffer>();
  private masterLevel = 0.8;
  private suspended = false;
  private suspendTimer = 0;
  private musicOut: GainNode | null = null;
  private musicLevel = 0.7;
  private files = new Map<string, { url: string; seconds: number }>();
  private elements = new Set<HTMLAudioElement>();
  private track: { audio: HTMLAudioElement; node: MediaElementAudioSourceNode } | null = null;

  private ensure(): Ctx | null {
    if (this.ctx) return this.ctx;
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    this.ctx = new C();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.suspended ? 0 : this.masterLevel;
    const comp = this.ctx.createDynamicsCompressor(); // évite la saturation quand on mélange plusieurs sons
    this.master.connect(comp).connect(this.ctx.destination);
    return this.ctx;
  }

  private buf(kind: "white" | "pink" | "brown"): AudioBuffer {
    let b = this.buffers.get(kind);
    if (!b) {
      b = noiseBuffer(this.ctx!, kind);
      this.buffers.set(kind, b);
    }
    return b;
  }

  private loop(kind: "white" | "pink" | "brown"): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.buf(kind);
    s.loop = true;
    s.loopStart = 0;
    s.start(0, Math.random() * 6);
    return s;
  }

  /** Oscillateur lent qui fait varier un paramètre (le « souffle » du vent, le va-et-vient des vagues). */
  private lfo(target: AudioParam, freq: number, depth: number): OscillatorNode {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    g.gain.value = depth;
    o.connect(g).connect(target);
    o.start();
    return o;
  }

  /** Événements aléatoires (gouttes, chants, craquements) planifiés régulièrement. */
  private scheduler(fn: (t: number) => void, every = 90): () => void {
    const id = window.setInterval(() => {
      if (this.ctx && this.ctx.state === "running") fn(this.ctx.currentTime);
    }, every);
    return () => window.clearInterval(id);
  }

  private build(id: SoundId): Layer {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.master!);
    const nodes: (AudioScheduledSourceNode)[] = [];
    const cleanups: (() => void)[] = [];
    const track = <T extends AudioScheduledSourceNode>(n: T): T => (nodes.push(n), n);

    const filter = (type: BiquadFilterType, freq: number, q = 0.7) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      return f;
    };

    const file = this.files.get(id);
    if (file) {
      // Enregistrement : court => lu en mémoire et bouclé sans coupure ; long => lu en continu
      let closed = false;
      if (file.seconds <= 120) {
        fetch(file.url)
          .then((r) => r.arrayBuffer())
          .then((b) => ctx.decodeAudioData(b))
          .then((buf) => {
            if (closed) return;
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.loop = true;
            src.connect(out);
            src.start();
            nodes.push(src);
          })
          .catch(() => {
            /* fichier introuvable : la couche reste muette */
          });
      } else {
        const a = new Audio(file.url);
        a.loop = true;
        a.preload = "auto";
        const node = ctx.createMediaElementSource(a);
        node.connect(out);
        void a.play().catch(() => {
          /* lecture bloquée par le navigateur : l'élève peut relancer d'un clic */
        });
        this.elements.add(a);
        cleanups.push(() => {
          a.pause();
          a.removeAttribute("src");
          a.load();
          this.elements.delete(a);
          node.disconnect();
        });
      }
      cleanups.push(() => {
        closed = true;
      });
    } else if (id === "pink" || id === "brown" || id === "white") {
      const src = track(this.loop(id));
      const g = ctx.createGain();
      g.gain.value = id === "white" ? 0.35 : id === "pink" ? 0.55 : 0.8;
      src.connect(id === "white" ? g : g).connect(out);
    } else if (id === "waves") {
      const src = track(this.loop("brown"));
      const lp = filter("lowpass", 800);
      const g = ctx.createGain();
      g.gain.value = 0.5;
      src.connect(lp).connect(g).connect(out);
      track(this.lfo(g.gain, 0.085, 0.42)); // montée et retrait de la vague
      track(this.lfo(lp.frequency, 0.085, 450));
      const foam = track(this.loop("white"));
      const fhp = filter("highpass", 3500);
      const fg = ctx.createGain();
      fg.gain.value = 0.06;
      foam.connect(fhp).connect(fg).connect(out);
      track(this.lfo(fg.gain, 0.085, 0.05)); // écume au sommet de la vague
    } else if (id === "birds") {
      const bed = track(this.loop("pink"));
      const lp = filter("lowpass", 1500);
      const bg = ctx.createGain();
      bg.gain.value = 0.06;
      bed.connect(lp).connect(bg).connect(out);
      cleanups.push(this.scheduler((t) => {
        if (Math.random() > 0.045) return;
        const base = rand(2200, 4600);
        const notes = Math.random() < 0.5 ? 1 : Math.floor(rand(2, 5));
        for (let n = 0; n < notes; n++) {
          const at = t + 0.05 + n * rand(0.11, 0.2);
          const o = ctx.createOscillator();
          const eg = ctx.createGain();
          o.type = "sine";
          o.frequency.setValueAtTime(base * rand(0.9, 1.1), at);
          o.frequency.exponentialRampToValueAtTime(base * rand(1.2, 1.7), at + 0.09);
          eg.gain.setValueAtTime(0, at);
          eg.gain.linearRampToValueAtTime(rand(0.04, 0.09), at + 0.015);
          eg.gain.exponentialRampToValueAtTime(0.0001, at + 0.13);
          o.connect(eg).connect(out);
          o.start(at);
          o.stop(at + 0.16);
        }
      }, 120));
    } else if (id === "fire") {
      const src = track(this.loop("brown"));
      const lp = filter("lowpass", 380);
      const g = ctx.createGain();
      g.gain.value = 0.55;
      src.connect(lp).connect(g).connect(out);
      cleanups.push(this.scheduler((t) => {
        const n = Math.random() < 0.5 ? 0 : Math.random() < 0.8 ? 1 : 3;
        for (let k = 0; k < n; k++) {
          const c = ctx.createBufferSource();
          c.buffer = this.buf("white");
          const hp = filter("highpass", rand(1200, 3200));
          const eg = ctx.createGain();
          const at = t + rand(0, 0.08);
          eg.gain.setValueAtTime(rand(0.08, 0.35), at);
          eg.gain.exponentialRampToValueAtTime(0.0001, at + rand(0.008, 0.03));
          c.connect(hp).connect(eg).connect(out);
          c.start(at, Math.random() * 6, 0.05);
        }
      }, 70));
    } else if (id === "storm") {
      // Grondements graves, espacés, qui montent puis s'éteignent lentement
      const rumble = () => {
        const t = ctx.currentTime + rand(0, 1);
        const c = ctx.createBufferSource();
        c.buffer = this.buf("brown");
        c.loop = true;
        const lp = filter("lowpass", rand(110, 220));
        const eg = ctx.createGain();
        const len = rand(4, 8);
        eg.gain.setValueAtTime(0, t);
        eg.gain.linearRampToValueAtTime(rand(0.5, 0.95), t + rand(0.4, 1.4));
        eg.gain.exponentialRampToValueAtTime(0.0001, t + len);
        c.connect(lp).connect(eg).connect(out);
        c.start(t, Math.random() * 6);
        c.stop(t + len + 0.1);
      };
      rumble();
      const timer = window.setInterval(() => {
        if (ctx.state === "running" && Math.random() < 0.45) rumble();
      }, 6000);
      cleanups.push(() => window.clearInterval(timer));
    } else if (id === "cafe") {
      // Murmure de conversations : du bruit découpé en « syllabes » à trois hauteurs de voix, plus des tasses qui tintent
      const src = track(this.loop("pink"));
      const sum = ctx.createGain();
      sum.gain.value = 0.55;
      for (const [f, q, rate] of [[360, 1.6, 0.9], [820, 1.8, 1.4], [1700, 1.4, 2.1]] as const) {
        const bp = filter("bandpass", f, q);
        const vg = ctx.createGain();
        vg.gain.value = 0.55;
        src.connect(bp).connect(vg).connect(sum);
        track(this.lfo(vg.gain, rate * rand(0.8, 1.2), 0.4));
        track(this.lfo(bp.frequency, rate * 0.37, f * 0.18));
      }
      const room = filter("lowpass", 3500);
      sum.connect(room).connect(out);
      cleanups.push(this.scheduler((t) => {
        if (Math.random() > 0.035) return;
        const at = t + 0.03;
        const f = rand(2300, 4200);
        for (const mult of [1, 2.71]) {
          const o = ctx.createOscillator();
          const eg = ctx.createGain();
          o.type = "sine";
          o.frequency.value = f * mult;
          eg.gain.setValueAtTime(0, at);
          eg.gain.linearRampToValueAtTime(0.03 / mult, at + 0.003);
          eg.gain.exponentialRampToValueAtTime(0.0001, at + rand(0.12, 0.3));
          o.connect(eg).connect(out);
          o.start(at);
          o.stop(at + 0.35);
        }
      }, 120));
    }

    return {
      out,
      stop: () => {
        cleanups.forEach((c) => c());
        for (const n of nodes) {
          try {
            n.stop();
          } catch {
            /* déjà arrêté */
          }
        }
      },
    };
  }

  /** Règle le niveau d'une couche (0 = coupée, 1 = fort). Crée la couche au premier appel. */
  setLayer(id: SoundId, level: number) {
    this.levels.set(id, level);
    if (level <= 0) {
      const l = this.layers.get(id);
      if (!l || !this.ctx) return;
      this.layers.delete(id);
      l.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
      window.setTimeout(() => l.stop(), 1500);
      return;
    }
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === "suspended" && !this.suspended) void ctx.resume();
    let layer = this.layers.get(id);
    if (!layer) {
      layer = this.build(id);
      this.layers.set(id, layer);
    }
    layer.out.gain.setTargetAtTime(Math.min(1, level) * 0.9, ctx.currentTime, 0.3);
  }

  /** Déclare les enregistrements disponibles (appelé une fois, après la lecture de sons.json). */
  registerFiles(list: { id: string; url: string; seconds: number }[]) {
    for (const f of list) this.files.set(f.id, { url: f.url, seconds: f.seconds });
  }

  /** Lance un morceau (le précédent s'arrête). `onEnd` est appelé quand le morceau se termine de lui-même. */
  playFile(url: string, onEnd: () => void) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    if (ctx.state === "suspended" && !this.suspended) void ctx.resume();
    this.stopMusic();
    if (!this.musicOut) {
      this.musicOut = ctx.createGain();
      this.musicOut.gain.value = this.musicLevel;
      this.musicOut.connect(this.master);
    }
    const audio = new Audio(url);
    audio.preload = "auto";
    const node = ctx.createMediaElementSource(audio);
    node.connect(this.musicOut);
    audio.onended = onEnd;
    void audio.play().catch(() => onEnd());
    this.track = { audio, node };
  }

  stopMusic() {
    if (!this.track) return;
    const { audio, node } = this.track;
    this.track = null;
    audio.onended = null;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    node.disconnect();
  }

  /** Secondes écoulées dans le morceau en cours. */
  musicElapsed(): number {
    return this.track?.audio.currentTime ?? 0;
  }

  setMusicLevel(v: number) {
    this.musicLevel = v;
    if (this.ctx && this.musicOut) this.musicOut.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  setMaster(v: number) {
    this.masterLevel = v;
    if (this.ctx && this.master && !this.suspended) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  /** Pause réelle : le son (et le temps des morceaux) s'arrête en douceur, puis reprend là où il en était. */
  setSuspended(sus: boolean) {
    this.suspended = sus;
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    window.clearTimeout(this.suspendTimer);
    if (sus) {
      this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      this.suspendTimer = window.setTimeout(() => {
        if (!this.suspended) return;
        this.track?.audio.pause();
        this.elements.forEach((a) => a.pause());
        if (ctx.state === "running") void ctx.suspend();
      }, 450);
    } else {
      void ctx.resume().then(() => {
        if (this.suspended || !this.master) return;
        this.master.gain.setTargetAtTime(this.masterLevel, ctx.currentTime, 0.15);
        void this.track?.audio.play().catch(() => {});
        this.elements.forEach((a) => void a.play().catch(() => {}));
      });
    }
  }

  dispose() {
    window.clearTimeout(this.suspendTimer);
    this.stopMusic();
    for (const l of this.layers.values()) l.stop();
    this.layers.clear();
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
    this.master = null;
    this.musicOut = null;
    this.buffers.clear();
  }
}
