import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { useRpgStore } from '../store/rpgStore';

export const enemyDamageMap = new Map<string, (amount: number) => void>();

interface EnemyMobProps {
  id: string;
  initialPosition: [number, number, number];
  maxHp?: number;
  speed?: number;
  contactDamage?: number;
  onDeath?: (id: string, position: [number, number, number]) => void;
}

const DEFAULT_MAX_HP = 50;
const DEFAULT_SPEED = 1.1;
const DEFAULT_CONTACT_DAMAGE = 8;
const CONTACT_DAMAGE_COOLDOWN = 1.0;
const AGGRO_RANGE = 12;
const STOP_RANGE = 0.7;

export default function EnemyMob({
  id,
  initialPosition,
  maxHp = DEFAULT_MAX_HP,
  speed = DEFAULT_SPEED,
  contactDamage = DEFAULT_CONTACT_DAMAGE,
  onDeath,
}: EnemyMobProps) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const [hp, setHp] = useState(maxHp);
  const [isDead, setIsDead] = useState(false);
  const flashTimerRef = useRef(0);
  const contactCooldownRef = useRef(0);
  const lastPositionRef = useRef({ x: initialPosition[0], y: initialPosition[1], z: initialPosition[2] });

  const playerTakeDamage = useRpgStore((s) => s.takeDamage);

  const takeDamage = useCallback(
    (amount: number) => {
      setHp((prev) => {
        const next = Math.max(0, prev - amount);
        flashTimerRef.current = 0.15;
        if (next <= 0 && !isDead) {
          setIsDead(true);
        }
        return next;
      });
    },
    [isDead]
  );

  useEffect(() => {
    enemyDamageMap.set(id, takeDamage);
    return () => {
      enemyDamageMap.delete(id);
    };
  }, [id, takeDamage]);

  useEffect(() => {
    const body = bodyRef.current;
    if (body) {
      body.userData = { type: 'enemy', id };
    }
  }, [id]);

  // Handle death -> loot drop + removal
  useEffect(() => {
    if (isDead) {
      const pos = lastPositionRef.current;
      onDeath?.(id, [pos.x, pos.y, pos.z]);
    }
  }, [isDead, id, onDeath]);

  useFrame((state, delta) => {
    if (isDead) return;
    const body = bodyRef.current;
    if (!body) return;

    const playerPos = useRpgStore.getState().playerPosition;
    const enemyPos = body.translation();
    lastPositionRef.current = enemyPos;

    const dx = playerPos[0] - enemyPos.x;
    const dz = playerPos[2] - enemyPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < AGGRO_RANGE && dist > STOP_RANGE) {
      const nx = dx / dist;
      const nz = dz / dist;
      body.setLinvel({ x: nx * speed, y: body.linvel().y, z: nz * speed }, true);

      if (meshRef.current) {
        const targetAngle = Math.atan2(nx, nz);
        meshRef.current.rotation.y = THREE.MathUtils.lerp(
          meshRef.current.rotation.y,
          targetAngle,
          0.1
        );
      }
    } else {
      body.setLinvel({ x: 0, y: body.linvel().y, z: 0 }, true);
    }

    // Contact damage to player
    if (dist <= STOP_RANGE + 0.3) {
      contactCooldownRef.current -= delta;
      if (contactCooldownRef.current <= 0) {
        playerTakeDamage(contactDamage);
        contactCooldownRef.current = CONTACT_DAMAGE_COOLDOWN;
      }
    }

    // Hit flash decay
    if (flashTimerRef.current > 0) {
      flashTimerRef.current -= delta;
    }
  });

  if (isDead) return null;

  const hpRatio = hp / maxHp;
  const flashing = flashTimerRef.current > 0;

  return (
    <RigidBody
      ref={bodyRef}
      colliders={false}
      mass={1}
      lockRotations
      enabledRotations={[false, false, false]}
      position={initialPosition}
      type="dynamic"
    >
      <CuboidCollider args={[0.35, 0.35, 0.35]} />
      <mesh ref={meshRef} castShadow>
        <boxGeometry args={[0.6, 0.6, 0.6]} />
        <meshStandardMaterial
          color={flashing ? '#ffffff' : '#dc2626'}
          emissive={flashing ? '#ffffff' : '#000000'}
          emissiveIntensity={flashing ? 0.8 : 0}
        />
      </mesh>

      {/* HP bar above enemy */}
      <group position={[0, 0.6, 0]}>
        <mesh position={[0, 0, 0]}>
          <planeGeometry args={[0.7, 0.08]} />
          <meshBasicMaterial color="#1f2937" />
        </mesh>
        <mesh position={[-(0.7 * (1 - hpRatio)) / 2, 0, 0.001]}>
          <planeGeometry args={[0.7 * hpRatio, 0.08]} />
          <meshBasicMaterial color="#22c55e" />
        </mesh>
      </group>
    </RigidBody>
  );
}