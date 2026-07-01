import React, { useRef, useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AdvancedHero, { HeroHandle } from '@/components/entities/AdvancedHero';
import MultiAgentEnemies, {
  dungeonGridToNavGrid,
} from '@/components/entities/MultiAgentEnemy';
import ProceduralLevel, {
  gridPointToWorldPosition,
} from '@/components/world/ProceduralLevel';
import HUD from '@/components/ui/HUD';
import DeathScreen from '@/components/ui/DeathScreen';
import MetaUpgradeScreen from '@/components/ui/MetaUpgradeScreen';
import MobileControls from '@/components/ui/MobileControls';
import HitStop from '@/components/fx/HitStop';
import CriticalHitFlash from '@/components/fx/CriticalHitFlash';
import { useHitStop } from '@/hooks/useHitStop';
import { useDungeonGenerator } from '@/hooks/useDungeonGenerator';
import { useRogueStore } from '@/store/rogueStore';
import { DungeonGrid, getEnemySpawnRooms } from '@/utils/DungeonGenerator';
import { TILE_SIZE } from '@/constant/gameConfig';

const IS_WEB = Platform.OS === 'web';

// ---------- Enemy spawn definitions built from dungeon rooms ----------

type SpawnDef = {
  id: string;
  archetype: 'brute' | 'ranger';
  position: [number, number, number];
};

function buildSpawnDefs(grid: DungeonGrid): SpawnDef[] {
  const rooms = getEnemySpawnRooms(grid);
  const defs: SpawnDef[] = [];

  rooms.forEach((room, idx) => {
    const [wx, , wz] = gridPointToWorldPosition(
      { x: room.centerX, y: room.centerY },
      TILE_SIZE
    );
    // Alternate archetypes; later rooms get rangers
    const archetype: 'brute' | 'ranger' = idx % 3 === 2 ? 'ranger' : 'brute';
    defs.push({ id: `enemy-${room.id}`, archetype, position: [wx, 0.5, wz] });
    // Larger rooms get a second enemy
    if (room.width * room.height > 60) {
      defs.push({
        id: `enemy-${room.id}-b`,
        archetype: archetype === 'brute' ? 'ranger' : 'brute',
        position: [wx + TILE_SIZE, 0.5, wz + TILE_SIZE],
      });
    }
  });

  return defs;
}


// ---------- Inner scene (lives inside <Canvas>) ----------

interface SceneProps {
  heroHandleRef: React.MutableRefObject<HeroHandle | null>;
  moveTargetRef: React.MutableRefObject<THREE.Vector3 | null>;
  onCriticalHit: () => void;
  onFloorCleared: () => void;
}

function Scene({
  heroHandleRef,
  moveTargetRef,
  onCriticalHit,
  onFloorCleared,
}: SceneProps) {
  const { grid, navGrid } = useDungeonGenerator();
  const playerPos = useRogueStore((s) => s.playerWorldPosition);
  const playerFacing = useRogueStore((s) => s.playerFacing);
  const { camera } = useThree();

  const spawnPos = grid
    ? gridPointToWorldPosition(grid.spawnPoint, TILE_SIZE)
    : ([0, 0.5, 0] as [number, number, number]);

  const isCameraDebug =
    IS_WEB &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('debugCamera') === '1';

  const spawnDefs = React.useMemo(() => (grid ? buildSpawnDefs(grid) : []), [grid]);

  const handleFloorClick = useCallback(
    (point: { x: number; y: number; z: number }) => {
      if (IS_WEB) {
        moveTargetRef.current = new THREE.Vector3(point.x, point.y, point.z);
      }
    },
    [moveTargetRef]
  );

  // Ensure hooks are always called in the same order: compute a stable dungeon center
  // even when the grid isn't ready so effects/hooks below stay stable.
  const hasGrid = Boolean(grid && navGrid);
  const dungeonCenter: [number, number, number] = hasGrid
    ? [
        (grid!.width * TILE_SIZE) / 2 - TILE_SIZE / 2,
        14,
        (grid!.height * TILE_SIZE) / 2 - TILE_SIZE / 2,
      ]
    : [0, 18, 22];

  const camLookRef = useRef(new THREE.Vector3(dungeonCenter[0], 0.8, dungeonCenter[2]));
  const camPositionRef = useRef(new THREE.Vector3(dungeonCenter[0], 16, dungeonCenter[2] + 16));
  const cameraDebugRef = useRef<THREE.Mesh | null>(null);
  const lookTargetDebugRef = useRef<THREE.Mesh | null>(null);

  useEffect(() => {
    if (!hasGrid) return;
    const facing = new THREE.Vector3(playerFacing[0], 0, playerFacing[2]);
    if (facing.lengthSq() < 1e-6) facing.set(0, 0, 1);
    const backDir = facing.clone().normalize().multiplyScalar(-8);
    const initialCamPos = new THREE.Vector3(spawnPos[0], 6.5, spawnPos[2]).add(backDir);
    camPositionRef.current.copy(initialCamPos);

    camera.position.copy(initialCamPos);
    camLookRef.current.set(spawnPos[0], 1.2, spawnPos[2]);
    camera.lookAt(camLookRef.current);
  }, [camera, dungeonCenter, hasGrid, playerFacing, spawnPos]);

  useFrame(() => {
    if (!hasGrid) return;

    const camHeight = 6.5;
    const camBack = 9;
    const camDamp = 0.14;
    const lookDamp = 0.18;

    const facing = new THREE.Vector3(playerFacing[0], 0, playerFacing[2]);
    if (facing.lengthSq() < 1e-6) facing.set(0, 0, 1);
    facing.normalize();

    const backDir = facing.clone().multiplyScalar(-camBack);
    const worldCamTarget = new THREE.Vector3(
      playerPos[0] + backDir.x,
      camHeight,
      playerPos[2] + backDir.z
    );

    camPositionRef.current.lerp(worldCamTarget, camDamp);
    camera.position.copy(camPositionRef.current);

    const lookDesired = new THREE.Vector3(playerPos[0], 1.4, playerPos[2]);
    camLookRef.current.lerp(lookDesired, lookDamp);
    camera.lookAt(camLookRef.current);

    if (cameraDebugRef.current) {
      cameraDebugRef.current.position.copy(camera.position);
    }
    if (lookTargetDebugRef.current) {
      lookTargetDebugRef.current.position.copy(camLookRef.current);
    }
  });

  if (!hasGrid) return null;

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[10, 20, 10]}
        intensity={1.4}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <pointLight position={[0, 3, 0]} intensity={0.6} color="#fde68a" distance={12} />

      <Physics gravity={[0, -20, 0]}>
          {isCameraDebug && (
            <>
              <mesh ref={cameraDebugRef}>
                <sphereGeometry args={[0.13, 16, 12]} />
                <meshBasicMaterial color="yellow" />
              </mesh>
              <mesh ref={lookTargetDebugRef}>
                <sphereGeometry args={[0.1, 12, 10]} />
                <meshBasicMaterial color="lime" />
              </mesh>
            </>
          )}
          <ProceduralLevel
            grid={grid!}
            tileSize={TILE_SIZE}
            wallHeight={3}
            onFloorClick={IS_WEB ? handleFloorClick : undefined}
          />
        <AdvancedHero
          onReady={(handle) => {
            heroHandleRef.current = handle;
          }}
          moveTargetRef={moveTargetRef}
          onCriticalHit={onCriticalHit}
          initialPosition={spawnPos}
        />

        <MultiAgentEnemies
          spawns={spawnDefs}
          navGrid={navGrid!}
          onAllDefeated={onFloorCleared}
        />
      </Physics>
    </>
  );
}

