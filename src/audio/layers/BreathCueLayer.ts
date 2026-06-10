import * as Tone from "tone";

// ── Drop MP3s into public/audio/breath-cues/ using the pattern: ──────────────
//   ring-{ringNumber}-{n}_{anything}.mp3   (the _{anything} suffix is optional)
// ringNumber is 1-based and matches the Wire / ring numbers shown in the UI
// (Wire 1 → ring-1, Wire 2 → ring-2, …). Examples:
//   ring-1-1_breathe-in-morning.mp3
//   ring-1-2_breathe-in-soft.mp3
//   ring-2-1_exhale-slow.mp3
// Multiple files per ring are supported; one is chosen at random on each cue.

// ── Synthesized fallbacks (used when a ring has no loaded MP3s) ───────────────
const SYNTH_CUES: { startHz: number; endHz: number | null; dur: number }[] = [
  { startHz:  65.41, endHz: 196.00, dur: 2.0 },  // 0 – breathe in   (C2 → G3)
  { startHz: 196.00, endHz:  65.41, dur: 2.0 },  // 1 – breathe out  (G3 → C2)
  { startHz:  82.41, endHz:   null, dur: 2.5 },  // 2 – hold         (E2)
  { startHz: 164.81, endHz:   null, dur: 0.8 },  // 3 – rest         (E3)
  { startHz:  55.00, endHz: 220.00, dur: 2.5 },  // 4 – deep in      (A1 → A3)
  { startHz: 220.00, endHz:  55.00, dur: 2.5 },  // 5 – long exhale  (A3 → A1)
  { startHz: 130.81, endHz: 196.00, dur: 0.6 },  // 6 – quick breath (C3 → G3)
  { startHz: 261.63, endHz:  65.41, dur: 2.0 },  // 7 – release all  (C4 → C2)
];

export class BreathCueLayer {
  // players[ringIndex] = all loaded Players for that ring
  private readonly players: Tone.Player[][] = Array.from({ length: 8 }, () => []);
  private readonly synth: Tone.Synth;
  private readonly gain:  Tone.Gain;

  constructor() {
    this.gain  = new Tone.Gain(0.42).toDestination();
    this.synth = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope:   { attack: 0.12, decay: 0, sustain: 1, release: 0.9 },
    }).connect(this.gain);
  }

  /** Fetch the file listing from the server and create a Player per file. */
  async init(): Promise<void> {
    let groups: Record<string, string[]> = {};
    try {
      const res = await fetch("/api/breath-cues");
      if (res.ok) groups = await res.json();
    } catch {
      // Network error or dev server not running – all rings fall back to synth
    }

    for (const [ringStr, files] of Object.entries(groups)) {
      // Filenames are 1-based (ring-1 = Wire 1); store at the 0-based slot.
      const slot = parseInt(ringStr, 10) - 1;
      if (slot < 0 || slot > 7) continue;
      this.players[slot] = files.map(file => {
        const p = new Tone.Player({
          url: `/audio/breath-cues/${file}`,
        }).toDestination();
        p.volume.value = -3;
        return p;
      });
    }
  }

  play(ringIndex: number): void {
    const idx    = Math.min(ringIndex, 7);
    const loaded = this.players[idx].filter(p => p.loaded);

    if (loaded.length > 0) {
      const player = loaded[Math.floor(Math.random() * loaded.length)];
      try { player.stop(); } catch { /* not yet started */ }
      player.start();
      return;
    }

    // Synth fallback for rings with no MP3s loaded yet
    const cue = SYNTH_CUES[idx];
    const now  = Tone.now();
    const at   = now + 0.05;
    try {
      this.synth.triggerRelease(now);
      this.synth.triggerAttack(cue.startHz, at);
      if (cue.endHz !== null) {
        this.synth.frequency.linearRampTo(cue.endHz, cue.dur, at);
      }
      this.synth.triggerRelease(at + cue.dur);
    } catch {
      // Non-fatal audio scheduling error
    }
  }

  /** Immediately stop every playing breath-cue sample and the synth fallback. */
  stopAll(): void {
    this.players.forEach(ring =>
      ring.forEach(p => {
        try { if (p.loaded) p.stop(); } catch { /* not started */ }
      }),
    );
    try { this.synth.triggerRelease(Tone.now()); } catch { /* idle */ }
  }

  dispose(): void {
    this.players.forEach(ring => ring.forEach(p => p.dispose()));
    this.synth.dispose();
    this.gain.dispose();
  }
}
