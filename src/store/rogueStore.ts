import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// ---------- Types ----------

export type ItemType = 'gold' | 'potion';

export interface InventoryItem {
  id: string;
  type: ItemType;
  quantity: number;
}

export interface MetaUpgrade {
  id: string;
  name: string;
  level: number;
  maxLevel: number;
  costPerLevel: number; // souls cost scales with level via getMetaUpgradeCost
}

const UPGRADE_DEFS: Record<string, { name: string; maxLevel: number; baseCost: number }> = {
  attackPower: { name: '+5% Base Attack', maxLevel: 10, baseCost: 25 },
  maxHp: { name: '+10 Max HP', maxLevel: 10, baseCost: 25 },
  dashCharges: { name: '+1 Max Dash Charge', maxLevel: 3, baseCost: 100 },
  critChance: { name: '+3% Crit Chance', maxLevel: 8, baseCost: 40 },
};

// ---------- Run-scoped state (resets every death) ----------

interface RunState {
  hp: number;
  maxHp: number;
  isAlive: boolean;
  isInvincible: boolean;
  floorNumber: number;
  inventory: InventoryItem[];
  runSouls: number; // souls collected this run, banked to meta on death/exit
  playerWorldPosition: [number, number, number];
  playerFacing: [number, number, number];
  dungeonSeed: number | null;
}

// ---------- Meta-progression (persists across runs) ----------

interface MetaState {
  totalSouls: number;
  upgrades: Record<string, number>; // upgradeId -> level
  runsCompleted: number;
  bestFloorReached: number;
}

interface RogueStore extends RunState, MetaState {
  // Run actions
  takeDamage: (amount: number) => void;
  heal: (amount: number) => void;
  setInvincible: (val: boolean) => void;
  addItem: (type: ItemType, quantity?: number) => void;
  usePotion: () => void;
  addSouls: (amount: number) => void;
  setPlayerWorldPosition: (pos: [number, number, number]) => void;
  setPlayerFacing: (f: [number, number, number]) => void;
  advanceFloor: (newSeed: number) => void;
  startNewRun: (seed: number) => void;
  endRun: () => void; // call on death: banks souls, resets run state

  // Meta actions
  purchaseUpgrade: (upgradeId: string) => boolean; // returns success
  getMetaUpgradeCost: (upgradeId: string) => number;
  getEffectiveAttackPower: () => number;
  getEffectiveMaxHp: () => number;
  getEffectiveMaxDashCharges: () => number;
  getEffectiveCritChance: () => number;
  resetMetaProgress: () => void; // debug/dev utility
}

const BASE_ATTACK_POWER = 20;
const BASE_MAX_HP = 100;
const BASE_DASH_CHARGES = 1;
const BASE_CRIT_CHANCE = 0.05;

const initialRunState: RunState = {
  hp: BASE_MAX_HP,
  maxHp: BASE_MAX_HP,
  isAlive: true,
  isInvincible: false,
  floorNumber: 1,
  inventory: [],
  runSouls: 0,
  playerWorldPosition: [0, 0.5, 0],
  playerFacing: [0, 0, 1],
  dungeonSeed: null,
};

const initialMetaState: MetaState = {
  totalSouls: 0,
  upgrades: {},
  runsCompleted: 0,
  bestFloorReached: 1,
};

export function getMetaUpgradeCost(upgradeId: string, currentLevel: number): number {
  const def = UPGRADE_DEFS[upgradeId];
  if (!def) return Infinity;
  // Linear-ish scaling: cost grows per level so late upgrades are meaningfully pricier
  return Math.round(def.baseCost * (1 + currentLevel * 0.6));
}

