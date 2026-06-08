"use client";

/**
 * SensorMockPanel
 *
 * A development UI that emits the same RawSensorData shape that real hardware
 * would provide via WebSerial / WebSocket / OSC bridge.
 *
 * To connect real hardware later, replace this component with a hook that
 * reads from your transport layer and calls `onSensorChange` with the same
 * RawSensorData interface.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { RawSensorData } from "@/audio/SensorInputMapper";

interface SensorMockPanelProps {
  onSensorChange: (data: RawSensorData) => void;
  onStartAudio: () => void;
  isAudioStarted: boolean;
  currentValues: RawSensorData;
}

export default function SensorMockPanel({
  onSensorChange,
  onStartAudio,
  isAudioStarted,
  currentValues,
}: SensorMockPanelProps) {
  const [touch, setTouch] = useState<0 | 1>(0);
  const [intensity, setIntensity] = useState(0.5);
  const [movementSpeed, setMovementSpeed] = useState(0);
  const [mouseTracking, setMouseTracking] = useState(false);
  const [position, setPosition] = useState({ x: 0.5, y: 0.5 });
  const trackAreaRef = useRef<HTMLDivElement>(null);

  // Emit whenever any slider/button changes
  useEffect(() => {
    onSensorChange({
      touch,
      positionX: position.x,
      positionY: position.y,
      intensity,
      movementSpeed,
    });
  }, [touch, position, intensity, movementSpeed, onSensorChange]);

  // Mouse tracking inside the XY pad
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!mouseTracking) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));

      // Compute movement speed from delta
      const dx = x - position.x;
      const dy = y - position.y;
      const speed = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 20);

      setPosition({ x, y });
      setMovementSpeed(speed);
    },
    [mouseTracking, position],
  );

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setMouseTracking(true);
    setTouch(1);
    handleMouseMove(e);
  };

  const handleMouseUp = () => {
    setMouseTracking(false);
    setTouch(0);
    setMovementSpeed(0);
  };

  // Touch support for mobile/tablet
  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const t = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (t.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (t.clientY - rect.top) / rect.height));
    const dx = x - position.x;
    const dy = y - position.y;
    const speed = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 20);
    setPosition({ x, y });
    setMovementSpeed(speed);
    setTouch(1);
  };

  const handleTouchEnd = () => {
    setTouch(0);
    setMovementSpeed(0);
  };

  const padSize = 240; // px

  return (
    <div className="flex flex-col gap-6 p-6 bg-zinc-900 text-zinc-100 rounded-2xl w-full max-w-lg select-none">
      {/* Start button */}
      <button
        onClick={onStartAudio}
        disabled={isAudioStarted}
        className={`w-full py-3 rounded-xl font-semibold tracking-wide transition-all ${
          isAudioStarted
            ? "bg-emerald-800 text-emerald-300 cursor-default"
            : "bg-emerald-500 hover:bg-emerald-400 text-black"
        }`}
      >
        {isAudioStarted ? "▶ Audio Running" : "▶ Start Audio"}
      </button>

      {/* XY pad */}
      <div className="flex flex-col gap-2">
        <span className="text-xs text-zinc-400 uppercase tracking-widest">
          XY Position (drag here)
        </span>
        <div
          ref={trackAreaRef}
          className="relative bg-zinc-800 rounded-xl border border-zinc-700 cursor-crosshair"
          style={{ width: padSize, height: padSize }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchMove={handleTouchMove}
          onTouchStart={(e) => {
            setTouch(1);
            handleTouchMove(e);
          }}
          onTouchEnd={handleTouchEnd}
        >
          {/* Crosshair lines */}
          <div
            className="absolute top-0 bottom-0 border-l border-zinc-600 pointer-events-none"
            style={{ left: position.x * padSize }}
          />
          <div
            className="absolute left-0 right-0 border-t border-zinc-600 pointer-events-none"
            style={{ top: position.y * padSize }}
          />
          {/* Cursor dot */}
          <div
            className="absolute w-4 h-4 rounded-full bg-emerald-400 shadow-lg pointer-events-none -translate-x-1/2 -translate-y-1/2 transition-none"
            style={{
              left: position.x * padSize,
              top: position.y * padSize,
            }}
          />
          {/* Corner labels */}
          <span className="absolute top-1 left-2 text-[10px] text-zinc-500">x:0 y:0</span>
          <span className="absolute top-1 right-2 text-[10px] text-zinc-500">x:1 y:0</span>
          <span className="absolute bottom-1 left-2 text-[10px] text-zinc-500">x:0 y:1</span>
          <span className="absolute bottom-1 right-2 text-[10px] text-zinc-500">x:1 y:1</span>
        </div>
      </div>

      {/* Intensity slider */}
      <SliderRow
        label="Intensity"
        value={intensity}
        onChange={setIntensity}
        color="emerald"
      />

      {/* Movement speed slider (manual override) */}
      <SliderRow
        label="Movement Speed"
        value={movementSpeed}
        onChange={setMovementSpeed}
        color="violet"
      />

      {/* Touch toggle button */}
      <div className="flex items-center gap-4">
        <span className="text-xs text-zinc-400 uppercase tracking-widest w-28">Touch</span>
        <button
          onPointerDown={() => setTouch(1)}
          onPointerUp={() => setTouch(0)}
          onPointerLeave={() => setTouch(0)}
          className={`px-6 py-2 rounded-lg font-semibold transition-all ${
            touch
              ? "bg-amber-400 text-black scale-95"
              : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
          }`}
        >
          {touch ? "ON" : "OFF"} (hold)
        </button>
      </div>

      {/* Live sensor readout */}
      <div className="mt-2 rounded-xl bg-zinc-800 p-4 font-mono text-xs text-zinc-400 space-y-1">
        <div className="text-zinc-300 font-semibold mb-2">Live sensor values</div>
        <Row label="touch" value={String(Boolean(currentValues.touch))} />
        <Row label="positionX" value={currentValues.positionX.toFixed(3)} />
        <Row label="positionY" value={currentValues.positionY.toFixed(3)} />
        <Row label="intensity" value={currentValues.intensity.toFixed(3)} />
        <Row label="movementSpeed" value={(currentValues.movementSpeed ?? 0).toFixed(3)} />
      </div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  onChange,
  color,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  color: "emerald" | "violet";
}) {
  const accent = color === "emerald" ? "accent-emerald-400" : "accent-violet-400";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-zinc-400">
        <span className="uppercase tracking-widest">{label}</span>
        <span className="tabular-nums">{value.toFixed(3)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full h-2 rounded-full ${accent}`}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-zinc-500">{label}</span>
      <span>{value}</span>
    </div>
  );
}
