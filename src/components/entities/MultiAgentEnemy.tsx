import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { AIManager, EnemyArchetype, EnemyState, findPath, worldToGrid, type NavGrid } from '../../systems/AIManager';
export type { NavGrid } from '../../systems/AIManager';
import { useRogueStore } from '../../store/rogueStore';
import { DungeonGrid } from '../../utils/DungeonGenerator';

// ---------- Shared projectile pool for Rangers ----------

interface ProjectileData {
  id: string;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  spawnTime: number;
}

const PROJECTILE_LIFETIME = 2.5;
const PROJECTILE_SPEED = 9;
const PROJECTILE_DAMAGE = 8;

function Projectile({
  data,
  onExpire,
}: {
  data: ProjectileData;
  onExpire: (id: string) => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const damagePlayer = useRogueStore((s) => s.takeDamage);
  const playerInvincible = useRogueStore((s) => s.isInvincible);

  useFrame((_, delta) => {
    if (!ref.current) return;
    data.position.addScaledVector(data.velocity, delta);
    ref.current.position.copy(data.position);

    const elapsed = (performance.now() - data.spawnTime) / 1000;
    if (elapsed > PROJECTILE_LIFETIME) {
      onExpire(data.id);
      return;
    }

    const playerPos = useRogueStore.getState().playerWorldPosition;
    const dist = data.position.distanceTo(
      new THREE.Vector3(playerPos[0], playerPos[1], playerPos[2])
    );
    if (dist < 0.5) {
      if (!playerInvincible) damagePlayer(PROJECTILE_DAMAGE);
      onExpire(data.id);
    }
  });

  return (
    <mesh ref={ref} position={data.position}>
      <sphereGeometry args={[0.12, 8, 8]} />
      <meshStandardMaterial color="#a855f7" emissive="#a855f7" emissiveIntensity={1} />
    </mesh>
  );
}

// ---------- Individual enemy agent ----------

interface EnemyAgentProps {
  id: string;
  archetype: EnemyArchetype;
  initialPosition: [number, number, number];
  navGrid: NavGrid;
  onDeath: (id: string, position: [number, number, number]) => void;
  onSpawnProjectile: (proj: ProjectileData) => void;
}

const BRUTE_CONFIG = {
  maxHp: 80,
  speed: 1.0,
  contactDamage: 12,
  contactRange: 0.8,
  attackCooldown: 1.2,
};

const RANGER_CONFIG = {
  maxHp: 35,
  speed: 1.6,
  preferredDistance: 6,
  distanceTolerance: 1.5,
  fireCooldown: 1.8,
};

function EnemyAgent({
  id,
  archetype,
  initialPosition,
  navGrid,
  onDeath,
  onSpawnProjectile,
}: EnemyAgentProps) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const meshRef = useRef<THREE.Mesh>(null);

  const config = archetype === 'brute' ? BRUTE_CONFIG : RANGER_CONFIG;
  const maxHp = config.maxHp;

  const [hp, setHp] = useState(maxHp);
  const [isDead, setIsDead] = useState(false);
  const stateRef = useRef<EnemyState>('chase');
  const flashTimerRef = useRef(0);
  const actionCooldownRef = useRef(Math.random() * 1); // stagger initial timing across agents
  const strafeDirRef = useRef<1 | -1>(Math.random() > 0.5 ? 1 : -1);
  const strafeSwitchTimerRef = useRef(2 + Math.random() * 2);

  const pathRef = useRef<{ x: number; y: number }[]>([]);
  const pathRecalcTimerRef = useRef(0);

  const playerTakeDamage = useRogueStore((s) => s.takeDamage);

  const takeDamage = useCallback((amount: number, isCrit: boolean) => {
    setHp((prev) => {
      const next = Math.max(0, prev - amount);
      flashTimerRef.current = isCrit ? 0.25 : 0.15;
      if (next <= 0) setIsDead(true);
      return next;
    });
  }, []);

  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.userData = { type: 'enemy', archetype, takeDamage, id };
    const pos = body?.translation();
    if (pos) AIManager.register(id, new THREE.Vector3(pos.x, pos.y, pos.z), archetype);
    return () => AIManager.unregister(id);
  }, [id, archetype, takeDamage]);

  useEffect(() => {
    if (isDead) {
      const body = bodyRef.current;
      const pos = body ? body.translation() : { x: initialPosition[0], y: 0.5, z: initialPosition[2] };
      onDeath(id, [pos.x, pos.y, pos.z]);
      AIManager.unregister(id);
    }
  }, [isDead, id, onDeath, initialPosition]);

  useFrame((state, delta) => {
    if (isDead) return;
    const body = bodyRef.current;
    if (!body) return;

    const enemyPos = body.translation();
    const enemyVec = new THREE.Vector3(enemyPos.x, enemyPos.y, enemyPos.z);
    AIManager.update(id, enemyVec);

    const playerWorldPos = useRogueStore.getState().playerWorldPosition;
    const playerVec = new THREE.Vector3(playerWorldPos[0], playerWorldPos[1], playerWorldPos[2]);
    const toPlayer = new THREE.Vector3().subVectors(playerVec, enemyVec);
    const distToPlayer = toPlayer.length();

    actionCooldownRef.current -= delta;

    let moveX = 0;
    let moveZ = 0;

    if (archetype === 'brute') {
      const bruteConfig = config as typeof BRUTE_CONFIG;

      // --- Brute: direct chase with occasional A* pathing through walls ---
      pathRecalcTimerRef.current -= delta;
      const needsPath = distToPlayer > 3 && pathRecalcTimerRef.current <= 0;

      if (needsPath) {
        const startGrid = worldToGrid(enemyVec.x, enemyVec.z, navGrid.tileSize);
        const goalGrid = worldToGrid(playerVec.x, playerVec.z, navGrid.tileSize);
        pathRef.current = findPath(navGrid, startGrid, goalGrid, 300);
        pathRecalcTimerRef.current = 0.8;
      }

      if (pathRef.current.length > 1) {
        const next = pathRef.current[1];
        const targetWorldX = next.x * navGrid.tileSize;
        const targetWorldZ = next.y * navGrid.tileSize;
        const dx = targetWorldX - enemyVec.x;
        const dz = targetWorldZ - enemyVec.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.3) pathRef.current.shift();
        if (d > 0.01) {
          moveX = dx / d;
          moveZ = dz / d;
        }
      } else if (distToPlayer > 0.01) {
        // Close range / no path found: go straight at the player
        moveX = toPlayer.x / distToPlayer;
        moveZ = toPlayer.z / distToPlayer;
      }

      stateRef.current = distToPlayer < bruteConfig.contactRange + 0.3 ? 'attack' : 'chase';

      if (stateRef.current === 'attack' && actionCooldownRef.current <= 0) {
        playerTakeDamage(bruteConfig.contactDamage);
        actionCooldownRef.current = bruteConfig.attackCooldown;
      }
    } else {
      // --- Ranger: maintain preferred distance, strafe, fire projectiles ---
      const rangerConfig = config as typeof RANGER_CONFIG;
      strafeSwitchTimerRef.current -= delta;
      if (strafeSwitchTimerRef.current <= 0) {
        strafeDirRef.current = (strafeDirRef.current * -1) as 1 | -1;
        strafeSwitchTimerRef.current = 2 + Math.random() * 2;
      }

      const distError = distToPlayer - rangerConfig.preferredDistance;
      const dirToPlayer = distToPlayer > 0.01
        ? { x: toPlayer.x / distToPlayer, z: toPlayer.z / distToPlayer }
        : { x: 0, z: 0 };

      if (Math.abs(distError) > rangerConfig.distanceTolerance) {
        // Too far: approach. Too close: retreat.
        const sign = distError > 0 ? 1 : -1;
        moveX += dirToPlayer.x * sign;
        moveZ += dirToPlayer.z * sign;
        stateRef.current = 'chase';
      } else {
        stateRef.current = 'strafe';
      }

      // Strafe perpendicular to the player direction regardless, for liveliness
      const perpX = -dirToPlayer.z;
      const perpZ = dirToPlayer.x;
      moveX += perpX * strafeDirRef.current * 0.6;
      moveZ += perpZ * strafeDirRef.current * 0.6;

      // Fire projectile on cooldown if roughly in range and has line-of-sight distance
      if (
        actionCooldownRef.current <= 0 &&
        distToPlayer < rangerConfig.preferredDistance + rangerConfig.distanceTolerance + 2
      ) {
        const dir = dirToPlayer.x !== 0 || dirToPlayer.z !== 0 ? dirToPlayer : { x: 0, z: 1 };
        onSpawnProjectile({
          id: `proj-${id}-${Date.now()}`,
          position: new THREE.Vector3(enemyVec.x, 0.6, enemyVec.z),
          velocity: new THREE.Vector3(dir.x, 0, dir.z).multiplyScalar(PROJECTILE_SPEED),
          spawnTime: performance.now(),
        });
        actionCooldownRef.current = rangerConfig.fireCooldown;
      }
    }

    // --- Separation (boids) to prevent stacking ---
    const sep = AIManager.getSeparationVector(id, enemyVec);
    moveX += sep.x;
    moveZ += sep.z;

    const len = Math.hypot(moveX, moveZ);
    if (len > 0.01) {
      const nx = moveX / len;
      const nz = moveZ / len;
      body.setLinvel({ x: nx * config.speed, y: body.linvel().y, z: nz * config.speed }, true);

      if (meshRef.current) {
        const targetAngle = Math.atan2(nx, nz);
        meshRef.current.rotation.y = THREE.MathUtils.lerp(
          meshRef.current.rotation.y,
          targetAngle,
          0.12
        );
      }
    } else {
      body.setLinvel({ x: 0, y: body.linvel().y, z: 0 }, true);
    }

    if (flashTimerRef.current > 0) flashTimerRef.current -= delta;
  });

  if (isDead) return null;

  const hpRatio = hp / maxHp;
  const flashing = flashTimerRef.current > 0;
  const baseColor = archetype === 'brute' ? '#dc2626' : '#a855f7';
  const size = archetype === 'brute' ? 0.8 : 0.5;

  return (
    <RigidBody
      ref={bodyRef}
      colliders={false}
      mass={archetype === 'brute' ? 2.5 : 0.8}
      lockRotations
      enabledRotations={[false, false, false]}
      position={initialPosition}
      type="dynamic"
      userData={{ type: 'enemy', archetype, takeDamage, id }}
    >
      <CuboidCollider args={[size / 2, size / 2, size / 2]} />
      <mesh ref={meshRef} castShadow>
        <boxGeometry args={[size, size, size]} />
        <meshStandardMaterial
          color={flashing ? '#ffffff' : baseColor}
          emissive={flashing ? '#ffffff' : '#000000'}
          emissiveIntensity={flashing ? 0.8 : 0}
        />
      </mesh>
      <group position={[0, size / 2 + 0.25, 0]}>
        <mesh>
          <planeGeometry args={[0.7, 0.08]} />
          <meshBasicMaterial color="#1f2937" />
        </mesh>
        <mesh position={[-(0.7 * (1 - hpRatio)) / 2, 0, 0.001]}>
          <planeGeometry args={[0.7 * hpRatio, 0.08]} />
          <meshBasicMaterial color={archetype === 'brute' ? '#22c55e' : '#c084fc'} />
        </mesh>
      </group>
    </RigidBody>
  );
}

