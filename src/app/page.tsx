"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SoundscapeEngine } from "@/audio/SoundscapeEngine";
import { SensorInputMapper } from "@/audio/SensorInputMapper";
import type { RawSensorData } from "@/audio/SensorInputMapper";
import { SerialInputSource } from "@/input/SerialInputSource";
import type { SensorInputSource } from "@/input/SensorInputSource";
import { MIN_SPAN } from "@/input/sensorProtocol";

interface WireCal {
  minProx: number; // min proximity – music volume 0 (raw units)
  maxProx: number; // max proximity – music volume full (raw units)
  touch: number;   // breath-cue level (raw units)
}

// Default per-wire calibration (raw units).
const DEFAULT_MIN_PROX = 41000;
const DEFAULT_MAX_PROX = 42000;
const DEFAULT_TOUCH    = 50000;

// Fixed size of the audio bank (ring notes + breath-cue files). The mouse maps
// to this many radial zones so that changing the *visual* ring count never
// shifts which note / breath-cue file plays.
const NUM_AUDIO_RINGS = 8;

// localStorage key for saved per-wire calibration.
const CAL_STORAGE_KEY = "sensitiveWebs.calibration.v1";

/**
 * Set one calibration level while keeping the order minProx ≤ maxProx ≤ touch
 * (max prox can't go below min prox; touch can't go below max prox).
 */
function setOrderedLevel(w: WireCal, key: "minProx" | "maxProx" | "touch", value: number): WireCal {
  if (key === "minProx") return { ...w, minProx: Math.min(value, w.maxProx) };
  if (key === "maxProx") return { ...w, maxProx: Math.min(Math.max(value, w.minProx), w.touch) };
  return { ...w, touch: Math.max(value, w.maxProx) };
}

/** Read saved per-wire calibration from localStorage (empty if none/invalid). */
function loadSavedCal(): WireCal[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = window.localStorage.getItem(CAL_STORAGE_KEY);
    if (!saved) return [];
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((w): w is WireCal =>
        !!w && typeof w.minProx === "number" && typeof w.maxProx === "number" && typeof w.touch === "number")
      .map((w) => ({ minProx: w.minProx, maxProx: w.maxProx, touch: w.touch }));
  } catch {
    return [];
  }
}

// ─── Web geometry constants ───────────────────────────────────────────────────
const MIN_SPOKES    = 1;
const MAX_SPOKES    = 8;
const DEFAULT_SPOKES = 6; // vertices / branches
const MIN_RINGS     = 1;
const MAX_RINGS     = 8;
const DEFAULT_RINGS = 4;  // concentric rings (matches the 4-wire physical web)

