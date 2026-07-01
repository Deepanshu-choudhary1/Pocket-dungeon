import React, { useRef, useState, useCallback, useEffect } from 'react';
import { StyleSheet, View, Text, Pressable, Platform, PanResponder, GestureResponderEvent } from 'react-native';
import { Canvas, useThree, ThreeEvent } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import Hero, { HeroHandle } from './src/components/Hero';
import EnemyMob from './src/components/EnemyMob';
import DungeonRoom from './src/components/DungeonRoom';
import { useRpgStore } from './src/store/rpgStore';

const IS_WEB = Platform.OS === 'web';

// ---------- Loot Drop ----------
interface LootDrop {
  id: string;
  type: 'gold' | 'potion';
  position: [number, number, number];
}

function LootPickup({
  loot,
  onCollect,
}: {
  loot: LootDrop;
  onCollect: (id: string) => void;
}) {
  const addItem = useRpgStore((s) => s.addItem);
  const ref = useRef<THREE.Mesh>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const playerPos = useRpgStore.getState().playerPosition;
      const dx = playerPos[0] - loot.position[0];
      const dz = playerPos[2] - loot.position[2];
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 0.9) {
        addItem(loot.type, loot.type === 'gold' ? 10 : 1);
        onCollect(loot.id);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [loot, addItem, onCollect]);

  return (
    <mesh ref={ref} position={loot.position}>
      {loot.type === 'gold' ? (
        <>
          <cylinderGeometry args={[0.2, 0.2, 0.08, 12]} />
          <meshStandardMaterial color="#eab308" emissive="#eab308" emissiveIntensity={0.3} />
        </>
      ) : (
        <>
          <sphereGeometry args={[0.2, 12, 12]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.3} />
        </>
      )}
    </mesh>
  );
}

// ---------- Floor click raycast handler (web only) ----------
function FloorClickHandler({
  moveTargetRef,
}: {
  moveTargetRef: React.MutableRefObject<THREE.Vector3 | null>;
}) {
  const handleClick = useCallback(
    (point: { x: number; y: number; z: number }) => {
      moveTargetRef.current = new THREE.Vector3(point.x, point.y, point.z);
    },
    [moveTargetRef]
  );
  return <DungeonRoom onFloorClick={IS_WEB ? handleClick : undefined} />;
}

// ---------- Camera follow ----------
function CameraRig() {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 14, 10);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  React.useEffect(() => {
    let frameId: number;
    const update = () => {
      const playerPos = useRpgStore.getState().playerPosition;
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, playerPos[0], 0.08);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, playerPos[2] + 10, 0.08);
      camera.position.y = 14;
      camera.lookAt(playerPos[0], 0, playerPos[2]);
      frameId = requestAnimationFrame(update);
    };
    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, [camera]);

  return null;
}

// ---------- Scene ----------
const INITIAL_ENEMIES: { id: string; pos: [number, number, number] }[] = [
  { id: 'e1', pos: [4, 0.5, -4] },
  { id: 'e2', pos: [-4, 0.5, -4] },
  { id: 'e3', pos: [4, 0.5, 4] },
  { id: 'e4', pos: [-6, 0.5, 2] },
  { id: 'e5', pos: [0, 0.5, -7] },
];

function Scene({
  heroHandleRef,
  moveTargetRef,
}: {
  heroHandleRef: React.MutableRefObject<HeroHandle | null>;
  moveTargetRef: React.MutableRefObject<THREE.Vector3 | null>;
}) {
  const [enemies, setEnemies] = useState(INITIAL_ENEMIES);
  const [loot, setLoot] = useState<LootDrop[]>([]);

  const handleEnemyDeath = useCallback(
    (id: string, position: [number, number, number]) => {
      setEnemies((prev) => prev.filter((e) => e.id !== id));
      const dropType: 'gold' | 'potion' = Math.random() > 0.4 ? 'gold' : 'potion';
      setLoot((prev) => [
        ...prev,
        { id: `loot-${id}-${Date.now()}`, type: dropType, position },
      ]);
    },
    []
  );

  const handleLootCollect = useCallback((id: string) => {
    setLoot((prev) => prev.filter((l) => l.id !== id));
  }, []);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[10, 15, 5]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <CameraRig />

      <Physics gravity={[0, -20, 0]}>
        <FloorClickHandler moveTargetRef={moveTargetRef} />

        <Hero
          onReady={(handle) => {
            heroHandleRef.current = handle;
          }}
          moveTargetRef={moveTargetRef}
        />

        {enemies.map((e) => (
          <EnemyMob
            key={e.id}
            id={e.id}
            initialPosition={e.pos}
            onDeath={handleEnemyDeath}
          />
        ))}
      </Physics>

      {loot.map((l) => (
        <LootPickup key={l.id} loot={l} onCollect={handleLootCollect} />
      ))}
    </>
  );
}

