import React from 'react';
import { RigidBody } from '@react-three/rapier';

interface DungeonRoomProps {
  width?: number;
  depth?: number;
  wallHeight?: number;
  onFloorClick?: (point: { x: number; y: number; z: number }) => void;
}

const WALL_THICKNESS = 0.5;

export default function DungeonRoom({
  width = 20,
  depth = 20,
  wallHeight = 3,
  onFloorClick,
}: DungeonRoomProps) {
  const halfW = width / 2;
  const halfD = depth / 2;

  return (
    <group>
      {/* Floor */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh
          receiveShadow
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0, 0]}
          onPointerDown={(e) => {
            e.stopPropagation();
            onFloorClick?.({ x: e.point.x, y: e.point.y, z: e.point.z });
          }}
        >
          <planeGeometry args={[width, depth]} />
          <meshStandardMaterial color="#374151" />
        </mesh>
        {/* Thin collider matching the floor plane */}
        <mesh visible={false} position={[0, -0.05, 0]}>
          <boxGeometry args={[width, 0.1, depth]} />
          <meshBasicMaterial />
        </mesh>
      </RigidBody>

      {/* North wall */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh
          castShadow
          receiveShadow
          position={[0, wallHeight / 2, -halfD - WALL_THICKNESS / 2]}
        >
          <boxGeometry args={[width + WALL_THICKNESS * 2, wallHeight, WALL_THICKNESS]} />
          <meshStandardMaterial color="#4b5563" />
        </mesh>
      </RigidBody>

      {/* South wall */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh
          castShadow
          receiveShadow
          position={[0, wallHeight / 2, halfD + WALL_THICKNESS / 2]}
        >
          <boxGeometry args={[width + WALL_THICKNESS * 2, wallHeight, WALL_THICKNESS]} />
          <meshStandardMaterial color="#4b5563" />
        </mesh>
      </RigidBody>

      {/* East wall */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh
          castShadow
          receiveShadow
          position={[halfW + WALL_THICKNESS / 2, wallHeight / 2, 0]}
        >
          <boxGeometry args={[WALL_THICKNESS, wallHeight, depth]} />
          <meshStandardMaterial color="#4b5563" />
        </mesh>
      </RigidBody>

      {/* West wall */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh
          castShadow
          receiveShadow
          position={[-halfW - WALL_THICKNESS / 2, wallHeight / 2, 0]}
        >
          <boxGeometry args={[WALL_THICKNESS, wallHeight, depth]} />
          <meshStandardMaterial color="#4b5563" />
        </mesh>
      </RigidBody>

      {/* Some scattered pillars for visual interest / obstacles */}
      {[
        [-5, 0, -5],
        [5, 0, 5],
        [-5, 0, 5],
        [5, 0, -5],
      ].map((pos, idx) => (
        <RigidBody key={idx} type="fixed" colliders="cuboid">
          <mesh
            castShadow
            receiveShadow
            position={[pos[0], wallHeight / 2, pos[2]]}
          >
            <cylinderGeometry args={[0.4, 0.4, wallHeight, 8]} />
            <meshStandardMaterial color="#6b7280" />
          </mesh>
        </RigidBody>
      ))}
    </group>
  );
}