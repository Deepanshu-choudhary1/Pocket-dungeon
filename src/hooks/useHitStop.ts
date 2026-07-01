import { useRef, useState, useCallback } from 'react';

interface HitStopReturn {
  /** Current time-scale multiplier (1 = normal, ~0.05 = near-freeze). */
  deltaMultiplier: number;
  /** Call with duration in milliseconds to trigger a hit-stop freeze. */
  triggerHitStop: (durationMs?: number) => void;
}

const FREEZE_MULTIPLIER = 0.04; // nearly frozen — roughly 4% of normal speed
const DEFAULT_DURATION_MS = 75;

/**
 * Drives a brief time-dilation effect on critical hits.
 *
 * Usage in App.tsx:
 *   const { triggerHitStop, deltaMultiplier } = useHitStop();
 *   // Pass deltaMultiplier into <HitStop /> and into useRogueStore
 *   // so enemy useFrame loops can multiply their delta by it.
 *
 * Because R3F doesn't expose a global clock scale, each consumer
 * that wants to respect hit-stop should read deltaMultiplier from
 * the store and multiply their local delta:
 *   const mult = useRogueStore.getState().deltaMultiplier ?? 1;
 *   const scaledDelta = delta * mult;
 */
export function useHitStop(): HitStopReturn {
  const [deltaMultiplier, setDeltaMultiplier] = useState(1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerHitStop = useCallback((durationMs = DEFAULT_DURATION_MS) => {
    // Clear any in-progress hit-stop
    if (timerRef.current) clearTimeout(timerRef.current);
    if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);

    setDeltaMultiplier(FREEZE_MULTIPLIER);

    // Snap back to full speed
    timerRef.current = setTimeout(() => {
      // Brief ease back rather than hard snap for a smoother feel
      setDeltaMultiplier(0.4);
      recoveryTimerRef.current = setTimeout(() => {
        setDeltaMultiplier(1);
      }, 40);
    }, durationMs);
  }, []);

  return { deltaMultiplier, triggerHitStop };
}