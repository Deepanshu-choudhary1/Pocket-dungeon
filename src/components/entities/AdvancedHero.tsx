import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { useFrame } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { Trail } from '@react-three/drei';
import { useRogueStore } from '../../store/rogueStore';

export interface HeroHandle {
  triggerAttack: () => void;
  triggerDash: () => void;
  setMoveVector: (v: { x: number; y: number }) => void;
}

interface AdvancedHeroProps {
  onReady?: (handle: HeroHandle) => void;
  moveTargetRef?: React.MutableRefObject<THREE.Vector3 | null>;
  onCriticalHit?: () => void; // wired up to a hit-stop controller in the parent
  initialPosition?: [number, number, number];
}

const MOVE_SPEED = 4;
const STOP_DISTANCE = 0.15;

// Combo timing
const COMBO_WINDOW = 0.6; // seconds to chain into the next hit
const COMBO_STEPS = [
  { duration: 0.22, damageMult: 1.0, lungeForce: 1.5 },
  { duration: 0.22, damageMult: 1.15, lungeForce: 1.5 },
  { duration: 0.3, damageMult: 1.6, lungeForce: 3.0 }, // finisher: bigger hitbox + crit chance
];
const ATTACK_COOLDOWN = 0.12;
const CRIT_CHANCE_ON_FINISHER = 0.35;

// Dash
const DASH_SPEED = 11;
const DASH_DURATION = 0.18;
const DASH_IFRAME_DURATION = 0.22;
const DASH_COOLDOWN_BASE = 0.9;

