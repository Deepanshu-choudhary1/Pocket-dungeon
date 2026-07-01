import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRogueStore } from '@/store/rogueStore';

export default function HUD() {
  const insets = useSafeAreaInsets();
  const hp = useRogueStore((s) => s.hp);
  const maxHp = useRogueStore((s) => s.getEffectiveMaxHp());
  const runSouls = useRogueStore((s) => s.runSouls);
  const totalSouls = useRogueStore((s) => s.totalSouls);
  const floorNumber = useRogueStore((s) => s.floorNumber);
  const inventory = useRogueStore((s) => s.inventory);
  const usePotion = useRogueStore((s) => s.usePotion);
  const maxDashes = useRogueStore((s) => s.getEffectiveMaxDashCharges());

  const hpRatio = Math.max(0, Math.min(1, hp / maxHp));
  const potionCount = inventory.find((i) => i.type === 'potion')?.quantity ?? 0;

  // HP bar colour shifts red → yellow → green
  const hpColor =
    hpRatio > 0.6 ? '#22c55e' : hpRatio > 0.3 ? '#eab308' : '#ef4444';

  return (
    <View
      style={[styles.container, { top: insets.top + 8 }]}
      collapsable={false}
    >
      {/* Floor badge */}
      <View style={styles.floorBadge}>
        <Text style={styles.floorText}>FLOOR {floorNumber}</Text>
      </View>

      {/* HP bar */}
      <View style={styles.hpRow}>
        <Text style={styles.label}>HP</Text>
        <View style={styles.hpBarOuter}>
          <View
            style={[
              styles.hpBarInner,
              { width: `${hpRatio * 100}%`, backgroundColor: hpColor },
            ]}
          />
          <Text style={styles.hpText}>
            {Math.ceil(hp)} / {maxHp}
          </Text>
        </View>
      </View>

      {/* Soul counters */}
      <View style={styles.statsRow}>
        <StatChip icon="💀" label={`${runSouls} run`} />
        <StatChip icon="🏦" label={`${totalSouls} banked`} />
      </View>

      {/* Dash charge pips */}
      <View style={styles.dashRow}>
        <Text style={styles.label}>DASH</Text>
        {Array.from({ length: maxDashes }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dashPip,
              // colour determined live via store read in useFrame — we just show full here
              // for the HUD; actual charge count is tracked inside AdvancedHero's ref
            ]}
          />
        ))}
      </View>

      {/* Potion button */}
      {potionCount > 0 && (
        <View style={styles.potionRow}>
          <Text style={styles.potionHint} onPress={usePotion}>
            🧪 ×{potionCount}{'  '}
            <Text style={styles.potionUse}>[use]</Text>
          </Text>
        </View>
      )}
    </View>
  );
}

function StatChip({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>
        {icon} {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 12,
    right: 12,
    gap: 6,
  },
  floorBadge: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 3,
    marginBottom: 2,
  },
  floorText: {
    color: '#fde68a',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 2,
  },
  hpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    width: 32,
  },
  hpBarOuter: {
    flex: 1,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#1f2937',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  hpBarInner: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 11,
  },
  hpText: {
    textAlign: 'center',
    color: '#fff',
    fontWeight: '700',
    fontSize: 11,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: {
    color: '#e5e7eb',
    fontSize: 12,
    fontWeight: '600',
  },
  dashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dashPip: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#60a5fa',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  potionRow: {
    alignSelf: 'flex-start',
  },
  potionHint: {
    color: '#86efac',
    fontSize: 13,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  potionUse: {
    color: '#4ade80',
    textDecorationLine: 'underline',
  },
});