// ---------- Virtual Joystick (Android) ----------
function VirtualJoystick({
  onMove,
}: {
  onMove: (v: { x: number; y: number }) => void;
}) {
  const baseRadius = 60;
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const originRef = useRef({ x: 0, y: 0 });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        originRef.current = {
          x: evt.nativeEvent.locationX,
          y: evt.nativeEvent.locationY,
        };
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        const dx = evt.nativeEvent.locationX - originRef.current.x;
        const dy = evt.nativeEvent.locationY - originRef.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const clamped = Math.min(dist, baseRadius);
        const angle = Math.atan2(dy, dx);
        const kx = Math.cos(angle) * clamped;
        const ky = Math.sin(angle) * clamped;
        setKnob({ x: kx, y: ky });

        // Normalize: forward/back maps to Z, left/right maps to X
        onMove({ x: kx / baseRadius, y: ky / baseRadius });
      },
      onPanResponderRelease: () => {
        setKnob({ x: 0, y: 0 });
        onMove({ x: 0, y: 0 });
      },
      onPanResponderTerminate: () => {
        setKnob({ x: 0, y: 0 });
        onMove({ x: 0, y: 0 });
      },
    })
  ).current;

  return (
    <View style={styles.joystickBase} {...panResponder.panHandlers}>
      <View
        style={[
          styles.joystickKnob,
          { transform: [{ translateX: knob.x }, { translateY: knob.y }] },
        ]}
      />
    </View>
  );
}

// ---------- HUD ----------
function HUD({ onAttack }: { onAttack: () => void }) {
  const hp = useRpgStore((s) => s.hp);
  const maxHp = useRpgStore((s) => s.maxHp);
  const gold = useRpgStore((s) => s.gold);
  const inventory = useRpgStore((s) => s.inventory);
  const usePotion = useRpgStore((s) => s.usePotion);
  const isAlive = useRpgStore((s) => s.isAlive);
  const insets = useSafeAreaInsets();

  const potionCount = inventory.find((i) => i.type === 'potion')?.quantity ?? 0;
  const hpRatio = Math.max(0, hp / maxHp);

  return (
    <View style={[styles.hudContainer, { top: insets.top + 10, pointerEvents: 'box-none' }]}>
      <View style={styles.hpBarOuter}>
        <View style={[styles.hpBarInner, { width: `${hpRatio * 100}%` }]} />
        <Text style={styles.hpText}>{Math.ceil(hp)} / {maxHp}</Text>
      </View>

      <View style={styles.statsRow}>
        <Text style={styles.statText}>🪙 {gold}</Text>
        <Pressable
          style={[styles.potionButton, potionCount === 0 && styles.disabledButton]}
          onPress={usePotion}
          disabled={potionCount === 0}
        >
          <Text style={styles.statText}>🧪 {potionCount} (use)</Text>
        </Pressable>
      </View>

      {!isAlive && (
        <View style={styles.deathOverlay}>
          <Text style={styles.deathText}>YOU DIED</Text>
        </View>
      )}
    </View>
  );
}

// ---------- Mobile Controls ----------
function MobileControls({
  onMove,
  onAttack,
}: {
  onMove: (v: { x: number; y: number }) => void;
  onAttack: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.controlsContainer, { bottom: insets.bottom + 20, pointerEvents: 'box-none' }]}
    >
      <VirtualJoystick onMove={onMove} />
      <Pressable
        style={({ pressed }) => [
          styles.attackButton,
          pressed && styles.attackButtonPressed,
        ]}
        onPress={onAttack}
      >
        <Text style={styles.attackButtonText}>⚔️</Text>
      </Pressable>
    </View>
  );
}

// ---------- Root App ----------
function GameRoot() {
  const heroHandleRef = useRef<HeroHandle | null>(null);
  const moveTargetRef = useRef<THREE.Vector3 | null>(null);

  const handleAttack = useCallback(() => {
    heroHandleRef.current?.triggerAttack();
  }, []);

  const handleJoystickMove = useCallback((v: { x: number; y: number }) => {
    heroHandleRef.current?.setMoveVector(v);
  }, []);

  // Web: spacebar to attack
  useEffect(() => {
    if (!IS_WEB) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Spacebar') {
        heroHandleRef.current?.triggerAttack();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <View style={styles.flex}>
      <Canvas shadows camera={{ position: [0, 14, 10], fov: 50 }}>
        <Scene heroHandleRef={heroHandleRef} moveTargetRef={moveTargetRef} />
      </Canvas>

      <HUD onAttack={handleAttack} />

      {!IS_WEB && (
        <MobileControls onMove={handleJoystickMove} onAttack={handleAttack} />
      )}

      {IS_WEB && (
        <View style={[styles.webHint, { pointerEvents: 'none' }]}> 
          <Text style={styles.webHintText}>
            WASD / Arrows to move • Click floor to move • Space to attack
          </Text>
        </View>
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <GameRoot />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#111827' },
  hudContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  hpBarOuter: {
    height: 26,
    borderRadius: 13,
    backgroundColor: '#1f2937',
    borderWidth: 2,
    borderColor: '#000',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  hpBarInner: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#ef4444',
  },
  hpText: {
    textAlign: 'center',
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  statText: {
    color: '#fff',
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    fontSize: 13,
  },
  potionButton: {
    borderRadius: 8,
  },
  disabledButton: {
    opacity: 0.4,
  },
  deathOverlay: {
    position: 'absolute',
    top: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  deathText: {
    color: '#ef4444',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 4,
  },
  controlsContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 30,
    alignItems: 'flex-end',
  },
  joystickBase: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  joystickKnob: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  attackButton: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(239,68,68,0.7)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  attackButtonPressed: {
    backgroundColor: 'rgba(239,68,68,0.95)',
    transform: [{ scale: 0.92 }],
  },
  attackButtonText: {
    fontSize: 36,
  },
  webHint: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  webHintText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
});