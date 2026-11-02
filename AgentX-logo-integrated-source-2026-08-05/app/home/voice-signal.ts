/**
 * A single, shared "how loud is someone talking right now" signal.
 *
 * It is a plain mutable object (not React state) so the avatar and the
 * waveform can read it every animation frame without re-rendering anything.
 * Two kinds of source feed it:
 *
 * - Synthetic: the simulated call announces each spoken word with its
 *   duration; the signal turns that into syllable-like pulses.
 * - Measured: during a real call, WebAudio AnalyserNodes on the remote
 *   (agent) and local (caller) streams are sampled for RMS loudness.
 *
 * `sample(now)` is idempotent per timestamp, so several consumers rendering
 * in the same frame all see the same value.
 */

export type VoiceTone = "agent" | "caller" | "idle";

type WordPulse = {
  start: number;
  duration: number;
  syllables: number;
  gain: number;
  tone: Exclude<VoiceTone, "idle">;
};

type RingPattern = { start: number; until: number };

const ATTACK_MS = 28;
const RELEASE_MS = 140;

function vowelGroups(word: string) {
  const groups = word.toLowerCase().match(/[aeiouy]+/g);
  return Math.max(1, Math.min(4, groups?.length ?? 1));
}

export class VoiceSignal {
  /** Who the current energy belongs to. Holds the last speaker while decaying. */
  tone: VoiceTone = "idle";

  private level = 0;
  private lastSample = -1;
  private lastTime = 0;
  private words: WordPulse[] = [];
  private ring: RingPattern | null = null;
  private analysers: Partial<Record<"agent" | "caller", AnalyserNode>> = {};
  private buffer: Float32Array<ArrayBuffer> | null = null;

  /** Queue one spoken word from the simulated call. */
  word(text: string, tone: "agent" | "caller", start: number, duration: number) {
    // Seeded from the word itself so a replay looks identical.
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) | 0;
    const gain = 0.78 + ((hash >>> 0) % 100) / 450;
    this.words.push({ start, duration, syllables: vowelGroups(text), gain, tone });
    if (this.words.length > 6) this.words.shift();
    this.tone = tone;
  }

  /** Visual-only ring cadence (two short bursts per cycle) while a call rings. */
  ringFor(start: number, until: number) {
    this.ring = { start, until };
    this.tone = "idle";
  }

  /** Stop all synthetic sources; the level decays naturally to zero. */
  silence() {
    this.words = [];
    this.ring = null;
  }

  attachAnalyser(role: "agent" | "caller", analyser: AnalyserNode) {
    this.analysers[role] = analyser;
  }

  detachAnalysers() {
    this.analysers = {};
    this.buffer = null;
  }

  reset() {
    this.silence();
    this.detachAnalysers();
    this.tone = "idle";
  }

  /** Current smoothed level in 0..1. Call once per frame with the rAF timestamp. */
  sample(now: number): number {
    if (now === this.lastSample) return this.level;
    const dt = this.lastTime ? Math.min(64, Math.max(0, now - this.lastTime)) : 16;
    this.lastTime = now;
    this.lastSample = now;

    const target = this.measure(now);
    const tau = target > this.level ? ATTACK_MS : RELEASE_MS;
    this.level += (target - this.level) * (1 - Math.exp(-dt / tau));
    if (this.level < 0.002) this.level = 0;
    return this.level;
  }

  private measure(now: number) {
    let target = 0;

    if (this.analysers.agent || this.analysers.caller) {
      let loudest = 0;
      let loudestRole: "agent" | "caller" | null = null;
      for (const role of ["agent", "caller"] as const) {
        const analyser = this.analysers[role];
        if (!analyser) continue;
        const value = this.rmsLevel(analyser);
        // Prefer the agent on near-ties: echo of the agent in the mic is common.
        if (value > loudest * (role === "caller" ? 1.15 : 1)) {
          loudest = value;
          loudestRole = role;
        }
      }
      if (loudestRole && loudest > 0.06) this.tone = loudestRole;
      target = Math.max(target, loudest);
    }

    for (const word of this.words) {
      const local = now - word.start;
      if (local < 0 || local > word.duration) continue;
      const progress = (local / word.duration) * word.syllables;
      const within = progress - Math.floor(progress);
      // Each syllable is a quick rise and a softer fall.
      const shape = Math.pow(Math.sin(Math.PI * within), 0.65);
      target = Math.max(target, word.gain * (0.42 + 0.5 * shape));
      this.tone = word.tone;
    }

    if (this.ring && now >= this.ring.start && now <= this.ring.until) {
      const cycle = (now - this.ring.start) % 1500;
      const burst = (cycle < 380) || (cycle > 560 && cycle < 940);
      if (burst) target = Math.max(target, 0.2);
    }

    return Math.min(1, target);
  }

  private rmsLevel(analyser: AnalyserNode) {
    if (!this.buffer || this.buffer.length !== analyser.fftSize) {
      this.buffer = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
    }
    analyser.getFloatTimeDomainData(this.buffer);
    let sum = 0;
    for (let index = 0; index < this.buffer.length; index += 1) sum += this.buffer[index] * this.buffer[index];
    const rms = Math.sqrt(sum / this.buffer.length);
    if (rms <= 0) return 0;
    // -52 dBFS (room hiss) -> 0, -12 dBFS (close speech) -> 1.
    const db = 20 * Math.log10(rms);
    return Math.max(0, Math.min(1, (db + 52) / 40));
  }
}

export const TONE_RGB: Record<VoiceTone, [number, number, number]> = {
  agent: [91, 224, 198], // --accent
  caller: [231, 155, 109], // --accent-warm
  idle: [131, 151, 148], // --text-muted
};
