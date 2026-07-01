import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { useRogueStore, UPGRADE_DEFS } from '@/store/rogueStore';

interface MetaUpgradeScreenProps {
  onContinue: () => void;
}

export default function MetaUpgradeScreen({ onContinue }: MetaUpgradeScreenProps) {
  const { width } = useWindowDimensions();
  const totalSouls = useRogueStore((s) => s.totalSouls);
  const upgrades = useRogueStore((s) => s.upgrades);
  const purchaseUpgrade = useRogueStore((s) => s.purchaseUpgrade);
  const getMetaUpgradeCost = useRogueStore((s) => s.getMetaUpgradeCost);

  const [feedback, setFeedback] = useState<string | null>(null);

  const handlePurchase = (id: string) => {
    const success = purchaseUpgrade(id);
    if (success) {
      setFeedback('Upgrade purchased!');
    } else {
      const souls = useRogueStore.getState().totalSouls;
      const cost = getMetaUpgradeCost(id);
      setFeedback(souls < cost ? 'Not enough souls.' : 'Already maxed!');
    }
    setTimeout(() => setFeedback(null), 1400);
  };

  return (
    <View style={styles.overlay}>
      <View style={[styles.card, { width: Math.min(width - 32, 420) }]}>
        <Text style={styles.title}>FLOOR CLEARED</Text>
        <Text style={styles.subtitle}>Spend your souls before descending</Text>

        <View style={styles.soulRow}>
          <Text style={styles.soulIcon}>💀</Text>
          <Text style={styles.soulCount}>{totalSouls} souls available</Text>
        </View>

        {feedback && (
          <View style={styles.feedbackBanner}>
            <Text style={styles.feedbackText}>{feedback}</Text>
          </View>
        )}

        <ScrollView
          style={styles.upgradeList}
          showsVerticalScrollIndicator={false}
        >
          {Object.entries(UPGRADE_DEFS).map(([id, def]) => {
            const level = upgrades[id] ?? 0;
            const maxed = level >= def.maxLevel;
            const cost = getMetaUpgradeCost(id);
            const canAfford = totalSouls >= cost && !maxed;

            return (
              <UpgradeRow
                key={id}
                name={def.name}
                level={level}
                maxLevel={def.maxLevel}
                cost={cost}
                maxed={maxed}
                canAfford={canAfford}
                onPress={() => handlePurchase(id)}
              />
            );
          })}
        </ScrollView>

        <Pressable
          style={({ pressed }) => [
            styles.continueButton,
            pressed && styles.continueButtonPressed,
          ]}
          onPress={onContinue}
        >
          <Text style={styles.continueText}>DESCEND TO NEXT FLOOR ↓</Text>
        </Pressable>
      </View>
    </View>
  );
}

interface UpgradeRowProps {
  name: string;
  level: number;
  maxLevel: number;
  cost: number;
  maxed: boolean;
  canAfford: boolean;
  onPress: () => void;
}

function UpgradeRow({
  name,
  level,
  maxLevel,
  cost,
  maxed,
  canAfford,
  onPress,
}: UpgradeRowProps) {
  const progressRatio = level / maxLevel;

  return (
    <View style={upgradeStyles.row}>
      <View style={upgradeStyles.info}>
        <Text style={upgradeStyles.name}>{name}</Text>
        <View style={upgradeStyles.progressBar}>
          <View
            style={[
              upgradeStyles.progressFill,
              {
                width: `${progressRatio * 100}%`,
                backgroundColor: maxed ? '#fde68a' : '#6366f1',
              },
            ]}
          />
        </View>
        <Text style={upgradeStyles.levelText}>
          {maxed ? 'MAX' : `Lv ${level} / ${maxLevel}`}
        </Text>
      </View>
      <Pressable
        style={({ pressed }) => [
          upgradeStyles.buyButton,
          canAfford && upgradeStyles.buyButtonActive,
          maxed && upgradeStyles.buyButtonMaxed,
          pressed && canAfford && upgradeStyles.buyButtonPressed,
        ]}
        onPress={onPress}
        disabled={!canAfford}
      >
        <Text style={upgradeStyles.buyText}>
          {maxed ? '✓' : `💀 ${cost}`}
        </Text>
      </Pressable>
    </View>
  );
}

const upgradeStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 12,
  },
  info: {
    flex: 1,
    gap: 4,
  },
  name: {
    color: '#f9fafb',
    fontSize: 13,
    fontWeight: '600',
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  levelText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
  },
  buyButton: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 72,
    alignItems: 'center',
  },
  buyButtonActive: {
    backgroundColor: '#4f46e5',
  },
  buyButtonMaxed: {
    backgroundColor: 'rgba(253,230,138,0.1)',
  },
  buyButtonPressed: {
    backgroundColor: '#4338ca',
    transform: [{ scale: 0.95 }],
  },
  buyText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.88)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.35)',
    padding: 24,
    maxHeight: '85%',
  },
  title: {
    color: '#a5f3fc',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 4,
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  soulRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    paddingVertical: 8,
    marginBottom: 12,
  },
  soulIcon: { fontSize: 18 },
  soulCount: {
    color: '#fde68a',
    fontSize: 15,
    fontWeight: '700',
  },
  feedbackBanner: {
    backgroundColor: 'rgba(99,102,241,0.25)',
    borderRadius: 8,
    paddingVertical: 6,
    marginBottom: 8,
  },
  feedbackText: {
    color: '#c7d2fe',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
  },
  upgradeList: {
    maxHeight: 320,
  },
  continueButton: {
    marginTop: 20,
    backgroundColor: '#0f766e',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  continueButtonPressed: {
    backgroundColor: '#0d5f58',
    transform: [{ scale: 0.97 }],
  },
  continueText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 1.5,
  },
});