// ---------- Root ----------

type GamePhase = 'playing' | 'dead' | 'upgrade';

export default function App() {
  const heroHandleRef = useRef<HeroHandle | null>(null);
  const moveTargetRef = useRef<THREE.Vector3 | null>(null);

  const [phase, setPhase] = useState<GamePhase>('playing');
  const [critFlash, setCritFlash] = useState(false);
  const { triggerHitStop, deltaMultiplier } = useHitStop();

  const isAlive = useRogueStore((s) => s.isAlive);
  const endRun = useRogueStore((s) => s.endRun);
  const startNewRun = useRogueStore((s) => s.startNewRun);
  const advanceFloor = useRogueStore((s) => s.advanceFloor);

  // Watch for death
  useEffect(() => {
    if (!isAlive && phase === 'playing') {
      endRun();
      setPhase('dead');
    }
  }, [isAlive, phase, endRun]);

  const handleCriticalHit = useCallback(() => {
    triggerHitStop(80);
    setCritFlash(true);
    setTimeout(() => setCritFlash(false), 120);
  }, [triggerHitStop]);

  const handleFloorCleared = useCallback(() => {
    setPhase('upgrade');
  }, []);

  const handleRestartRun = useCallback(() => {
    const seed = Math.floor(Math.random() * 2 ** 31);
    startNewRun(seed);
    setPhase('playing');
  }, [startNewRun]);

  const handleNextFloor = useCallback(() => {
    const seed = Math.floor(Math.random() * 2 ** 31);
    advanceFloor(seed);
    setPhase('playing');
  }, [advanceFloor]);

  // Web: spacebar = attack, shift = dash
  useEffect(() => {
    if (!IS_WEB) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === ' ') heroHandleRef.current?.triggerAttack();
      if (e.key === 'Shift') heroHandleRef.current?.triggerDash();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        {/* 3D Canvas */}
        <Canvas
          shadows
          camera={{ position: [0, 14, 10], fov: 50 }}
          style={StyleSheet.absoluteFillObject}
          onCreated={({ gl }) => {
            gl.shadowMap.enabled = true;
            gl.shadowMap.type = THREE.PCFSoftShadowMap;
          }}
        >
          <HitStop deltaMultiplier={deltaMultiplier} />
          {phase === 'playing' && (
            <Scene
              heroHandleRef={heroHandleRef}
              moveTargetRef={moveTargetRef}
              onCriticalHit={handleCriticalHit}
              onFloorCleared={handleFloorCleared}
            />
          )}
        </Canvas>

        {/* 2D UI layer */}
        {phase === 'playing' && <HUD />}

        {phase === 'playing' && !IS_WEB && (
          <MobileControls
            onMove={(v) => heroHandleRef.current?.setMoveVector(v)}
            onAttack={() => heroHandleRef.current?.triggerAttack()}
            onDash={() => heroHandleRef.current?.triggerDash()}
          />
        )}

        {phase === 'dead' && (
          <DeathScreen onRestart={handleRestartRun} />
        )}

        {phase === 'upgrade' && (
          <MetaUpgradeScreen onContinue={handleNextFloor} />
        )}

        {critFlash && <CriticalHitFlash />}

        {IS_WEB && phase === 'playing' && (
          <View style={styles.webHint} collapsable={false}>
            <View style={styles.webHintBox}>
              {[
                'WASD / Arrows — move',
                'Click floor — move to point',
                'Space — attack / combo',
                'Shift — dash (i-frames)',
              ].map((hint) => (
                <React.Fragment key={hint}>
                  <HintText text={hint} />
                </React.Fragment>
              ))}
            </View>
          </View>
        )}
      </View>
    </SafeAreaProvider>
  );
}

function HintText({ text }: { text: string }) {
  const { Text } = require('react-native');
  return <Text style={styles.webHintText}>{text}</Text>;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#111827',
  },
  webHint: {
    position: 'absolute',
    bottom: 16,
    right: 16,
  },
  webHintBox: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  webHintText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
});