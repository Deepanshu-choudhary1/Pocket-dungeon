import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

/**
 * Full-screen white flash on a critical hit.
 * Mount it for ~150 ms then unmount — parent controls lifetime.
 */
export default function CriticalHitFlash() {
  const opacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 0,
      duration: 130,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View
      style={[styles.flash, { opacity }]}
      collapsable={false}
    />
  );
}

const styles = StyleSheet.create({
  flash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ffffff',
  },
});