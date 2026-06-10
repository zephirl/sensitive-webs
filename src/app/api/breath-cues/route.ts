import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Returns { "1": ["ring-1-1_breathe-in.mp3", ...], "2": [...], ... }
// Files must follow the pattern  ring-{ringNumber}-{n}_{anything}.mp3
// ringNumber is 1-based and matches the Wire / ring numbers in the UI
// (the _{anything} suffix is optional).
export function GET() {
  const dir = path.join(process.cwd(), "public", "audio", "breath-cues");

  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter(f => /\.mp3$/i.test(f));
  } catch {
    // Directory missing or unreadable – return empty groups
  }

  const groups: Record<number, string[]> = {};
  for (const file of files) {
    const match = file.match(/^ring-(\d+)-\d+/i);
    if (!match) continue;
    const ring = parseInt(match[1], 10);
    if (!groups[ring]) groups[ring] = [];
    groups[ring].push(file);
  }

  return NextResponse.json(groups);
}
