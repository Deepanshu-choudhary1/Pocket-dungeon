import * as THREE from 'three';

export type EnemyArchetype = 'brute' | 'ranger';
export type EnemyState = 'idle' | 'chase' | 'strafe' | 'attack' | 'stagger' | 'dead';

export interface AgentSnapshot {
  id: string;
  position: THREE.Vector3;
  archetype: EnemyArchetype;
}

interface SeparationResult {
  x: number;
  z: number;
}

const SEPARATION_RADIUS = 1.1;
const SEPARATION_STRENGTH = 1.8;

/**
 * Central registry of all active enemy agents, used purely for spatial queries
 * (separation/boids) so each enemy doesn't need to know about every other enemy's
 * component instance — just their last reported transform.
 */
class AIManagerClass {
  private agents: Map<string, AgentSnapshot> = new Map();

  register(id: string, position: THREE.Vector3, archetype: EnemyArchetype) {
    this.agents.set(id, { id, position: position.clone(), archetype });
  }

  update(id: string, position: THREE.Vector3) {
    const agent = this.agents.get(id);
    if (agent) {
      agent.position.copy(position);
    }
  }

  unregister(id: string) {
    this.agents.delete(id);
  }

  /** Boids-style separation: push away from nearby agents, weighted by inverse distance. */
  getSeparationVector(selfId: string, selfPos: THREE.Vector3): SeparationResult {
    let x = 0;
    let z = 0;
    let count = 0;

    for (const [id, agent] of this.agents) {
      if (id === selfId) continue;
      const dx = selfPos.x - agent.position.x;
      const dz = selfPos.z - agent.position.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < SEPARATION_RADIUS * SEPARATION_RADIUS && distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        const falloff = 1 - dist / SEPARATION_RADIUS;
        x += (dx / dist) * falloff;
        z += (dz / dist) * falloff;
        count++;
      }
    }

    if (count > 0) {
      x = (x / count) * SEPARATION_STRENGTH;
      z = (z / count) * SEPARATION_STRENGTH;
    }

    return { x, z };
  }

  getNearbyCount(selfId: string, selfPos: THREE.Vector3, radius: number): number {
    let count = 0;
    for (const [id, agent] of this.agents) {
      if (id === selfId) continue;
      const dist = selfPos.distanceTo(agent.position);
      if (dist < radius) count++;
    }
    return count;
  }

  getAllAgents(): AgentSnapshot[] {
    return Array.from(this.agents.values());
  }

  clear() {
    this.agents.clear();
  }
}

// Singleton — module-scoped so all enemy components share one registry without Context overhead
export const AIManager = new AIManagerClass();

// --- Simple grid-based A* for corridor-aware navigation ---

export interface NavGrid {
  width: number;
  height: number;
  walkable: boolean[][]; // [y][x]
  tileSize: number;
}

interface NavNode {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: NavNode | null;
}

export function findPath(
  navGrid: NavGrid,
  start: { x: number; y: number },
  goal: { x: number; y: number },
  maxIterations = 500
): { x: number; y: number }[] {
  const { walkable, width, height } = navGrid;
  const inBounds = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height;
  if (!inBounds(start.x, start.y) || !inBounds(goal.x, goal.y)) return [];
  if (!walkable[goal.y]?.[goal.x]) return [];

  const open: NavNode[] = [{ x: start.x, y: start.y, g: 0, h: 0, f: 0, parent: null }];
  const closed = new Set<string>();
  const key = (x: number, y: number) => `${x},${y}`;

  let iterations = 0;
  while (open.length > 0 && iterations < maxIterations) {
    iterations++;
    open.sort((a, b) => a.f - b.f);
    const current = open.shift()!;

    if (current.x === goal.x && current.y === goal.y) {
      const path: { x: number; y: number }[] = [];
      let node: NavNode | null = current;
      while (node) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }
      return path;
    }

    closed.add(key(current.x, current.y));

    const neighbors = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ];

    for (const n of neighbors) {
      if (!inBounds(n.x, n.y) || !walkable[n.y][n.x] || closed.has(key(n.x, n.y))) continue;
      const g = current.g + 1;
      const h = Math.abs(n.x - goal.x) + Math.abs(n.y - goal.y);
      const existing = open.find((o) => o.x === n.x && o.y === n.y);
      if (existing) {
        if (g < existing.g) {
          existing.g = g;
          existing.f = g + h;
          existing.parent = current;
        }
      } else {
        open.push({ x: n.x, y: n.y, g, h, f: g + h, parent: current });
      }
    }
  }

  return []; // no path found within iteration budget
}

export function worldToGrid(
  worldX: number,
  worldZ: number,
  tileSize: number
): { x: number; y: number } {
  return { x: Math.round(worldX / tileSize), y: Math.round(worldZ / tileSize) };
}