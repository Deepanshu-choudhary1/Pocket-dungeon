import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { useRogueStore } from '@/store/rogueStore';

interface DeathScreenProps {
  onRestart: () => void;
}

export default function DeathScreen({ onRestart }: DeathScreenProps) {
  const totalSouls = useRogueStore((s) => s.totalSouls);
  const runSoulsEarned = useRogueStore((s) => s.runSouls);
  const runsCompleted = useRogueStore((s) => s.runsCompleted);
  const bestFloor = useRogueStore((s) => s.bestFloorReached);
  const floorNumber = useRogueStore((s) => s.floorNumber);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    const useNative = Platform.OS !== 'web';
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: useNative,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: useNative,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.overlay,
        { opacity: fadeAnim },
      ]}
    >
      <Animated.View
        style={[
          styles.card,
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        <Text style={styles.title}>YOU DIED</Text>
        <View style={styles.divider} />

        <Text style={styles.subtitle}>Run Summary</Text>

        <StatRow label="Floor Reached" value={String(floorNumber)} />
        <StatRow label="Best Floor Ever" value={String(bestFloor)} />
        <StatRow label="Souls This Run" value={`+${runSoulsEarned}`} accent="#a78bfa" />
        <StatRow label="Total Banked Souls" value={String(totalSouls)} accent="#fde68a" />
        <StatRow label="Runs Completed" value={String(runsCompleted)} />

        <View style={styles.divider} />
        <Text style={styles.bankNote}>
          Your souls have been banked.{'\n'}
          Use them to purchase permanent upgrades before your next run.
        </Text>

        <Pressable
          style={({ pressed }) => [
            styles.restartButton,
            pressed && styles.restartButtonPressed,
          ]}
          onPress={onRestart}
        >
          <Text style={styles.restartText}>BEGIN NEW RUN</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

function StatRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <View style={statStyles.row}>
      <Text style={statStyles.label}>{label}</Text>
      <Text style={[statStyles.value, accent ? { color: accent } : null]}>
        {value}
      </Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  label: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
  },
  value: {
    color: '#f9fafb',
    fontSize: 13,
    fontWeight: '700',
  },
});

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: 320,
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    padding: 28,
    gap: 6,
  },
  title: {
    color: '#ef4444',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 6,
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 8,
  },
  bankNote: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 8,
  },
  restartButton: {
    marginTop: 12,
    backgroundColor: '#dc2626',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  restartButtonPressed: {
    backgroundColor: '#b91c1c',
    transform: [{ scale: 0.97 }],
  },
  restartText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 2,
  },
});