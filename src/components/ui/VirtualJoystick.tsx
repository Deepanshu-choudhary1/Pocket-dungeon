import React, { useRef, useState } from 'react';
import { View, StyleSheet, PanResponder, GestureResponderEvent } from 'react-native';

interface VirtualJoystickProps {
  size?: number;
  knobSize?: number;
  onMove: (vector: { x: number; y: number }) => void;
  onRelease?: () => void;
}

export default function VirtualJoystick({
  size = 120,
  knobSize = 48,
  onMove,
  onRelease,
}: VirtualJoystickProps) {
  const radius = size / 2;
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const originRef = useRef({ x: radius, y: radius });
  const activeRef = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (evt: GestureResponderEvent) => {
        activeRef.current = true;
        originRef.current = {
          x: evt.nativeEvent.locationX,
          y: evt.nativeEvent.locationY,
        };
      },

      onPanResponderMove: (evt: GestureResponderEvent) => {
        if (!activeRef.current) return;
        const dx = evt.nativeEvent.locationX - originRef.current.x;
        const dy = evt.nativeEvent.locationY - originRef.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const clamped = Math.min(dist, radius * 0.75);
        const angle = Math.atan2(dy, dx);
        const kx = Math.cos(angle) * clamped;
        const ky = Math.sin(angle) * clamped;
        setKnob({ x: kx, y: ky });
        // Normalise to [-1, 1]
        onMove({ x: kx / (radius * 0.75), y: ky / (radius * 0.75) });
      },

      onPanResponderRelease: () => {
        activeRef.current = false;
        setKnob({ x: 0, y: 0 });
        onMove({ x: 0, y: 0 });
        onRelease?.();
      },

      onPanResponderTerminate: () => {
        activeRef.current = false;
        setKnob({ x: 0, y: 0 });
        onMove({ x: 0, y: 0 });
        onRelease?.();
      },
    })
  ).current;

  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
      {...panResponder.panHandlers}
    >
      {/* Crosshair guides */}
      <View style={[styles.guide, styles.guideH]} />
      <View style={[styles.guide, styles.guideV]} />

      {/* Knob */}
      <View
        style={[
          styles.knob,
          {
            width: knobSize,
            height: knobSize,
            borderRadius: knobSize / 2,
            transform: [{ translateX: knob.x }, { translateY: knob.y }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  guide: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  guideH: {
    width: '80%',
    height: 1,
  },
  guideV: {
    width: 1,
    height: '80%',
  },
  knob: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    shadowColor: '#fff',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
    overflow: 'hidden',
  },
});