// ---------- Manager component: spawns & tracks the full enemy roster ----------

interface SpawnDef {
  id: string;
  archetype: EnemyArchetype;
  position: [number, number, number];
}

interface MultiAgentEnemiesProps {
  spawns: SpawnDef[];
  navGrid: NavGrid;
  onAllDefeated?: () => void;
}

export default function MultiAgentEnemies({
  spawns,
  navGrid,
  onAllDefeated,
}: MultiAgentEnemiesProps) {
  const [aliveIds, setAliveIds] = useState<Set<string>>(() => new Set(spawns.map((s) => s.id)));
  const [projectiles, setProjectiles] = useState<ProjectileData[]>([]);
  const addSouls = useRogueStore((s) => s.addSouls);

  const handleDeath = useCallback(
    (id: string, position: [number, number, number]) => {
      setAliveIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        if (next.size === 0) onAllDefeated?.();
        return next;
      });
      addSouls(5);
    },
    [onAllDefeated, addSouls]
  );

  const handleSpawnProjectile = useCallback((proj: ProjectileData) => {
    setProjectiles((prev) => [...prev, proj]);
  }, []);

  const handleExpireProjectile = useCallback((id: string) => {
    setProjectiles((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return (
    <group>
      {spawns
        .filter((s) => aliveIds.has(s.id))
        .map((s) => (
          <EnemyAgent
            key={s.id}
            id={s.id}
            archetype={s.archetype}
            initialPosition={s.position}
            navGrid={navGrid}
            onDeath={handleDeath}
            onSpawnProjectile={handleSpawnProjectile}
          />
        ))}
      {projectiles.map((p) => (
        <Projectile key={p.id} data={p} onExpire={handleExpireProjectile} />
      ))}
    </group>
  );
}

// Helper: convert a DungeonGrid into a NavGrid for the A* pathfinder
export function dungeonGridToNavGrid(dungeonGrid: DungeonGrid, tileSize: number): NavGrid {
  const walkable = dungeonGrid.tiles.map((row) =>
    row.map((t) => t === 'floor' || t === 'corridor' || t === 'spawn' || t === 'exit')
  );
  return { width: dungeonGrid.width, height: dungeonGrid.height, walkable, tileSize };
}