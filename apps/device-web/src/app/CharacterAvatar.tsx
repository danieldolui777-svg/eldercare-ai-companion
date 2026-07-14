"use client";
import { useEffect, useState } from "react";

export type CharacterState = "idle" | "listening" | "thinking" | "speaking";

// PLACEHOLDER frames (emoji) — proves the mechanic with zero assets.
// To use REAL photos later, just replace each array with image paths, e.g.
//   speaking: ["/character/speaking/1.png", "/character/speaking/2.png", ...]
// The component auto-detects a path (starts with "/" or "http") and shows an
// <img> instead of the emoji. Drop the photos in apps/device-web/public/character/.
const FRAMES: Record<CharacterState, string[]> = {
  idle: ["🙂", "😊", "🙂", "😐"],
  listening: ["🙂", "😊", "☺️", "🙂"],
  thinking: ["🤔", "😐", "🤔", "🙄"],
  speaking: ["😮", "😀", "🙂", "😯", "😃"],
};

const FPS = 4; // deliberately low — the "lag" is the charm (stop-motion feel)

export function CharacterAvatar({ state }: { state: CharacterState }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const frames = FRAMES[state] ?? FRAMES.idle;
    setIdx(0);
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % frames.length);
    }, 1000 / FPS);
    return () => clearInterval(id);
  }, [state]);

  const frames = FRAMES[state] ?? FRAMES.idle;
  const frame = frames[idx % frames.length];
  const isImage = frame.startsWith("/") || frame.startsWith("http");

  return (
    <div className="w-56 h-56 rounded-3xl bg-white/10 border border-white/15 flex items-center justify-center overflow-hidden shadow-lg">
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={frame} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-8xl leading-none select-none">{frame}</span>
      )}
    </div>
  );
}
