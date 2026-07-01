import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { useRpgStore } from '../store/rpgStore';
import { enemyDamageMap } from './EnemyMob';

export interface HeroHandle {
  triggerAttack: () => void;
  setMoveVector: (v: { x: number; y: number }) => void;
}

interface HeroProps {
  onReady?: (handle: HeroHandle) => void;
  moveTargetRef?: React.MutableRefObject<THREE.Vector3 | null>;
}

const MOVE_SPEED = 4;
const ATTACK_DURATION = 0.3;
const ATTACK_COOLDOWN = 0.5;
const STOP_DISTANCE = 0.15;

export default function Hero({ onReady, moveTargetRef }: HeroProps) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const swordRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Group>(null);

  const facingRef = useRef(new THREE.Vector3(0, 0, 1));
  const joystickRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef<Record<string, boolean>>({});

  const attackTimerRef = useRef(0);
  const attackCooldownRef = useRef(0);
  const [isAttackingVisual, setIsAttackingVisual] = useState(false);

  const takeDamage = useRpgStore((s) => s.takeDamage);
  const hp = useRpgStore((s) => s.hp);
  const setAttacking = useRpgStore((s) => s.setAttacking);
  const setPlayerPosition = useRpgStore((s) => s.setPlayerPosition);

  const isWeb = Platform.OS === 'web';

  // Keyboard input (web)
  useEffect(() => {
    if (!isWeb) return;
    const down = (e: KeyboardEvent) => (keysRef.current[e.key.toLowerCase()] = true);
    const up = (e: KeyboardEvent) => (keysRef.current[e.key.toLowerCase()] = false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [isWeb]);

  const triggerAttack = useCallback(() => {
    if (attackCooldownRef.current > 0) return;
    attackTimerRef.current = ATTACK_DURATION;
    attackCooldownRef.current = ATTACK_COOLDOWN;
    setIsAttackingVisual(true);
    setAttacking(true);
  }, [setAttacking]);

  const setMoveVector = useCallback((v: { x: number; y: number }) => {
    joystickRef.current = v;
  }, []);

  useEffect(() => {
    onReady?.({ triggerAttack, setMoveVector });
  }, [onReady, triggerAttack, setMoveVector]);

  useFrame((_, delta) => {
    const body = bodyRef.current;
    if (!body || hp <= 0) return;

    const pos = body.translation();
    let moveX = 0;
    let moveZ = 0;

    // Joystick input (mobile)
    if (joystickRef.current.x !== 0 || joystickRef.current.y !== 0) {
      moveX = joystickRef.current.x;
      moveZ = joystickRef.current.y;
    }

    // Keyboard input (web)
    if (isWeb) {
      const k = keysRef.current;
      if (k['w'] || k['arrowup']) moveZ -= 1;
      if (k['s'] || k['arrowdown']) moveZ += 1;
      if (k['a'] || k['arrowleft']) moveX -= 1;
      if (k['d'] || k['arrowright']) moveX += 1;
    }

    // Tap-to-move target (web raycast)
    let usingTarget = false;
    if (
      moveX === 0 &&
      moveZ === 0 &&
      moveTargetRef?.current &&
      isWeb
    ) {
      const target = moveTargetRef.current;
      const dx = target.x - pos.x;
      const dz = target.z - pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > STOP_DISTANCE) {
        moveX = dx / dist;
        moveZ = dz / dist;
        usingTarget = true;
      } else {
        moveTargetRef.current = null;
      }
    }

    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (len > 0.01) {
      const nx = moveX / len;
      const nz = moveZ / len;

      body.setLinvel(
        { x: nx * MOVE_SPEED, y: body.linvel().y, z: nz * MOVE_SPEED },
        true
      );

      facingRef.current.set(nx, 0, nz).normalize();
      const targetAngle = Math.atan2(nx, nz);
      if (meshRef.current) {
        meshRef.current.rotation.y = THREE.MathUtils.lerp(
          meshRef.current.rotation.y,
          targetAngle,
          0.25
        );
      }
    } else {
      body.setLinvel({ x: 0, y: body.linvel().y, z: 0 }, true);
      if (!usingTarget && moveTargetRef) moveTargetRef.current = null;
    }

    // Sync store position for AI targeting
    setPlayerPosition([pos.x, pos.y, pos.z]);

    // Attack timers
    if (attackCooldownRef.current > 0) {
      attackCooldownRef.current -= delta;
    }
    if (attackTimerRef.current > 0) {
      attackTimerRef.current -= delta;
      if (swordRef.current) {
        const progress = 1 - attackTimerRef.current / ATTACK_DURATION;
        swordRef.current.rotation.z = -Math.PI / 2 + progress * Math.PI;
      }
      if (attackTimerRef.current <= 0) {
        setIsAttackingVisual(false);
        setAttacking(false);
        if (swordRef.current) swordRef.current.rotation.z = -Math.PI / 2;
      }
    }
  });

  return (
    <RigidBody
      ref={bodyRef}
      colliders={false}
      mass={1}
      lockRotations
      enabledRotations={[false, false, false]}
      position={[0, 0.5, 0]}
      type="dynamic"
      userData={{ type: 'player' }}
    >
      <CuboidCollider args={[0.35, 0.5, 0.35]} />
      <group ref={meshRef}>
        {/* Body */}
        <mesh castShadow position={[0, 0, 0]}>
          <capsuleGeometry args={[0.3, 0.5, 4, 8]} />
          <meshStandardMaterial color="#3b82f6" />
        </mesh>
        {/* Direction indicator (nose) */}
        <mesh position={[0, 0.1, 0.35]}>
          <boxGeometry args={[0.15, 0.15, 0.15]} />
          <meshStandardMaterial color="#1e40af" />
        </mesh>

        {/* Sword (attack hitbox visual pivot) */}
        <group ref={swordRef} position={[0.35, 0.1, 0.2]} rotation={[0, 0, -Math.PI / 2]}>
          <mesh position={[0.4, 0, 0]} castShadow>
            <boxGeometry args={[0.7, 0.08, 0.08]} />
            <meshStandardMaterial
              color={isAttackingVisual ? '#facc15' : '#d1d5db'}
              emissive={isAttackingVisual ? '#facc15' : '#000000'}
              emissiveIntensity={isAttackingVisual ? 0.6 : 0}
            />
          </mesh>

          {/* Attack hitbox sensor - only active during swing */}
          {isAttackingVisual && (
            <CuboidCollider
              args={[0.45, 0.3, 0.3]}
              position={[0.4, 0, 0]}
              sensor
              onIntersectionEnter={(payload) => {
                const other = payload.other.rigidBody;
                const otherUserData = other?.userData as
                  | { type?: string; id?: string }
                  | undefined;
                if (otherUserData?.type === 'enemy' && otherUserData.id) {
                  const power = useRpgStore.getState().attackPower;
                  const damageFn = enemyDamageMap.get(otherUserData.id);
                  damageFn?.(power);
                }
              }}
            />
          )}
        </group>
      </group>
    </RigidBody>
  );
}