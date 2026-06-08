"use client";

import { useCallback, useEffect, useRef } from "react";
import { SoundscapeEngine } from "@/audio/SoundscapeEngine";
import { SensorInputMapper } from "@/audio/SensorInputMapper";
import type { RawSensorData } from "@/audio/SensorInputMapper";

// ─── Web geometry constants ───────────────────────────────────────────────────
const NUM_SPOKES = 6;
const NUM_RINGS  = 8;

// Perfect hexagonal symmetry – no jitter, central symmetry
const SPOKE_ANGLES = Array.from({ length: NUM_SPOKES }, (_, i) =>
  (i / NUM_SPOKES) * Math.PI * 2 - Math.PI / 2
);

// ─── Types ────────────────────────────────────────────────────────────────────
interface GlowState {
  x: number;
  y: number;
  startMs: number;
  endMs: number | null;
}

interface SpokeData {
  cos: number;
  sin: number;
  len: number;
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
): boolean {
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
  for (let i = 0; i < NUM_SPOKES; i++) {
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
  for (let r = 1; r <= NUM_RINGS; r++) {
    const t = (r / (NUM_RINGS + 1)) * breathe;
    const pts = SPOKE_ANGLES.map((angle) => ({
      x: cx + Math.cos(angle) * hexRadius * t,
      y: cy + Math.sin(angle) * hexRadius * t,
    }));
    const baseOpacity = 0.06 + (r / NUM_RINGS) * 0.17;

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
  for (let i = 0; i < NUM_SPOKES; i++) {
    const angle = SPOKE_ANGLES[i];
    for (let r = 1; r <= NUM_RINGS; r++) {
      const t  = (r / (NUM_RINGS + 1)) * breathe;
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
function computeRingIndex(gx: number, gy: number, w: number, h: number): number {
  const cx = w / 2;
  const cy = h / 2;
  const hexRadius = Math.min(w, h) * 0.44;
  const d  = Math.hypot(gx - cx, gy - cy);
  const t  = Math.min(1, d / hexRadius);
  const ringNum = Math.round(t * (NUM_RINGS + 1));
  return Math.min(NUM_RINGS - 1, Math.max(0, ringNum - 1));
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
          const done = renderFrame(ctx, canvas.width, canvas.height, nowMs, glowRef.current);
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
      engineRef.current?.dispose();
    };
  }, []);

  // ── Pointer events ───────────────────────────────────────────────────────────
  const handlePointerDown = useCallback(
    async (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);

      // First interaction starts the AudioContext (required by browsers)
      if (!startedRef.current && !startingRef.current) {
        startingRef.current = true;
        const engine = new SoundscapeEngine();
        const mapper = new SensorInputMapper();
        await engine.start();
        engineRef.current = engine;
        mapperRef.current = mapper;
        startedRef.current = true;
      }

      const rect = canvas.getBoundingClientRect();
      const px  = (e.clientX - rect.left) / rect.width;
      const py  = (e.clientY - rect.top)  / rect.height;
      const gx  = e.clientX - rect.left;
      const gy  = e.clientY - rect.top;
      const now = performance.now();
      const ring = computeRingIndex(gx, gy, canvas.width, canvas.height);

      glowRef.current = {
        x: gx,
        y: gy,
        startMs: now,
        endMs: null,
      };
      lastMoveRef.current = { x: px, y: py, t: now };

      rawRef.current = {
        touch: 1,
        positionX: px,
        positionY: py,
        intensity: 0,
        movementSpeed: 0,
        ringIndex: ring,
      };

      // Trigger note directly from pointer event for precise timing
      engineRef.current?.triggerNote(ring);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const glow = glowRef.current;
      if (!glow || glow.endMs !== null) return;

      const rect = canvas.getBoundingClientRect();
      const px   = (e.clientX - rect.left) / rect.width;
      const py   = (e.clientY - rect.top)  / rect.height;
      const gx   = e.clientX - rect.left;
      const gy   = e.clientY - rect.top;
      const now  = performance.now();
      const dt   = (now - lastMoveRef.current.t) / 1000;
      const dx   = px - lastMoveRef.current.x;
      const dy   = py - lastMoveRef.current.y;
      const speed = dt > 0.005 ? Math.min(1, (Math.sqrt(dx * dx + dy * dy) / dt) * 2) : 0;
      const ring  = computeRingIndex(gx, gy, canvas.width, canvas.height);

      lastMoveRef.current = { x: px, y: py, t: now };

      // Glow follows the finger
      glowRef.current = {
        ...glow,
        x: gx,
        y: gy,
      };

      const holdSecs = (now - glow.startMs) / 1000;
      rawRef.current = {
        touch: 1,
        positionX: px,
        positionY: py,
        intensity: Math.min(holdSecs, 1),
        movementSpeed: speed,
        ringIndex: ring,
      };
    },
    [],
  );

  const handlePointerUp = useCallback(() => {
    const glow = glowRef.current;
    if (!glow || glow.endMs !== null) return;

    const now = performance.now();
    const holdSecs = Math.min((now - glow.startMs) / 1000, 1);
    glowRef.current = { ...glow, endMs: now };

    rawRef.current = {
      ...rawRef.current,
      touch: 0,
      intensity: holdSecs,
      movementSpeed: 0,
    };

    // Release note directly from pointer event
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
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  );
}


