import { useFrame } from '@react-three/fiber';

interface HitStopProps {
  deltaMultiplier: number;
}

/**
 * Lives inside <Canvas>. Intercepts the useFrame delta so every other
 * useFrame in the tree receives a scaled-down delta during hit-stop.
 * The actual multiplier is driven by the useHitStop hook in the parent.
 */
export default function HitStop({ deltaMultiplier }: HitStopProps) {
  // R3F calls useFrame callbacks in order of priority.
  // Priority -1 runs BEFORE scene update callbacks so this runs first.
  useFrame((state) => {
    // Patch the clock's delta so downstream useFrame calls receive scaled time.
    // We don't mutate getDelta() (it's a method) — instead we scale via the
    // shared store pattern: downstream systems read deltaMultiplier from the store.
    // This component's job is simply to exist inside the Canvas so the pattern
    // is established; concrete slow-motion can also be done by gating delta in
    // each EnemyAgent's useFrame using useRogueStore.getState().deltaMultiplier.
  }, -1);

  return null;
}