export const useRogueStore = create<RogueStore>()(
  persist(
    (set, get) => ({
      ...initialRunState,
      ...initialMetaState,

      // --- Run actions ---
      takeDamage: (amount) =>
        set((state) => {
          if (!state.isAlive || state.isInvincible) return state;
          const newHp = Math.max(0, state.hp - amount);
          const isAlive = newHp > 0;
          return { hp: newHp, isAlive };
        }),

      heal: (amount) =>
        set((state) => ({ hp: Math.min(state.maxHp, state.hp + amount) })),

      setInvincible: (val) => set({ isInvincible: val }),

      addItem: (type, quantity = 1) =>
        set((state) => {
          if (type === 'gold') {
            return { runSouls: state.runSouls + quantity };
          }
          const existing = state.inventory.find((i) => i.type === type);
          if (existing) {
            return {
              inventory: state.inventory.map((i) =>
                i.type === type ? { ...i, quantity: i.quantity + quantity } : i
              ),
            };
          }
          return {
            inventory: [...state.inventory, { id: `${type}-${Date.now()}`, type, quantity }],
          };
        }),

      usePotion: () => {
        const state = get();
        const potion = state.inventory.find((i) => i.type === 'potion');
        if (!potion || potion.quantity <= 0) return;
        set((s) => ({
          inventory: s.inventory
            .map((i) => (i.type === 'potion' ? { ...i, quantity: i.quantity - 1 } : i))
            .filter((i) => i.quantity > 0),
        }));
        get().heal(30);
      },

      addSouls: (amount) => set((state) => ({ runSouls: state.runSouls + amount })),

      setPlayerWorldPosition: (pos) => set({ playerWorldPosition: pos }),
      setPlayerFacing: (f) => set({ playerFacing: f }),

      advanceFloor: (newSeed) =>
        set((state) => ({
          floorNumber: state.floorNumber + 1,
          dungeonSeed: newSeed,
          bestFloorReached: Math.max(state.bestFloorReached, state.floorNumber + 1),
        })),

      startNewRun: (seed) =>
        set((state) => ({
          ...initialRunState,
          maxHp: get().getEffectiveMaxHp(),
          hp: get().getEffectiveMaxHp(),
          dungeonSeed: seed,
        })),

      endRun: () => {
        const state = get();
        // Bank souls collected this run into permanent currency; lose temporary inventory
        set({
          totalSouls: state.totalSouls + state.runSouls,
          runsCompleted: state.runsCompleted + 1,
          bestFloorReached: Math.max(state.bestFloorReached, state.floorNumber),
          // Reset run-scoped fields, but keep meta fields untouched
          hp: 0,
          isAlive: false,
          inventory: [],
          runSouls: 0,
        });
      },

      // --- Meta actions ---
      getMetaUpgradeCost: (upgradeId) => {
        const level = get().upgrades[upgradeId] ?? 0;
        return getMetaUpgradeCost(upgradeId, level);
      },

      purchaseUpgrade: (upgradeId) => {
        const def = UPGRADE_DEFS[upgradeId];
        if (!def) return false;
        const state = get();
        const currentLevel = state.upgrades[upgradeId] ?? 0;
        if (currentLevel >= def.maxLevel) return false;
        const cost = getMetaUpgradeCost(upgradeId, currentLevel);
        if (state.totalSouls < cost) return false;

        set({
          totalSouls: state.totalSouls - cost,
          upgrades: { ...state.upgrades, [upgradeId]: currentLevel + 1 },
        });
        return true;
      },

      getEffectiveAttackPower: () => {
        const level = get().upgrades['attackPower'] ?? 0;
        return BASE_ATTACK_POWER * (1 + level * 0.05);
      },

      getEffectiveMaxHp: () => {
        const level = get().upgrades['maxHp'] ?? 0;
        return BASE_MAX_HP + level * 10;
      },

      getEffectiveMaxDashCharges: () => {
        const level = get().upgrades['dashCharges'] ?? 0;
        return BASE_DASH_CHARGES + level;
      },

      getEffectiveCritChance: () => {
        const level = get().upgrades['critChance'] ?? 0;
        return Math.min(0.8, BASE_CRIT_CHANCE + level * 0.03);
      },

      resetMetaProgress: () => set({ ...initialMetaState }),
    }),
    {
      name: 'pocket-dungeon-meta-storage',
      storage: createJSONStorage(() =>
        Platform.OS === 'web'
          ? {
              getItem: (name: string) => {
                const v = typeof localStorage !== 'undefined' ? localStorage.getItem(name) : null;
                return v;
              },
              setItem: (name: string, value: string) => {
                if (typeof localStorage !== 'undefined') localStorage.setItem(name, value);
              },
              removeItem: (name: string) => {
                if (typeof localStorage !== 'undefined') localStorage.removeItem(name);
              },
            }
          : AsyncStorage
      ),
      // Only persist meta-progression — run state must NOT survive app restarts
      partialize: (state) => ({
        totalSouls: state.totalSouls,
        upgrades: state.upgrades,
        runsCompleted: state.runsCompleted,
        bestFloorReached: state.bestFloorReached,
      }),
    }
  )
);

export { UPGRADE_DEFS };