export default function AdvancedHero({
  onReady,
  moveTargetRef,
  onCriticalHit,
  initialPosition,
}: AdvancedHeroProps) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const meshRef = useRef<THREE.Group>(null);
  const swordRef = useRef<THREE.Group>(null);
  const swordTipRef = useRef<THREE.Mesh>(null);

  const facingRef = useRef(new THREE.Vector3(0, 0, 1));
  const joystickRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef<Record<string, boolean>>({});

  // Combo state
  const comboIndexRef = useRef(0);
  const comboWindowTimerRef = useRef(0);
  const attackTimerRef = useRef(0);
  const attackCooldownRef = useRef(0);
  const [isAttacking, setIsAttacking] = useState(false);
  const [showTrail, setShowTrail] = useState(false);

  // Dash state
  const dashTimerRef = useRef(0);
  const dashCooldownRef = useRef(0);
  const dashDirRef = useRef(new THREE.Vector3());
  const [isDashing, setIsDashing] = useState(false);

  const hp = useRogueStore((s) => s.hp);
  const takeDamage = useRogueStore((s) => s.takeDamage);
  const setInvincible = useRogueStore((s) => s.setInvincible);
  const setPlayerWorldPosition = useRogueStore((s) => s.setPlayerWorldPosition);
  const setPlayerFacing = useRogueStore((s) => s.setPlayerFacing);
  const baseAttackPower = useRogueStore((s) => s.getEffectiveAttackPower());
  const maxDashCharges = useRogueStore((s) => s.getEffectiveMaxDashCharges());
  const dashChargesRef = useRef(maxDashCharges);
  const dashRechargeTimerRef = useRef(0);

  const isWeb = Platform.OS === 'web';

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
    if (attackCooldownRef.current > 0 || isDashing) return;

    // Chain combo if within the window, otherwise reset to step 0
    if (comboWindowTimerRef.current > 0) {
      comboIndexRef.current = (comboIndexRef.current + 1) % COMBO_STEPS.length;
    } else {
      comboIndexRef.current = 0;
    }

    const step = COMBO_STEPS[comboIndexRef.current];
    attackTimerRef.current = step.duration;
    attackCooldownRef.current = ATTACK_COOLDOWN;
    comboWindowTimerRef.current = step.duration + COMBO_WINDOW;
    setIsAttacking(true);
    setShowTrail(true);

    // Lunge in the facing direction for weight
    const body = bodyRef.current;
    if (body && typeof body.applyImpulse === 'function') {
      try {
        const f = facingRef.current;
        body.applyImpulse({ x: f.x * step.lungeForce, y: 0, z: f.z * step.lungeForce }, true);
      } catch (err) {
        // Rapier may throw if the underlying native pointer was dropped; guard against that
        // and avoid crashing the app on web builds.
        // eslint-disable-next-line no-console
        console.warn('applyImpulse failed (body may be invalid):', err);
      }
    }
  }, [isDashing]);

  const triggerDash = useCallback(() => {
    if (dashTimerRef.current > 0 || dashChargesRef.current <= 0) return;

    let dx = joystickRef.current.x;
    let dz = joystickRef.current.y;
    if (isWeb) {
      const k = keysRef.current;
      if (k['w'] || k['arrowup']) dz -= 1;
      if (k['s'] || k['arrowdown']) dz += 1;
      if (k['a'] || k['arrowleft']) dx -= 1;
      if (k['d'] || k['arrowright']) dx += 1;
    }
    const len = Math.hypot(dx, dz);
    const dir =
      len > 0.1
        ? new THREE.Vector3(dx / len, 0, dz / len)
        : facingRef.current.clone();

    dashDirRef.current.copy(dir);
    dashTimerRef.current = DASH_DURATION;
    dashChargesRef.current -= 1;
    setIsDashing(true);
    setInvincible(true);

    setTimeout(() => setInvincible(false), DASH_IFRAME_DURATION * 1000);
  }, [isWeb, setInvincible]);

  const setMoveVector = useCallback((v: { x: number; y: number }) => {
    joystickRef.current = v;
  }, []);

  useEffect(() => {
    onReady?.({ triggerAttack, triggerDash, setMoveVector });
  }, [onReady, triggerAttack, triggerDash, setMoveVector]);

  useFrame((_, delta) => {
    const body = bodyRef.current;
    if (!body || hp <= 0) return;

    const pos = body.translation();

    // --- Dash recharge over time ---
    if (dashChargesRef.current < maxDashCharges) {
      dashRechargeTimerRef.current -= delta;
      if (dashRechargeTimerRef.current <= 0) {
        dashChargesRef.current += 1;
        dashRechargeTimerRef.current = DASH_COOLDOWN_BASE;
      }
    }

    // --- Dash motion takes priority over normal movement ---
    if (dashTimerRef.current > 0) {
      dashTimerRef.current -= delta;
      const d = dashDirRef.current;
      body.setLinvel({ x: d.x * DASH_SPEED, y: body.linvel().y, z: d.z * DASH_SPEED }, true);
      if (dashTimerRef.current <= 0) setIsDashing(false);
    } else {
      let moveX = 0;
      let moveZ = 0;

      if (joystickRef.current.x !== 0 || joystickRef.current.y !== 0) {
        moveX = joystickRef.current.x;
        moveZ = joystickRef.current.y;
      }

      if (isWeb) {
        const k = keysRef.current;
        if (k['w'] || k['arrowup']) moveZ -= 1;
        if (k['s'] || k['arrowdown']) moveZ += 1;
        if (k['a'] || k['arrowleft']) moveX -= 1;
        if (k['d'] || k['arrowright']) moveX += 1;
      }

      let usingTarget = false;
      if (moveX === 0 && moveZ === 0 && moveTargetRef?.current && isWeb) {
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
      if (len > 0.01 && attackTimerRef.current <= 0) {
        const nx = moveX / len;
        const nz = moveZ / len;
        body.setLinvel({ x: nx * MOVE_SPEED, y: body.linvel().y, z: nz * MOVE_SPEED }, true);
        facingRef.current.set(nx, 0, nz).normalize();
        if (meshRef.current) {
          const targetAngle = Math.atan2(nx, nz);
          meshRef.current.rotation.y = THREE.MathUtils.lerp(
            meshRef.current.rotation.y,
            targetAngle,
            0.25
          );
        }
      } else if (attackTimerRef.current <= 0) {
        body.setLinvel({ x: 0, y: body.linvel().y, z: 0 }, true);
        if (!usingTarget && moveTargetRef) moveTargetRef.current = null;
      }
    }

    setPlayerWorldPosition([pos.x, pos.y, pos.z]);
    // store facing so the camera can follow behind the hero
    setPlayerFacing([facingRef.current.x, facingRef.current.y, facingRef.current.z]);

    // --- Attack/combo timers ---
    if (attackCooldownRef.current > 0) attackCooldownRef.current -= delta;
    if (comboWindowTimerRef.current > 0) comboWindowTimerRef.current -= delta;

    if (attackTimerRef.current > 0) {
      attackTimerRef.current -= delta;
      const step = COMBO_STEPS[comboIndexRef.current];
      const progress = 1 - attackTimerRef.current / step.duration;
      if (swordRef.current) {
        swordRef.current.rotation.z = -Math.PI / 2 + progress * Math.PI * 1.3;
      }
      if (attackTimerRef.current <= 0) {
        setIsAttacking(false);
        setShowTrail(false);
        if (swordRef.current) swordRef.current.rotation.z = -Math.PI / 2;
      }
    }
  });

  const handleHitboxIntersect = useCallback(
    (payload: any) => {
      const getUserData = () => {
        const other = payload.other;
        const body = other?.rigidBody;
        const bodyObj = other?.rigidBodyObject;
        const colliderObj = other?.colliderObject;
        const collider = other?.collider;
        return (
          body?.userData ||
          bodyObj?.userData ||
          colliderObj?.userData ||
          collider?.userData
        );
      };

      const otherUserData = getUserData() as
        | { type?: string; takeDamage?: (n: number, isCrit: boolean) => void }
        | undefined;

      if (otherUserData?.type === 'enemy' && otherUserData.takeDamage) {
        const step = COMBO_STEPS[comboIndexRef.current];
        const isFinisher = comboIndexRef.current === COMBO_STEPS.length - 1;
        const isCrit = isFinisher && Math.random() < CRIT_CHANCE_ON_FINISHER;
        const damage = baseAttackPower * step.damageMult * (isCrit ? 2 : 1);
        otherUserData.takeDamage(damage, isCrit);
        if (isCrit) onCriticalHit?.();
      }
    },
    [baseAttackPower, onCriticalHit]
  );

  const dashChargeRatio = dashChargesRef.current / Math.max(1, maxDashCharges);

  return (
    <RigidBody
      ref={bodyRef}
      colliders={false}
      mass={1}
      lockRotations
      enabledRotations={[false, false, false]}
      position={initialPosition ?? [0, 0.5, 0]}
      type="dynamic"
      userData={{ type: 'player' }}
    >
      <CuboidCollider args={[0.35, 0.5, 0.35]} />
      <group ref={meshRef}>
        <mesh castShadow>
          <capsuleGeometry args={[0.3, 0.5, 4, 8]} />
          <meshStandardMaterial
            color={isDashing ? '#93c5fd' : '#3b82f6'}
            transparent
            opacity={isDashing ? 0.6 : 1}
          />
        </mesh>
        <mesh position={[0, 0.1, 0.35]}>
          <boxGeometry args={[0.15, 0.15, 0.15]} />
          <meshStandardMaterial color="#1e40af" />
        </mesh>

        <group ref={swordRef} position={[0.35, 0.1, 0.2]} rotation={[0, 0, -Math.PI / 2]}>
          {showTrail ? (
            <Trail width={2} length={4} color="#facc15" attenuation={(t) => t * t}>
              <mesh ref={swordTipRef} position={[0.4, 0, 0]} castShadow>
                <boxGeometry args={[0.7, 0.08, 0.08]} />
                <meshStandardMaterial
                  color="#facc15"
                  emissive="#facc15"
                  emissiveIntensity={0.6}
                />
              </mesh>
            </Trail>
          ) : (
            <mesh ref={swordTipRef} position={[0.4, 0, 0]} castShadow>
              <boxGeometry args={[0.7, 0.08, 0.08]} />
              <meshStandardMaterial color="#d1d5db" />
            </mesh>
          )}

          {isAttacking && (
            <CuboidCollider
              args={
                comboIndexRef.current === COMBO_STEPS.length - 1
                  ? [0.55, 0.35, 0.4]
                  : [0.45, 0.3, 0.3]
              }
              position={[0.4, 0, 0]}
              sensor
              onIntersectionEnter={handleHitboxIntersect}
            />
          )}
        </group>

        {/* Dash charge indicator pips above the player's head */}
        <group position={[0, 1, 0]}>
          {Array.from({ length: maxDashCharges }).map((_, i) => (
            <mesh key={i} position={[(i - (maxDashCharges - 1) / 2) * 0.18, 0, 0]}>
              <circleGeometry args={[0.06, 8]} />
              <meshBasicMaterial
                color={i < dashChargesRef.current ? '#60a5fa' : '#374151'}
              />
            </mesh>
          ))}
        </group>
      </group>
    </RigidBody>
  );
}