/** Evenly spaced spoke angles, first spoke pointing straight up. */
function makeSpokeAngles(n: number): number[] {
  return Array.from({ length: n }, (_, i) => (i / n) * Math.PI * 2 - Math.PI / 2);
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface GlowState {
  x: number;
  y: number;
  startMs: number;
  endMs: number | null;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/** Spoke extends from centre to screen boundary for a dramatic silk-thread effect. */
function spokeLength(angle: number, w: number, h: number): number {
  const hw = (w / 2) * 0.975;
  const hh = (h / 2) * 0.975;
  const ca = Math.abs(Math.cos(angle));
  const sa = Math.abs(Math.sin(angle));
  if (ca < 1e-9) return hh;
  if (sa < 1e-9) return hw;
  return Math.min(hw / ca, hh / sa);
}

/** Minimum distance from point P to segment AB. */
function distToSegment(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * Render one frame.  Returns true when the post-release glow has fully faded.
 */
function renderFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  nowMs: number,
  glow: GlowState | null,
  spokeCount: number,
  ringCount: number,
): boolean {
  const SPOKE_ANGLES = makeSpokeAngles(spokeCount);
  const cx = w / 2;
  const cy = h / 2;

  // ── Background – deep night ────────────────────────────────────────────────
  ctx.fillStyle = "#020810";
  ctx.fillRect(0, 0, w, h);
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(w, h) * 0.58);
  bg.addColorStop(0, "rgba(8, 16, 42, 0.94)");
  bg.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // ── Resolve glow ──────────────────────────────────────────────────────────
  let glowX = 0, glowY = 0, glowR = 0, glowA = 0;
  let glowDone = false;
  if (glow) {
    // Clamp holdMs ≥ 0: RAF timestamp can be fractionally earlier than performance.now()
    const holdMs = Math.max(0, glow.endMs !== null ? glow.endMs - glow.startMs : nowMs - glow.startMs);
    glowR = 8 + Math.min(holdMs / 1000, 1) * 52;
    glowX = glow.x;
    glowY = glow.y;
    if (glow.endMs === null) {
      glowA = 1.0;
    } else {
      glowA = Math.max(0, 1 - (nowMs - glow.endMs) / 800);
      if (glowA <= 0) glowDone = true;
    }
  }

  // Very slow breathing – 0.4 % amplitude, ~25 s period
  const breathe = 1 + 0.004 * Math.sin(nowMs * 0.00025);
  // Precompute spoke lengths once per frame
  const spokeLens = SPOKE_ANGLES.map(a => spokeLength(a, w, h));
  // Uniform radius for hexagonal rings – all vertices equidistant from centre
  const hexRadius = Math.min(w, h) * 0.44;

  // ── Spokes ──────────────────────────────────────────────────────────────────
  ctx.lineCap = "round";
  for (let i = 0; i < spokeCount; i++) {
    const angle = SPOKE_ANGLES[i];
    const len   = spokeLens[i];
    const ex = cx + Math.cos(angle) * len;
    const ey = cy + Math.sin(angle) * len;
    let boost = 0;
    if (glowA > 0) {
      const d = distToSegment(glowX, glowY, cx, cy, ex, ey);
      boost = Math.max(0, 1 - d / (glowR * 5)) * glowA;
    }
    ctx.lineWidth   = 0.55 + boost * 1.3;
    ctx.strokeStyle = boost > 0.06
      ? `rgba(205, 232, 255, ${(0.18 + boost * 0.58).toFixed(3)})`
      : "rgba(168, 200, 255, 0.17)";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }

  // ── Rings – straight line segments between spoke intersection points ────────
  for (let r = 1; r <= ringCount; r++) {
    const t = (r / (ringCount + 1)) * breathe;
    const pts = SPOKE_ANGLES.map((angle) => ({
      x: cx + Math.cos(angle) * hexRadius * t,
      y: cy + Math.sin(angle) * hexRadius * t,
    }));
    const baseOpacity = 0.06 + (r / ringCount) * 0.17;

    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      let boost = 0;
      if (glowA > 0) {
        const d = distToSegment(glowX, glowY, a.x, a.y, b.x, b.y);
        boost = Math.max(0, 1 - d / (glowR * 5)) * glowA;
      }
      ctx.lineWidth   = 0.45 + boost * 2.0;
      ctx.strokeStyle = boost > 0.06
        ? `rgba(195, 232, 255, ${Math.min(1, baseOpacity + boost * 0.78).toFixed(3)})`
        : `rgba(178, 212, 255, ${baseOpacity.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  // ── Dew drops at ring–spoke intersections ────────────────────────────────────
  for (let i = 0; i < spokeCount; i++) {
    const angle = SPOKE_ANGLES[i];
    for (let r = 1; r <= ringCount; r++) {
      const t  = (r / (ringCount + 1)) * breathe;
      const ix = cx + Math.cos(angle) * hexRadius * t;
      const iy = cy + Math.sin(angle) * hexRadius * t;
      let boost = 0;
      if (glowA > 0) {
        const d = Math.hypot(glowX - ix, glowY - iy);
        boost = Math.max(0, 1 - d / (glowR * 4)) * glowA;
      }
      ctx.beginPath();
      ctx.arc(ix, iy, 1.0 + boost * 2.8, 0, Math.PI * 2);
      ctx.fillStyle = boost > 0.05
        ? `rgba(225, 245, 255, ${(0.22 + boost * 0.72).toFixed(3)})`
        : "rgba(205, 225, 255, 0.22)";
      ctx.fill();
    }
  }

  // ── Hub dot ────────────────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.arc(cx, cy, 2.6, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(215, 235, 255, 0.68)";
  ctx.fill();

  // ── Glow orb ────────────────────────────────────────────────────────────────
  if (glowA > 0) drawGlowOrb(ctx, glowX, glowY, glowR, glowA);

  return glowDone;
}

function drawGlowOrb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  R: number,
  alpha: number,
): void {
  // Wide diffuse aura
  const aura = ctx.createRadialGradient(x, y, 0, x, y, R * 8);
  aura.addColorStop(0, `rgba(75, 148, 255, ${(alpha * 0.09).toFixed(3)})`);
  aura.addColorStop(1, "rgba(50, 110, 255, 0)");
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(x, y, R * 8, 0, Math.PI * 2);
  ctx.fill();

  // Mid halo
  const mid = ctx.createRadialGradient(x, y, 0, x, y, R * 3.2);
  mid.addColorStop(0,    `rgba(165, 218, 255, ${(alpha * 0.48).toFixed(3)})`);
  mid.addColorStop(0.45, `rgba(125, 188, 255, ${(alpha * 0.22).toFixed(3)})`);
  mid.addColorStop(1,    "rgba(80, 150, 255, 0)");
  ctx.fillStyle = mid;
  ctx.beginPath();
  ctx.arc(x, y, R * 3.2, 0, Math.PI * 2);
  ctx.fill();

  // Inner bright core
  const core = ctx.createRadialGradient(x, y, 0, x, y, R);
  core.addColorStop(0,    `rgba(255, 255, 255, ${alpha.toFixed(3)})`);
  core.addColorStop(0.28, `rgba(220, 242, 255, ${(alpha * 0.92).toFixed(3)})`);
  core.addColorStop(1,    "rgba(115, 185, 255, 0)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fill();

  // Bright pin
  ctx.beginPath();
  ctx.arc(x, y, Math.max(1.8, R * 0.08), 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
  ctx.fill();
}

/** Map canvas-pixel touch position to the nearest ring index (0 = innermost). */
function computeRingIndex(gx: number, gy: number, w: number, h: number, ringCount: number): number {
  const cx = w / 2;
  const cy = h / 2;
  const hexRadius = Math.min(w, h) * 0.44;
  const d  = Math.hypot(gx - cx, gy - cy);
  const t  = Math.min(1, d / hexRadius);
  const ringNum = Math.round(t * (ringCount + 1));
  return Math.min(ringCount - 1, Math.max(0, ringNum - 1));
}
// ─── Component ────────────────────────────────────────────────────────────────
export default function SpiderWebPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<SoundscapeEngine | null>(null);
  const mapperRef = useRef<SensorInputMapper | null>(null);
  const rawRef = useRef<RawSensorData>({
    touch: 0,
    positionX: 0.5,
    positionY: 0.5,
    intensity: 0,
    movementSpeed: 0,
    ringIndex: 0,
  });
  const glowRef = useRef<GlowState | null>(null);
  const startedRef = useRef(false);
  const startingRef = useRef(false);
  const lastMoveRef = useRef({ x: 0.5, y: 0.5, t: 0 });
  const hoverRingRef = useRef<number>(-1);
  const sensorRingRef = useRef<number>(-1);
  const touchedRef = useRef(false);
  const sourceRef = useRef<SensorInputSource | null>(null);
  const [sensorStatus, setSensorStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [muted, setMuted] = useState(true);
  const mutedRef = useRef(true);
  const [mouseEnabled, setMouseEnabled] = useState(true);
  const mouseEnabledRef = useRef(true);

  // ── Visual web geometry ──────────────────────────────────────────────────────
  const [spokeCount, setSpokeCount] = useState(DEFAULT_SPOKES);
  const spokeCountRef = useRef(DEFAULT_SPOKES);
  useEffect(() => { spokeCountRef.current = spokeCount; }, [spokeCount]);
  const [ringCount, setRingCount] = useState(DEFAULT_RINGS);
  const ringCountRef = useRef(DEFAULT_RINGS);
  useEffect(() => { ringCountRef.current = ringCount; }, [ringCount]);

  // ── Per-wire calibration state ──────────────────────────────────────────────
  const [showCalibration, setShowCalibration] = useState(false);
  const [wireCal, setWireCal] = useState<WireCal[]>(loadSavedCal);
  const wireCalRef = useRef<WireCal[]>(wireCal);
  const liveRawRef = useRef<number[]>([]);              // latest raw value per wire
  const liveNormRef = useRef<number[]>([]);             // latest normalized 0..1 per wire
  const seenLoRef = useRef<number[]>([]);               // lowest raw observed per wire
  const seenHiRef = useRef<number[]>([]);               // highest raw observed per wire
  const [liveNorm, setLiveNorm] = useState<number[]>([]);
  const [liveRaw, setLiveRaw] = useState<number[]>([]);
  const [seenLo, setSeenLo] = useState<number[]>([]);
  const [seenHi, setSeenHi] = useState<number[]>([]);

  useEffect(() => { wireCalRef.current = wireCal; }, [wireCal]);

  // Pump live values into React state ~15 Hz while the panel is open
  useEffect(() => {
    if (!showCalibration) return;
    const id = setInterval(() => {
      setLiveNorm([...liveNormRef.current]);
      setLiveRaw([...liveRawRef.current]);
      setSeenLo([...seenLoRef.current]);
      setSeenHi([...seenHiRef.current]);
    }, 66);
    return () => clearInterval(id);
  }, [showCalibration]);

  // Grow the calibration array to match the wire count the firmware reports
  const ensureWireCount = useCallback((n: number) => {
    if (wireCalRef.current.length < n) {
      const next = [...wireCalRef.current];
      while (next.length < n) {
        next.push({ minProx: DEFAULT_MIN_PROX, maxProx: DEFAULT_MAX_PROX, touch: DEFAULT_TOUCH });
      }
      wireCalRef.current = next;
      setWireCal(next);
    }
  }, []);

  // Capture the current raw value of wire i as one of its calibration levels.
  // Min prox gets +30 of headroom so idle noise stays below the music threshold.
  const captureLevel = useCallback((i: number, key: "minProx" | "maxProx" | "touch") => {
    const raw = liveRawRef.current[i] ?? 0;
    const value = key === "minProx" ? raw + 30 : raw;
    setWireCal((prev) => {
      const next = prev.map((w, idx) => (idx === i ? setOrderedLevel(w, key, value) : w));
      wireCalRef.current = next;
      return next;
    });
  }, []);

  // Slider change for one calibration level, keeping minProx ≤ maxProx ≤ touch.
  const updateWireCal = useCallback((i: number, key: "minProx" | "maxProx" | "touch", value: number) => {
    setWireCal((prev) => {
      const next = prev.map((w, idx) => (idx === i ? setOrderedLevel(w, key, value) : w));
      wireCalRef.current = next;
      return next;
    });
  }, []);

  const adjustSpokes = useCallback((delta: number) => {
    setSpokeCount((v) => Math.min(MAX_SPOKES, Math.max(MIN_SPOKES, v + delta)));
  }, []);
  const adjustRings = useCallback((delta: number) => {
    setRingCount((v) => Math.min(MAX_RINGS, Math.max(MIN_RINGS, v + delta)));
  }, []);

  const saveCalibration = useCallback(() => {
    try {
      localStorage.setItem(CAL_STORAGE_KEY, JSON.stringify(wireCalRef.current));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const resetCalibration = useCallback(() => {
    const next = wireCalRef.current.map(() => ({
      minProx: DEFAULT_MIN_PROX,
      maxProx: DEFAULT_MAX_PROX,
      touch: DEFAULT_TOUCH,
    }));
    wireCalRef.current = next;
    setWireCal(next);
    seenLoRef.current = [];
    seenHiRef.current = [];
    try {
      localStorage.removeItem(CAL_STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
  }, []);

  // Panic stop: silence the ambient note + every playing breath cue.
  const silenceAll = useCallback(() => {
    engineRef.current?.silenceAll();
    hoverRingRef.current = -1;
    sensorRingRef.current = -1;
    touchedRef.current = false;
    rawRef.current = { ...rawRef.current, touch: 0, intensity: 0, movementSpeed: 0 };
    const g = glowRef.current;
    if (g && g.endMs === null) glowRef.current = { ...g, endMs: performance.now() };
  }, []);

  // ── Canvas resize ────────────────────────────────────────────────────────────
  useEffect(() => {
    const resize = () => {
      const c = canvasRef.current;
      if (!c) return;
      c.width = window.innerWidth;
      c.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // ── Main RAF loop (visual + audio) ──────────────────────────────────────────
  useEffect(() => {
    let raf: number;
    const tick = (nowMs: number) => {
      const canvas = canvasRef.current;
      if (canvas && canvas.width > 0) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const done = renderFrame(ctx, canvas.width, canvas.height, nowMs, glowRef.current, spokeCountRef.current, ringCountRef.current);
          if (done) glowRef.current = null;
        }
      }
      const engine = engineRef.current;
      const mapper = mapperRef.current;
      if (engine && mapper) {
        engine.update(mapper.update(rawRef.current));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      void sourceRef.current?.stop();
      engineRef.current?.dispose();
    };
  }, []);

  // Lazily create + start the audio engine. Must be called from a user gesture
  // (pointer or button click) to satisfy browser autoplay policies.
  const ensureEngine = useCallback(async () => {
    if (startedRef.current || startingRef.current) return;
    startingRef.current = true;
    const engine = new SoundscapeEngine();
    const mapper = new SensorInputMapper();
    await engine.start();
    engine.setMuted(mutedRef.current);
    engineRef.current = engine;
    mapperRef.current = mapper;
    startedRef.current = true;
  }, []);

  const toggleMuted = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      mutedRef.current = next;
      engineRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const toggleMouse = useCallback(() => {
    setMouseEnabled((on) => {
      const next = !on;
      mouseEnabledRef.current = next;
      if (!next) {
        // Disabling: release any mouse-held note and clear hover state.
        hoverRingRef.current = -1;
        engineRef.current?.releaseNote();
        const g = glowRef.current;
        if (g && g.endMs === null) glowRef.current = { ...g, endMs: performance.now() };
      }
      return next;
    });
  }, []);

  // ── Hardware sensor input (capacitive web via XIAO ESP32-S3) ─────────────────
  const handleSensorReading = useCallback((channels: number[]) => {
    const engine = engineRef.current;
    ensureWireCount(channels.length);

    const cal = wireCalRef.current;

    // Per-wire: music volume ramps minProx→maxProx; cue fires at the touch level.
    const vols: number[] = new Array(channels.length);
    let bestWire = -1;
    let bestU = 0;        // how far past min-proximity (used to rank wires)
    let bestVol = 0;      // music volume of the active wire
    let bestReached = false;
    for (let i = 0; i < channels.length; i++) {
      const raw = channels[i];
      const c = cal[i];

      // Track the observed envelope (the values around the captured levels).
      if (seenLoRef.current[i] === undefined) {
        seenLoRef.current[i] = raw;
        seenHiRef.current[i] = raw;
      } else {
        if (raw < seenLoRef.current[i]) seenLoRef.current[i] = raw;
        if (raw > seenHiRef.current[i]) seenHiRef.current[i] = raw;
      }

      // Music volume = (raw - minProx) / (maxProx - minProx), clamped 0..1.
      // Direction-agnostic: the span can be negative if approaching lowers raw.
      const musicSpan = c ? c.maxProx - c.minProx : 0;
      const calibrated = Math.abs(musicSpan) >= MIN_SPAN;
      const u = calibrated ? (raw - c.minProx) / musicSpan : 0; // 0 at min, 1 at max
      vols[i] = Math.min(1, Math.max(0, u));

      // Active wire = the one pushed furthest past its min-proximity.
      if (calibrated && u > 0 && u > bestU) {
        bestU = u;
        bestVol = vols[i];
        bestWire = i;
        const cueSpan = c.touch - c.minProx;
        bestReached = Math.abs(cueSpan) >= MIN_SPAN
          ? (raw - c.minProx) / cueSpan >= 0.999
          : false;
      }
    }

    liveRawRef.current = channels;
    liveNormRef.current = vols;

    // ── No wire past its min-proximity → release everything ────────────────────
    if (bestWire < 0) {
      if (sensorRingRef.current !== -1) {
        sensorRingRef.current = -1;
        touchedRef.current = false;
        engine?.releaseNote();
        rawRef.current = { ...rawRef.current, touch: 0, intensity: 0, movementSpeed: 0 };
        const g = glowRef.current;
        if (g && g.endMs === null) glowRef.current = { ...g, endMs: performance.now() };
      }
      return;
    }

    rawRef.current = {
      touch: 1,
      positionX: 0.5,
      positionY: 0.5,
      intensity: bestVol,
      movementSpeed: 0,
      ringIndex: bestWire,
    };

    // New wire entering proximity → start its ambient note
    if (bestWire !== sensorRingRef.current) {
      sensorRingRef.current = bestWire;
      touchedRef.current = false;
      engine?.triggerNote(bestWire);

      const canvas = canvasRef.current;
      if (canvas) {
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const hexRadius = Math.min(canvas.width, canvas.height) * 0.44;
        const rc = ringCountRef.current;
        const t = (Math.min(bestWire, rc - 1) + 1) / (rc + 1);
        const angle = -Math.PI / 2;
        glowRef.current = {
          x: cx + Math.cos(angle) * hexRadius * t,
          y: cy + Math.sin(angle) * hexRadius * t,
          startMs: performance.now(),
          endMs: null,
        };
      }
    }

    // ── Reached the touch level → fire the breath cue once per contact ─────────
    if (bestReached) {
      if (!touchedRef.current) {
        touchedRef.current = true;
        engine?.playBreathCue(bestWire);
      }
    } else {
      touchedRef.current = false; // hysteresis: re-arm when it dips back down
    }
  }, [ensureWireCount]);

  const connectSensor = useCallback(async () => {
    if (sourceRef.current) return;
    setSensorStatus("connecting");
    try {
      await ensureEngine();
      const source = new SerialInputSource(handleSensorReading);
      await source.start();
      sourceRef.current = source;
      setSensorStatus("connected");
    } catch (err) {
      console.error("Sensor connection failed:", err);
      setSensorStatus("error");
    }
  }, [ensureEngine, handleSensorReading]);

  // ── Pointer events ───────────────────────────────────────────────────────────
  const handlePointerDown = useCallback(
    async (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !mouseEnabledRef.current) return;
      (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);

      // First interaction starts the AudioContext (required by browsers)
      await ensureEngine();

      const rect = canvas.getBoundingClientRect();
      const px   = (e.clientX - rect.left) / rect.width;
      const py   = (e.clientY - rect.top)  / rect.height;
      const gx   = e.clientX - rect.left;
      const gy   = e.clientY - rect.top;
      const now  = performance.now();
      const ring = computeRingIndex(gx, gy, canvas.width, canvas.height, NUM_AUDIO_RINGS);

      // Seed hover state so music starts even without subsequent move
      if (ring !== hoverRingRef.current) {
        hoverRingRef.current = ring;
        engineRef.current?.triggerNote(ring);
      }

      // Play the ring's breath-cue sample on click
      engineRef.current?.playBreathCue(ring);

      glowRef.current = { x: gx, y: gy, startMs: now, endMs: null };
      lastMoveRef.current = { x: px, y: py, t: now };

      rawRef.current = {
        touch: 1,
        positionX: px,
        positionY: py,
        intensity: 0,
        movementSpeed: 0,
        ringIndex: ring,
      };
    },
    [ensureEngine],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !mouseEnabledRef.current) return;

      const rect  = canvas.getBoundingClientRect();
      const px    = (e.clientX - rect.left) / rect.width;
      const py    = (e.clientY - rect.top)  / rect.height;
      const gx    = e.clientX - rect.left;
      const gy    = e.clientY - rect.top;
      const now   = performance.now();
      const dt    = (now - lastMoveRef.current.t) / 1000;
      const dx    = px - lastMoveRef.current.x;
      const dy    = py - lastMoveRef.current.y;
      const speed = dt > 0.005 ? Math.min(1, (Math.sqrt(dx * dx + dy * dy) / dt) * 2) : 0;
      const ring  = computeRingIndex(gx, gy, canvas.width, canvas.height, NUM_AUDIO_RINGS);

      lastMoveRef.current = { x: px, y: py, t: now };

      // Create or refresh the glow on every move (hover and drag)
      const prev = glowRef.current;
      if (!prev || prev.endMs !== null) {
        glowRef.current = { x: gx, y: gy, startMs: now, endMs: null };
      } else {
        glowRef.current = { ...prev, x: gx, y: gy };
      }

      // Hover produces softer modulation than a held press
      const isHover = e.buttons === 0;
      const elapsed = (now - glowRef.current.startMs) / 1000;
      rawRef.current = {
        touch: 1,
        positionX: px,
        positionY: py,
        intensity: Math.min(elapsed, isHover ? 0.45 : 1.0),
        movementSpeed: speed,
        ringIndex: ring,
      };

      // Trigger the ambient soundscape note whenever the ring changes
      if (engineRef.current?.isRunning && ring !== hoverRingRef.current) {
        hoverRingRef.current = ring;
        engineRef.current.triggerNote(ring);
      }
    },
    [],
  );

  // Shared cleanup for pointer-up and pointer-leave
  const handlePointerEnd = useCallback(() => {
    if (!mouseEnabledRef.current) return;
    const glow = glowRef.current;
    if (glow && glow.endMs === null) {
      glowRef.current = { ...glow, endMs: performance.now() };
    }
    hoverRingRef.current = -1;
    rawRef.current = { ...rawRef.current, touch: 0, intensity: 0, movementSpeed: 0 };
    engineRef.current?.releaseNote();
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", background: "#020509" }}>
      <canvas
        ref={canvasRef}
        style={{ display: "block", touchAction: "none", cursor: "crosshair" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerLeave={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      />
      <button
        onClick={connectSensor}
        disabled={sensorStatus === "connecting" || sensorStatus === "connected"}
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          padding: "8px 16px",
          fontSize: 13,
          fontFamily: "system-ui, sans-serif",
          color: "rgba(205, 232, 255, 0.9)",
          background: "rgba(8, 16, 42, 0.6)",
          border: "1px solid rgba(168, 200, 255, 0.3)",
          borderRadius: 8,
          cursor: sensorStatus === "connected" ? "default" : "pointer",
          backdropFilter: "blur(4px)",
        }}
      >
        {sensorStatus === "idle"       && "Connect web"}
        {sensorStatus === "connecting" && "Connecting…"}
        {sensorStatus === "connected"  && "● Web connected"}
        {sensorStatus === "error"      && "Connection failed — retry"}
      </button>

      <div style={{ position: "fixed", top: 20, right: 20, display: "flex", gap: 8 }}>
        <button
          onClick={toggleMouse}
          title={mouseEnabled ? "Mouse drives the sound" : "Mouse does not drive the sound"}
          style={{
            padding: "8px 14px",
            fontSize: 13,
            fontFamily: "system-ui, sans-serif",
            color: mouseEnabled ? "rgba(205, 232, 255, 0.9)" : "rgba(170, 180, 200, 0.7)",
            background: mouseEnabled ? "rgba(8, 16, 42, 0.6)" : "rgba(20, 24, 36, 0.6)",
            border: `1px solid ${mouseEnabled ? "rgba(168, 200, 255, 0.3)" : "rgba(150, 160, 180, 0.25)"}`,
            borderRadius: 8,
            cursor: "pointer",
            backdropFilter: "blur(4px)",
          }}
        >
          {mouseEnabled ? "🖱 Mouse on" : "🖱 Mouse off"}
        </button>
        <button
          onClick={toggleMuted}
          title={muted ? "Sound is off" : "Sound is on"}
          style={{
            padding: "8px 14px",
            fontSize: 13,
            fontFamily: "system-ui, sans-serif",
            color: muted ? "rgba(255, 210, 210, 0.95)" : "rgba(205, 232, 255, 0.9)",
            background: muted ? "rgba(60, 12, 16, 0.6)" : "rgba(8, 16, 42, 0.6)",
            border: `1px solid ${muted ? "rgba(255, 150, 150, 0.35)" : "rgba(168, 200, 255, 0.3)"}`,
            borderRadius: 8,
            cursor: "pointer",
            backdropFilter: "blur(4px)",
          }}
        >
          {muted ? "🔇 Sound off" : "🔊 Sound on"}
        </button>
        <button
          onClick={silenceAll}
          style={{
            padding: "8px 16px",
            fontSize: 13,
            fontFamily: "system-ui, sans-serif",
            color: "rgba(205, 232, 255, 0.9)",
            background: "rgba(8, 16, 42, 0.6)",
            border: "1px solid rgba(168, 200, 255, 0.3)",
            borderRadius: 8,
            cursor: "pointer",
            backdropFilter: "blur(4px)",
          }}
        >
          ◼ Reset voices
        </button>
      </div>

      <button
        onClick={() => setShowCalibration((v) => !v)}
        style={{
          position: "fixed",
          bottom: 20,
          right: 160,
          padding: "8px 16px",
          fontSize: 13,
          fontFamily: "system-ui, sans-serif",
          color: "rgba(205, 232, 255, 0.9)",
          background: "rgba(8, 16, 42, 0.6)",
          border: "1px solid rgba(168, 200, 255, 0.3)",
          borderRadius: 8,
          cursor: "pointer",
          backdropFilter: "blur(4px)",
        }}
      >
        {showCalibration ? "Hide settings" : "Settings"}
      </button>

      {showCalibration && (
        <CalibrationPanel
          wireCal={wireCal}
          vols={liveNorm}
          raws={liveRaw}
          seenLo={seenLo}
          seenHi={seenHi}
          onChange={updateWireCal}
          onCapture={captureLevel}
          onSave={saveCalibration}
          onReset={resetCalibration}
          spokeCount={spokeCount}
          ringCount={ringCount}
          onAdjustSpokes={adjustSpokes}
          onAdjustRings={adjustRings}
        />
      )}
    </div>
  );
}

const vertexBtn: React.CSSProperties = {
  width: 24,
  height: 24,
  fontSize: 16,
  lineHeight: "1",
  color: "rgba(205, 232, 255, 0.9)",
  background: "rgba(168, 200, 255, 0.12)",
  border: "1px solid rgba(168, 200, 255, 0.3)",
  borderRadius: 6,
  cursor: "pointer",
};

// ─── Calibration panel ──────────────────────────────────────────────────────
function CalibrationPanel({
  wireCal,
  vols,
  raws,
  seenLo,
  seenHi,
  onChange,
  onCapture,
  onSave,
  onReset,
  spokeCount,
  ringCount,
  onAdjustSpokes,
  onAdjustRings,
}: {
  wireCal: WireCal[];
  vols: number[];
  raws: number[];
  seenLo: number[];
  seenHi: number[];
  onChange: (i: number, key: keyof WireCal, value: number) => void;
  onCapture: (i: number, key: "minProx" | "maxProx" | "touch") => void;
  onSave: () => void;
  onReset: () => void;
  spokeCount: number;
  ringCount: number;
  onAdjustSpokes: (delta: number) => void;
  onAdjustRings: (delta: number) => void;
}) {
  const captureBtn: React.CSSProperties = {
    flex: 1,
    padding: "3px 8px",
    fontSize: 10,
    color: "rgba(205, 232, 255, 0.85)",
    background: "rgba(168, 200, 255, 0.1)",
    border: "1px solid rgba(168, 200, 255, 0.25)",
    borderRadius: 5,
    cursor: "pointer",
  };
  return (
    <div
      style={{
        position: "fixed",
        top: 20,
        left: 20,
        width: 330,
        maxHeight: "calc(100vh - 40px)",
        overflowY: "auto",
        padding: 16,
        fontFamily: "system-ui, sans-serif",
        color: "rgba(205, 232, 255, 0.9)",
        background: "rgba(6, 12, 32, 0.85)",
        border: "1px solid rgba(168, 200, 255, 0.25)",
        borderRadius: 12,
        backdropFilter: "blur(6px)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Settings</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onSave} style={{ ...captureBtn, flex: "0 0 auto" }}>Save</button>
          <button onClick={onReset} style={{ ...captureBtn, flex: "0 0 auto" }}>Reset</button>
        </div>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.8, margin: "0 0 6px" }}>Per-wire calibration</div>
      <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 14, lineHeight: 1.4 }}>
        All values are raw. The <b>Set</b> buttons snapshot the current reading; fine-tune with
        the sliders. <span style={{ color: "#8aa8dc" }}>Min&nbsp;prox</span> = music volume 0,
        {" "}<span style={{ color: "#e6c34b" }}>Max&nbsp;prox</span> = full volume,
        {" "}<span style={{ color: "#5be08a" }}>Touch</span> = voice cue triggers.
        The colour bar shows the music volume; <i>seen</i> is the observed raw range.
      </div>

      {wireCal.length === 0 && (
        <div style={{ fontSize: 11, opacity: 0.6 }}>
          Connect the web to see incoming values…
        </div>
      )}

      {wireCal.map((cal, i) => {
        const vol = vols[i] ?? 0;
        const raw = raws[i] ?? 0;
        const lo = seenLo[i];
        const hi = seenHi[i];

        // Slider bounds: wide enough to cover the observed envelope so the
        // handles can reach any captured/observed value.
        const vals = [cal.minProx, cal.maxProx, cal.touch];
        if (lo !== undefined) vals.push(lo);
        if (hi !== undefined) vals.push(hi);
        let axisLo = Math.min(...vals);
        let axisHi = Math.max(...vals);
        if (!(axisHi > axisLo)) { axisLo -= 50; axisHi += 50; }
        const pad = Math.max(20, (axisHi - axisLo) * 0.08);
        axisLo = Math.max(0, Math.floor(axisLo - pad));
        axisHi = Math.ceil(axisHi + pad);

        // Signal-strip axis: tight around the calibrated levels so the green
        // (touch) tick sits ~5% from the end. Include observed dips on the low
        // side so the live marker stays visible.
        const levels = [cal.minProx, cal.maxProx, cal.touch];
        const topV = Math.max(...levels);
        let botV = Math.min(...levels);
        if (lo !== undefined) botV = Math.min(botV, lo);
        let sbase = topV - botV;
        if (!(sbase > 0)) sbase = 100;
        const stripLo = botV - sbase * 0.05;
        const stripHi = topV + sbase * 0.05;
        const stripPct = (v: number) =>
          Math.min(100, Math.max(0, ((v - stripLo) / (stripHi - stripLo)) * 100));

        // Colour bar = music volume (minProx→maxProx). Grey at zero, yellow once
        // the music is on, green once the signal reaches the touch level.
        const cueSpan = cal.touch - cal.minProx;
        const reached = Math.abs(cueSpan) >= 1
          ? (raw - cal.minProx) / cueSpan >= 0.999
          : false;
        const pct = Math.round(Math.min(1, Math.max(0, vol)) * 100);
        const fill = reached
          ? "#5be08a"
          : vol > 0
          ? "#e6c34b"
          : "rgba(120, 160, 220, 0.7)";

        return (
          <div
            key={i}
            style={{
              marginBottom: 14,
              paddingBottom: 12,
              borderBottom: "1px solid rgba(168, 200, 255, 0.12)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
              <span style={{ fontWeight: 600 }}>Wire {i + 1}</span>
              <span style={{ opacity: 0.75, fontSize: 11 }}>
                raw {raw.toFixed(0)}
                {lo !== undefined && hi !== undefined && ` · seen ${lo.toFixed(0)}–${hi.toFixed(0)}`}
              </span>
            </div>

            {/* Music-volume colour bar (minProx→maxProx) */}
            <div style={{ position: "relative", height: 10, background: "rgba(255,255,255,0.08)", borderRadius: 5, marginBottom: 4 }}>
              <div style={{ width: `${pct}%`, height: "100%", background: fill, borderRadius: 5, transition: "width 0.05s linear" }} />
            </div>

            {/* Raw signal strip showing where min/max prox + touch + live raw sit */}
            <div style={{ position: "relative", height: 8, marginBottom: 8 }}>
              <div style={{ position: "absolute", top: 3, left: 0, right: 0, height: 2, background: "rgba(255,255,255,0.10)" }} />
              <div style={{ position: "absolute", top: 0, left: `${stripPct(cal.minProx)}%`, width: 2, height: 8, background: "#8aa8dc" }} />
              <div style={{ position: "absolute", top: 0, left: `${stripPct(cal.maxProx)}%`, width: 2, height: 8, background: "#e6c34b" }} />
              <div style={{ position: "absolute", top: 0, left: `${stripPct(cal.touch)}%`, width: 2, height: 8, background: "#5be08a" }} />
              <div style={{ position: "absolute", top: -1, left: `${stripPct(raw)}%`, width: 2, height: 10, background: "#ffffff" }} />
            </div>

            <RawSlider label="Min prox" color="#8aa8dc" value={cal.minProx} min={axisLo} max={axisHi} onChange={(v) => onChange(i, "minProx", v)} />
            <RawSlider label="Max prox" color="#e6c34b" value={cal.maxProx} min={axisLo} max={axisHi} onChange={(v) => onChange(i, "maxProx", v)} />
            <RawSlider label="Touch"    color="#5be08a" value={cal.touch}   min={axisLo} max={axisHi} onChange={(v) => onChange(i, "touch", v)} />

            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button onClick={() => onCapture(i, "minProx")} style={captureBtn}>Set min</button>
              <button onClick={() => onCapture(i, "maxProx")} style={captureBtn}>Set max</button>
              <button onClick={() => onCapture(i, "touch")} style={captureBtn}>Set touch</button>
            </div>
          </div>
        );
      })}

      {/* ── Visual web structure ──────────────────────────────────────────── */}
      <div style={{ borderTop: "1px solid rgba(168, 200, 255, 0.2)", margin: "4px 0 12px" }} />
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Visual Web Structure</div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 8 }}>
        <span style={{ flex: 1, opacity: 0.85 }}>Vertices</span>
        <button onClick={() => onAdjustSpokes(-1)} disabled={spokeCount <= MIN_SPOKES} style={vertexBtn}>−</button>
        <span style={{ width: 18, textAlign: "center", fontWeight: 600 }}>{spokeCount}</span>
        <button onClick={() => onAdjustSpokes(1)} disabled={spokeCount >= MAX_SPOKES} style={vertexBtn}>+</button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
        <span style={{ flex: 1, opacity: 0.85 }}>Rings</span>
        <button onClick={() => onAdjustRings(-1)} disabled={ringCount <= MIN_RINGS} style={vertexBtn}>−</button>
        <span style={{ width: 18, textAlign: "center", fontWeight: 600 }}>{ringCount}</span>
        <button onClick={() => onAdjustRings(1)} disabled={ringCount >= MAX_RINGS} style={vertexBtn}>+</button>
      </div>
    </div>
  );
}

function RawSlider({
  label, color, value, min, max, onChange,
}: {
  label: string;
  color: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, marginTop: 4 }}>
      <span style={{ width: 64, color }}>{label}</span>
      <input
        type="range" min={min} max={max} step={1}
        value={Math.min(max, Math.max(min, value))}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: color }}
      />
      <span style={{ width: 48, textAlign: "right" }}>{value.toFixed(0)}</span>
    </div>
  );
}


