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

/**
 * @param effects  optional "laggy video call" feel: occasional frame freezes and
 *                 brief glitch (blur/skew) hiccups. Subtle. Toggle off to disable.
 */
export function CharacterAvatar({
  state,
  effects = true,
  fullScreen = false,
}: {
  state: CharacterState;
  effects?: boolean;
  fullScreen?: boolean;
}) {
  const [idx, setIdx] = useState(0);
  const [glitch, setGlitch] = useState(false);

  // Frame swapper — with an occasional "freeze" when effects are on.
  useEffect(() => {
    const frames = FRAMES[state] ?? FRAMES.idle;
    setIdx(0);
    const id = setInterval(() => {
      if (effects && Math.random() < 0.18) return; // hold the frame (fake lag)
      setIdx((i) => (i + 1) % frames.length);
    }, 1000 / FPS);
    return () => clearInterval(id);
  }, [state, effects]);

  // Occasional brief glitch — like a video-call hiccup (every 3–7s, ~180ms).
  useEffect(() => {
    if (!effects) return;
    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      timer = setTimeout(() => {
        setGlitch(true);
        setTimeout(() => setGlitch(false), 150 + Math.random() * 130);
        loop();
      }, 3000 + Math.random() * 4000);
    };
    loop();
    return () => clearTimeout(timer);
  }, [effects]);

  const frames = FRAMES[state] ?? FRAMES.idle;
  const frame = frames[idx % frames.length];
  const isImage = frame.startsWith("/") || frame.startsWith("http");

  const outerClass = fullScreen
    ? "absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden"
    : "w-56 h-56 rounded-3xl bg-white/10 border border-white/15 flex items-center justify-center overflow-hidden shadow-lg";

  return (
    <div className={outerClass}>
      <div
        className="w-full h-full flex items-center justify-center"
        style={
          glitch
            ? {
                filter: "blur(1.3px) contrast(1.4) saturate(1.15)",
                transform: "translateX(2px) skewX(-1.2deg)",
              }
            : undefined
        }
      >
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={frame}
            alt=""
            className="w-full h-full object-cover"
            style={{ imageRendering: glitch ? "pixelated" : "auto" }}
          />
        ) : (
          <span className={fullScreen ? "text-[10rem] leading-none select-none" : "text-8xl leading-none select-none"}>
            {frame}
          </span>
        )}
      </div>
    </div>
  );
}
