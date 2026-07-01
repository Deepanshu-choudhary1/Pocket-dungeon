import { useMemo } from 'react';
import { useRogueStore } from '@/store/rogueStore';
import { generateDungeon, DungeonGrid } from '@/utils/DungeonGenerator';
import { dungeonGridToNavGrid, NavGrid } from '@/components/entities/MultiAgentEnemy';
import {
  TILE_SIZE,
  DUNGEON_WIDTH,
  DUNGEON_HEIGHT,
  MIN_ROOM_SIZE,
  MAX_ROOM_SIZE,
  BSP_MAX_DEPTH,
  CORRIDOR_WIDTH,
} from '@/constant/gameConfig';

interface DungeonGeneratorResult {
  grid: DungeonGrid | null;
  navGrid: NavGrid | null;
}

// Note: NavGrid is declared in MultiAgentEnemies but re-exported here for cleaner imports
export type { NavGrid };

/**
 * Reactively generates a new dungeon whenever the seed in rogueStore changes.
 *
 * The result is memoised by seed so floor transitions (advanceFloor sets a new seed)
 * cause a regeneration, but re-renders within the same floor are free.
 */
export function useDungeonGenerator(): DungeonGeneratorResult {
  const seed = useRogueStore((s) => s.dungeonSeed);
  const floorNumber = useRogueStore((s) => s.floorNumber);

  const grid = useMemo<DungeonGrid | null>(() => {
    if (seed === null) {
      // No seed yet — generate a random one and store it in a way that will
      // trigger a re-render (the store action sets dungeonSeed)
      const randomSeed = Math.floor(Math.random() * 2 ** 31);
      // Side-effect inside useMemo is intentional here: we only do this once on
      // first render when dungeonSeed is null, and it immediately sets the seed
      // so the next render uses the memoised result.
      setTimeout(() => {
        useRogueStore.getState().startNewRun(randomSeed);
      }, 0);
      return null;
    }

    try {
      // Scale dungeon size slightly with floor number for a sense of progression
      const extraTiles = Math.min(floorNumber - 1, 4) * 4;
      return generateDungeon({
        seed,
        width: DUNGEON_WIDTH + extraTiles,
        height: DUNGEON_HEIGHT + extraTiles,
        minRoomSize: MIN_ROOM_SIZE,
        maxRoomSize: MAX_ROOM_SIZE + Math.min(floorNumber - 1, 3),
        maxDepth: BSP_MAX_DEPTH + Math.min(floorNumber - 1, 2),
        corridorWidth: CORRIDOR_WIDTH,
      });
    } catch (e) {
      console.warn('Dungeon generation failed:', e);
      return null;
    }
  }, [seed, floorNumber]);

  const navGrid = useMemo<NavGrid | null>(() => {
    if (!grid) return null;
    return dungeonGridToNavGrid(grid, TILE_SIZE);
  }, [grid]);

  return { grid, navGrid };
}