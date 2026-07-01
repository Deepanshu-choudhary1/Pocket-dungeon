import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import VirtualJoystick from './VirtualJoystick';

interface MobileControlsProps {
  onMove: (v: { x: number; y: number }) => void;
  onAttack: () => void;
  onDash: () => void;
}

export default function MobileControls({
  onMove,
  onAttack,
  onDash,
}: MobileControlsProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.container, { bottom: insets.bottom + 16 }]}
      collapsable={false}
    >
      {/* Left: joystick */}
      <VirtualJoystick size={130} knobSize={50} onMove={onMove} />

      {/* Right: action buttons */}
      <View style={styles.buttonCluster}>
        {/* Dash — smaller, above attack */}
        <Pressable
          style={({ pressed }) => [
            styles.dashButton,
            pressed && styles.dashButtonPressed,
          ]}
          onPress={onDash}
        >
          <Text style={styles.dashIcon}>💨</Text>
          <Text style={styles.buttonLabel}>DASH</Text>
        </Pressable>

        {/* Attack — large primary */}
        <Pressable
          style={({ pressed }) => [
            styles.attackButton,
            pressed && styles.attackButtonPressed,
          ]}
          onPress={onAttack}
        >
          <Text style={styles.attackIcon}>⚔️</Text>
          <Text style={styles.buttonLabel}>ATK</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 24,
  },
  buttonCluster: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 14,
  },
  attackButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(220,38,38,0.75)',
    borderWidth: 2,
    borderColor: 'rgba(255,100,100,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  attackButtonPressed: {
    backgroundColor: 'rgba(220,38,38,0.95)',
    transform: [{ scale: 0.92 }],
  },
  attackIcon: {
    fontSize: 30,
  },
  dashButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: 'rgba(59,130,246,0.7)',
    borderWidth: 2,
    borderColor: 'rgba(147,197,253,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 1,
    marginBottom: 6,
  },
  dashButtonPressed: {
    backgroundColor: 'rgba(37,99,235,0.95)',
    transform: [{ scale: 0.92 }],
  },
  dashIcon: {
    fontSize: 22,
  },
  buttonLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
});