/**
 * SoundscapeEngine
 *
 * Orchestrates all audio layers.  This is the single entry point the UI
 * interacts with.  It owns the Tone.js context lifecycle and delegates
 * per-frame parameter updates to each layer.
 *
 * Usage:
 *   const engine = new SoundscapeEngine();
 *   await engine.start();          // must be called from a user gesture
 *   engine.update(mappedData);     // called on every animation frame
 *   engine.dispose();              // cleanup on unmount
 */

import * as Tone from "tone";
import { DroneLayer } from "./layers/DroneLayer";
import { GrainLayer } from "./layers/GrainLayer";
import { NoiseLayer } from "./layers/NoiseLayer";
import { WobbleLayer } from "./layers/WobbleLayer";
import { BreathCueLayer } from "./layers/BreathCueLayer";
import type { MappedSensorData } from "./SensorInputMapper";

export class SoundscapeEngine {
  // Layers are null until start() is called so that Tone.js nodes are only
  // created after AudioContext is running (sampleRate > 0).
  private drone:  DroneLayer      | null = null;
  private grain:  GrainLayer      | null = null;
  private noise:  NoiseLayer      | null = null;
  private wobble: WobbleLayer     | null = null;
  private breath: BreathCueLayer  | null = null;
  private running = false;

  /**
   * Must be called from a user-gesture handler (click, pointerdown, etc.)
   * to satisfy browser autoplay policies.
   *
   * All Tone.js nodes are intentionally created HERE, after Tone.start(),
   * so that AudioContext.sampleRate is non-zero when Filter/Oscillator
   * nodes compute their valid parameter ranges.
   */
  async start(): Promise<void> {
    if (this.running) return;
    await Tone.start();

    this.drone  = new DroneLayer();
    this.grain  = new GrainLayer();
    this.noise  = new NoiseLayer();
    this.wobble = new WobbleLayer();
    this.breath = new BreathCueLayer();
    await this.breath.init();

    this.drone.start();
    this.grain.start();
    this.noise.start();
    this.wobble.start();

    this.running = true;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Call on hover (ring change) – triggers the ambient singing-bowl note. */
  triggerNote(ringIndex: number): void {
    this.grain?.triggerAttack(ringIndex);
  }

  /** Call on pointer leave – releases the note into its long reverb tail. */
  releaseNote(): void {
    this.grain?.triggerRelease();
  }

  /** Call on click – plays a short breath-cue tone for the given ring. */
  playBreathCue(ringIndex: number): void {
    this.breath?.play(ringIndex);
  }

  /** Panic stop: release the ambient note and cut every playing breath cue. */
  silenceAll(): void {
    this.grain?.triggerRelease();
    this.breath?.stopAll();
  }

  /** Mute or unmute all output. */
  setMuted(muted: boolean): void {
    Tone.getDestination().mute = muted;
  }

  /**
   * Push latest mapped sensor data to all layers.
   * Call this on every animation frame or sensor event.
   */
  update(data: MappedSensorData): void {
    if (!this.running) return;
    try {
      this.drone?.update(data);
      this.grain?.update(data);
      this.noise?.update(data);
      this.wobble?.update(data);
    } catch {
      // Non-fatal audio parameter error – skip this frame.
    }
  }

  dispose(): void {
    this.drone?.dispose();
    this.grain?.dispose();
    this.noise?.dispose();
    this.wobble?.dispose();
    this.breath?.dispose();
    this.running = false;
  }
}
