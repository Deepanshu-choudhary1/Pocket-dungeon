import React, { useMemo, useRef, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { RigidBody, RapierRigidBody, CuboidCollider } from '@react-three/rapier';
import { DungeonGrid, gridToWorld } from '../../utils/DungeonGenerator';

interface ProceduralLevelProps {
  grid: DungeonGrid;
  tileSize?: number;
  wallHeight?: number;
  onFloorClick?: (point: { x: number; y: number; z: number }) => void;
}

interface WallSegment {
  x: number;
  y: number;
  width: number; // in tiles
  depth: number; // in tiles
}

// Merge adjacent wall tiles along rows into fewer, larger boxes — this is the
// difference between thousands of individual colliders/meshes and a few hundred.
function mergeWallsIntoSegments(grid: DungeonGrid): WallSegment[] {
  const { tiles, width, height } = grid;
  const consumed = Array.from({ length: height }, () => new Array(width).fill(false));
  const segments: WallSegment[] = [];

  for (let y = 0; y < height; y++) {
    let x = 0;
    while (x < width) {
      if (tiles[y][x] !== 'wall' || consumed[y][x]) {
        x++;
        continue;
      }
      // Greedily extend horizontally
      let runWidth = 1;
      while (
        x + runWidth < width &&
        tiles[y][x + runWidth] === 'wall' &&
        !consumed[y][x + runWidth]
      ) {
        runWidth++;
      }
      // Try to extend the whole horizontal run downward as well
      let runDepth = 1;
      outer: while (y + runDepth < height) {
        for (let dx = 0; dx < runWidth; dx++) {
          if (tiles[y + runDepth][x + dx] !== 'wall' || consumed[y + runDepth][x + dx]) {
            break outer;
          }
        }
        runDepth++;
      }

      for (let dy = 0; dy < runDepth; dy++) {
        for (let dx = 0; dx < runWidth; dx++) {
          consumed[y + dy][x + dx] = true;
        }
      }

      segments.push({ x, y, width: runWidth, depth: runDepth });
      x += runWidth;
    }
  }

  return segments;
}

function floorTileCount(grid: DungeonGrid): number {
  let count = 0;
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const t = grid.tiles[y][x];
      if (t === 'floor' || t === 'corridor' || t === 'spawn' || t === 'exit') count++;
    }
  }
  return count;
}

export default function ProceduralLevel({
  grid,
  tileSize = 2,
  wallHeight = 3,
  onFloorClick,
}: ProceduralLevelProps) {
  const floorInstanceRef = useRef<THREE.InstancedMesh>(null);

  const wallSegments = useMemo(() => mergeWallsIntoSegments(grid), [grid]);
  const floorCount = useMemo(() => floorTileCount(grid), [grid]);

  // Position the floor instances once on mount/grid-change
  useLayoutEffect(() => {
    const mesh = floorInstanceRef.current;
    if (!mesh) return;

    const dummy = new THREE.Object3D();
    let i = 0;
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const t = grid.tiles[y][x];
        if (t !== 'floor' && t !== 'corridor' && t !== 'spawn' && t !== 'exit') continue;
        const [wx, , wz] = gridToWorld(x, y, tileSize);
        dummy.position.set(wx, 0, wz);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);

        // Tint spawn/exit tiles subtly differently via per-instance color
        if (t === 'spawn') mesh.setColorAt(i, new THREE.Color('#1e3a5f'));
        else if (t === 'exit') mesh.setColorAt(i, new THREE.Color('#5f1e3a'));
        else mesh.setColorAt(i, new THREE.Color('#374151'));

        i++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [grid, tileSize]);

  return (
    <group>
      {/* Floor: single InstancedMesh, single RigidBody collider spanning the whole footprint */}
      <instancedMesh
        ref={floorInstanceRef}
        args={[undefined, undefined, floorCount]}
        receiveShadow
        frustumCulled={false}
        onPointerDown={(event) => {
          if (onFloorClick) {
            onFloorClick(event.point as { x: number; y: number; z: number });
          }
        }}
      >
        <boxGeometry args={[tileSize, 0.2, tileSize]} />
        <meshStandardMaterial />
      </instancedMesh>

      {/* One thin fixed collider beneath the whole grid footprint acts as the floor physics */}
      {/* Place the RigidBody at the floor's center so the collider aligns correctly */}
      <RigidBody
        type="fixed"
        colliders={false}
        // place the collider centered at the floor plane so dynamic bodies land on top
        position={[(grid.width * tileSize) / 2 - tileSize / 2, 0, (grid.height * tileSize) / 2 - tileSize / 2]}
      >
        {/* explicit cuboid collider that matches the full floor footprint (half-extents) */}
        <CuboidCollider
          args={[grid.width * tileSize / 2, 0.1, grid.height * tileSize / 2]}
        />
        <mesh visible={false}>
          <boxGeometry args={[grid.width * tileSize, 0.2, grid.height * tileSize]} />
          <meshBasicMaterial />
        </mesh>
      </RigidBody>

      {/* Walls: merged box segments, each its own fixed RigidBody (Rapier handles static
          bodies cheaply; merging tiles into segments is what keeps the count manageable) */}
      {wallSegments.map((seg, idx) => {
        const worldX = (seg.x + seg.width / 2 - 0.5) * tileSize;
        const worldZ = (seg.y + seg.depth / 2 - 0.5) * tileSize;
        return (
          <RigidBody
            key={idx}
            type="fixed"
            colliders={false}
            position={[worldX, wallHeight / 2, worldZ]}
          >
            <CuboidCollider
              args={[seg.width * tileSize / 2, wallHeight / 2, seg.depth * tileSize / 2]}
            />
            <mesh castShadow receiveShadow>
              <boxGeometry
                args={[seg.width * tileSize, wallHeight, seg.depth * tileSize]}
              />
              <meshStandardMaterial color="#4b5563" />
            </mesh>
          </RigidBody>
        );
      })}
    </group>
  );
}

// Helper to convert a grid point directly to a Hero/enemy spawn world position
export function gridPointToWorldPosition(
  point: { x: number; y: number },
  tileSize = 2
): [number, number, number] {
  const [x, , z] = gridToWorld(point.x, point.y, tileSize);
  // Spawn entities slightly above the floor so physics settles them onto colliders
  return [x, 1.0, z];
}