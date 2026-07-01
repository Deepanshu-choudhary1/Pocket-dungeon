// BSP-based procedural dungeon generator with guaranteed connectivity

export type TileType = 'void' | 'floor' | 'wall' | 'spawn' | 'exit' | 'corridor';

export interface Room {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  isSpawn: boolean;
  isExit: boolean;
}

export interface DungeonGrid {
  width: number;
  height: number;
  tiles: TileType[][]; // [y][x]
  rooms: Room[];
  spawnPoint: { x: number; y: number };
  exitPoint: { x: number; y: number };
  seed: number;
}

interface BSPNode {
  x: number;
  y: number;
  width: number;
  height: number;
  left?: BSPNode;
  right?: BSPNode;
  room?: Room;
}

// --- Seeded PRNG (mulberry32) so runs are reproducible from a seed ---
function createRng(seed: number) {
  let state = seed >>> 0;
  return function rng() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface GeneratorOptions {
  width: number;
  height: number;
  minRoomSize: number;
  maxRoomSize: number;
  maxDepth: number;
  corridorWidth: number;
  seed?: number;
}

const DEFAULT_OPTIONS: GeneratorOptions = {
  width: 64,
  height: 64,
  minRoomSize: 6,
  maxRoomSize: 12,
  maxDepth: 5,
  corridorWidth: 2,
};

export class DungeonGenerator {
  private opts: GeneratorOptions;
  private rng: () => number;
  private rooms: Room[] = [];
  private tiles: TileType[][];
  private roomCounter = 0;

  constructor(options: Partial<GeneratorOptions> = {}) {
    this.opts = { ...DEFAULT_OPTIONS, ...options };
    const seed = this.opts.seed ?? Math.floor(Math.random() * 2 ** 31);
    this.opts.seed = seed;
    this.rng = createRng(seed);
    this.tiles = this.createEmptyGrid(this.opts.width, this.opts.height);
  }

  private createEmptyGrid(w: number, h: number): TileType[][] {
    return Array.from({ length: h }, () => Array<TileType>(w).fill('void'));
  }

  private randInt(min: number, max: number): number {
    return Math.floor(this.rng() * (max - min + 1)) + min;
  }

  // --- Step 1: Recursive BSP split ---
  private splitNode(node: BSPNode, depth: number): void {
    if (depth >= this.opts.maxDepth) return;

    const canSplitH = node.height >= this.opts.minRoomSize * 2 + 2;
    const canSplitV = node.width >= this.opts.minRoomSize * 2 + 2;
    if (!canSplitH && !canSplitV) return;

    let splitHorizontal: boolean;
    if (canSplitH && canSplitV) {
      splitHorizontal = this.rng() > 0.5;
    } else {
      splitHorizontal = canSplitH;
    }

    if (splitHorizontal) {
      const splitY = this.randInt(
        node.y + this.opts.minRoomSize,
        node.y + node.height - this.opts.minRoomSize
      );
      node.left = { x: node.x, y: node.y, width: node.width, height: splitY - node.y };
      node.right = {
        x: node.x,
        y: splitY,
        width: node.width,
        height: node.y + node.height - splitY,
      };
    } else {
      const splitX = this.randInt(
        node.x + this.opts.minRoomSize,
        node.x + node.width - this.opts.minRoomSize
      );
      node.left = { x: node.x, y: node.y, width: splitX - node.x, height: node.height };
      node.right = {
        x: splitX,
        y: node.y,
        width: node.x + node.width - splitX,
        height: node.height,
      };
    }

    this.splitNode(node.left, depth + 1);
    this.splitNode(node.right, depth + 1);
  }

  // --- Step 2: Carve a room inside each leaf node ---
  private createRooms(node: BSPNode): void {
    if (node.left || node.right) {
      if (node.left) this.createRooms(node.left);
      if (node.right) this.createRooms(node.right);
      return;
    }

    const maxW = Math.min(this.opts.maxRoomSize, node.width - 2);
    const maxH = Math.min(this.opts.maxRoomSize, node.height - 2);
    const w = this.randInt(this.opts.minRoomSize, Math.max(this.opts.minRoomSize, maxW));
    const h = this.randInt(this.opts.minRoomSize, Math.max(this.opts.minRoomSize, maxH));
    const x = this.randInt(node.x + 1, node.x + node.width - w - 1);
    const y = this.randInt(node.y + 1, node.y + node.height - h - 1);

    const room: Room = {
      id: `room-${this.roomCounter++}`,
      x,
      y,
      width: w,
      height: h,
      centerX: Math.floor(x + w / 2),
      centerY: Math.floor(y + h / 2),
      isSpawn: false,
      isExit: false,
    };

    node.room = room;
    this.rooms.push(room);
    this.carveRoom(room);
  }

  private carveRoom(room: Room): void {
    for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) {
        if (this.inBounds(x, y)) this.tiles[y][x] = 'floor';
      }
    }
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.opts.width && y >= 0 && y < this.opts.height;
  }

  // --- Step 3: Connect sibling subtrees with L-shaped corridors ---
  private getRoomsInSubtree(node: BSPNode): Room[] {
    if (node.room) return [node.room];
    const rooms: Room[] = [];
    if (node.left) rooms.push(...this.getRoomsInSubtree(node.left));
    if (node.right) rooms.push(...this.getRoomsInSubtree(node.right));
    return rooms;
  }

  private connectSubtrees(node: BSPNode): void {
    if (!node.left || !node.right) return;

    this.connectSubtrees(node.left);
    this.connectSubtrees(node.right);

    const leftRooms = this.getRoomsInSubtree(node.left);
    const rightRooms = this.getRoomsInSubtree(node.right);
    if (leftRooms.length === 0 || rightRooms.length === 0) return;

    // Pick the closest pair between the two subtree room-sets for a tighter, more natural layout
    let best: { a: Room; b: Room; dist: number } | null = null;
    for (const a of leftRooms) {
      for (const b of rightRooms) {
        const dist = Math.hypot(a.centerX - b.centerX, a.centerY - b.centerY);
        if (!best || dist < best.dist) best = { a, b, dist };
      }
    }
    if (best) this.carveCorridor(best.a, best.b);
  }

  private carveCorridor(a: Room, b: Room): void {
    const halfWidth = Math.floor(this.opts.corridorWidth / 2);
    const horizontalFirst = this.rng() > 0.5;

    const carveH = (x1: number, x2: number, y: number) => {
      const [from, to] = x1 < x2 ? [x1, x2] : [x2, x1];
      for (let x = from; x <= to; x++) {
        for (let dy = -halfWidth; dy <= halfWidth; dy++) {
          if (this.inBounds(x, y + dy) && this.tiles[y + dy][x] === 'void') {
            this.tiles[y + dy][x] = 'corridor';
          }
        }
      }
    };
    const carveV = (y1: number, y2: number, x: number) => {
      const [from, to] = y1 < y2 ? [y1, y2] : [y2, y1];
      for (let y = from; y <= to; y++) {
        for (let dx = -halfWidth; dx <= halfWidth; dx++) {
          if (this.inBounds(x + dx, y) && this.tiles[y][x + dx] === 'void') {
            this.tiles[y][x + dx] = 'corridor';
          }
        }
      }
    };

    if (horizontalFirst) {
      carveH(a.centerX, b.centerX, a.centerY);
      carveV(a.centerY, b.centerY, b.centerX);
    } else {
      carveV(a.centerY, b.centerY, a.centerX);
      carveH(a.centerX, b.centerX, b.centerY);
    }
  }

  // --- Step 4: Surround floor/corridor tiles with walls ---
  private placeWalls(): void {
    const w = this.opts.width;
    const h = this.opts.height;
    const isWalkable = (x: number, y: number) =>
      this.inBounds(x, y) &&
      (this.tiles[y][x] === 'floor' ||
        this.tiles[y][x] === 'corridor' ||
        this.tiles[y][x] === 'spawn' ||
        this.tiles[y][x] === 'exit');

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (this.tiles[y][x] !== 'void') continue;
        const neighbors = [
          [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
          [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1], [x + 1, y + 1],
        ];
        if (neighbors.some(([nx, ny]) => isWalkable(nx, ny))) {
          this.tiles[y][x] = 'wall';
        }
      }
    }
  }

  // --- Step 5: BFS to verify connectivity; pick spawn/exit as the two most distant rooms ---
  private validateAndAssignSpawnExit(): { spawn: Room; exit: Room } {
    if (this.rooms.length < 2) {
      throw new Error('Dungeon generation failed: fewer than 2 rooms created.');
    }

    // Find the pair of rooms with the greatest graph distance (BFS from each candidate is
    // expensive at scale; Euclidean distance is a solid proxy given BSP layouts are roughly convex)
    let spawn = this.rooms[0];
    let exit = this.rooms[0];
    let maxDist = -1;
    for (const a of this.rooms) {
      for (const b of this.rooms) {
        const dist = Math.hypot(a.centerX - b.centerX, a.centerY - b.centerY);
        if (dist > maxDist) {
          maxDist = dist;
          spawn = a;
          exit = b;
        }
      }
    }

    // Verify actual walkable-tile connectivity via BFS; if it ever fails (shouldn't, given
    // our corridor carving), fall back to carving a direct corridor as a safety net.
    if (!this.isConnected(spawn, exit)) {
      this.carveCorridor(spawn, exit);
      this.placeWalls();
    }

    spawn.isSpawn = true;
    exit.isExit = true;
    this.tiles[spawn.centerY][spawn.centerX] = 'spawn';
    this.tiles[exit.centerY][exit.centerX] = 'exit';

    return { spawn, exit };
  }

  private isConnected(a: Room, b: Room): boolean {
    const w = this.opts.width;
    const h = this.opts.height;
    const visited = Array.from({ length: h }, () => new Array(w).fill(false));
    const isWalkable = (x: number, y: number) =>
      this.inBounds(x, y) &&
      (this.tiles[y][x] === 'floor' ||
        this.tiles[y][x] === 'corridor' ||
        this.tiles[y][x] === 'spawn' ||
        this.tiles[y][x] === 'exit');

    const queue: [number, number][] = [[a.centerX, a.centerY]];
    visited[a.centerY][a.centerX] = true;

    while (queue.length > 0) {
      const [cx, cy] = queue.shift()!;
      if (cx === b.centerX && cy === b.centerY) return true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (isWalkable(nx, ny) && !visited[ny][nx]) {
          visited[ny][nx] = true;
          queue.push([nx, ny]);
        }
      }
    }
    return false;
  }

  generate(): DungeonGrid {
    const root: BSPNode = { x: 0, y: 0, width: this.opts.width, height: this.opts.height };
    this.splitNode(root, 0);
    this.createRooms(root);
    this.connectSubtrees(root);
    this.placeWalls();
    const { spawn, exit } = this.validateAndAssignSpawnExit();

    return {
      width: this.opts.width,
      height: this.opts.height,
      tiles: this.tiles,
      rooms: this.rooms,
      spawnPoint: { x: spawn.centerX, y: spawn.centerY },
      exitPoint: { x: exit.centerX, y: exit.centerY },
      seed: this.opts.seed!,
    };
  }
}

// Convenience function for one-off generation
export function generateDungeon(options?: Partial<GeneratorOptions>): DungeonGrid {
  return new DungeonGenerator(options).generate();
}

// Utility: convert grid coords to world-space (tile size in meters)
export function gridToWorld(
  gridX: number,
  gridY: number,
  tileSize = 2
): [number, number, number] {
  return [gridX * tileSize, 0, gridY * tileSize];
}

// Utility: get all non-spawn rooms eligible for enemy spawning, sorted by distance from spawn
export function getEnemySpawnRooms(grid: DungeonGrid): Room[] {
  return grid.rooms
    .filter((r) => !r.isSpawn)
    .sort((a, b) => {
      const distA = Math.hypot(a.centerX - grid.spawnPoint.x, a.centerY - grid.spawnPoint.y);
      const distB = Math.hypot(b.centerX - grid.spawnPoint.x, b.centerY - grid.spawnPoint.y);
      return distA - distB;
    });
}