/**
 * SensorInputMapper
 *
 * Normalises and smooths raw sensor data before it reaches the audio engine.
 * All values are expected in [0, 1] range except where noted.
 *
 * Keeping the input layer here makes it trivial to swap mock sliders for
 * WebSerial, WebSocket, or an OSC-bridge later: just call `update()` with
 * the real sensor payload and the rest of the system is unchanged.
 */

export interface RawSensorData {
  /** 0 = no touch, 1 = touch active */
  touch: 0 | 1 | boolean;
  /** Horizontal position, 0 (left) → 1 (right) */
  positionX: number;
  /** Vertical position, 0 (top) → 1 (bottom) */
  positionY: number;
  /** Overall intensity / pressure, 0 → 1 */
  intensity: number;
  /** Optional movement speed, 0 → 1 */
  movementSpeed?: number;
  /** Web ring index, 0 = innermost (C4), 7 = outermost (C5) */
  ringIndex?: number;
}

export interface MappedSensorData {
  touch: boolean;
  positionX: number;
  positionY: number;
  intensity: number;
  movementSpeed: number;
  /** Discrete ring index – passed through without smoothing */
  ringIndex: number;
}

/**
 * Simple one-pole low-pass smoother: y = α·x + (1−α)·y_prev
 * α close to 1 → fast tracking; α close to 0 → heavy smoothing.
 */
class Smoother {
  private value: number;
  constructor(
    private alpha: number,
    initial = 0,
  ) {
    this.value = initial;
  }

  update(target: number): number {
    this.value = this.alpha * target + (1 - this.alpha) * this.value;
    return this.value;
  }

  get current(): number {
    return this.value;
  }

  reset(v: number) {
    this.value = v;
  }
}

const SMOOTHING = 0.08; // ~12 % per frame at 60 fps → gentle lag

export class SensorInputMapper {
  private smoothers = {
    positionX: new Smoother(SMOOTHING, 0.5),
    positionY: new Smoother(SMOOTHING, 0.5),
    intensity: new Smoother(SMOOTHING, 0),
    movementSpeed: new Smoother(SMOOTHING, 0),
  };

  private mapped: MappedSensorData = {
    touch: false,
    positionX: 0.5,
    positionY: 0.5,
    intensity: 0,
    movementSpeed: 0,
    ringIndex: 0,
  };

  /** Call this every frame (or whenever new sensor data arrives). */
  update(raw: RawSensorData): MappedSensorData {
    const touch = Boolean(raw.touch);

    const positionX = this.smoothers.positionX.update(clamp01(raw.positionX));
    const positionY = this.smoothers.positionY.update(clamp01(raw.positionY));
    const intensity = this.smoothers.intensity.update(clamp01(raw.intensity));
    const movementSpeed = this.smoothers.movementSpeed.update(
      clamp01(raw.movementSpeed ?? 0),
    );

    const ringIndex = raw.ringIndex ?? 0;
    this.mapped = { touch, positionX, positionY, intensity, movementSpeed, ringIndex };
    return this.mapped;
  }

  get current(): MappedSensorData {
    return this.mapped;
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
