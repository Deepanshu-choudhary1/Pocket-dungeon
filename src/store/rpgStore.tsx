import { create } from 'zustand';

export type ItemType = 'gold' | 'potion';

export interface InventoryItem {
  id: string;
  type: ItemType;
  quantity: number;
}

interface RpgState {
  // Player stats
  hp: number;
  maxHp: number;
  attackPower: number;
  isAlive: boolean;
  isAttacking: boolean;

  // Inventory
  inventory: InventoryItem[];
  gold: number;

  // Player world position (for AI + UI minimap if needed)
  playerPosition: [number, number, number];

  // Actions
  takeDamage: (amount: number) => void;
  heal: (amount: number) => void;
  setAttacking: (val: boolean) => void;
  addItem: (type: ItemType, quantity?: number) => void;
  usePotion: () => void;
  addGold: (amount: number) => void;
  setPlayerPosition: (pos: [number, number, number]) => void;
  resetPlayer: () => void;
}

const POTION_HEAL_AMOUNT = 30;

export const useRpgStore = create<RpgState>((set, get) => ({
  hp: 100,
  maxHp: 100,
  attackPower: 25,
  isAlive: true,
  isAttacking: false,

  inventory: [],
  gold: 0,

  playerPosition: [0, 0.5, 0],

  takeDamage: (amount) =>
    set((state) => {
      if (!state.isAlive) return state;
      const newHp = Math.max(0, state.hp - amount);
      return { hp: newHp, isAlive: newHp > 0 };
    }),

  heal: (amount) =>
    set((state) => ({
      hp: Math.min(state.maxHp, state.hp + amount),
    })),

  setAttacking: (val) => set({ isAttacking: val }),

  addItem: (type, quantity = 1) =>
    set((state) => {
      if (type === 'gold') {
        return { gold: state.gold + quantity };
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
        inventory: [
          ...state.inventory,
          { id: `${type}-${Date.now()}`, type, quantity },
        ],
      };
    }),

  usePotion: () => {
    const state = get();
    const potion = state.inventory.find((i) => i.type === 'potion');
    if (!potion || potion.quantity <= 0) return;
    set((s) => ({
      inventory: s.inventory
        .map((i) =>
          i.type === 'potion' ? { ...i, quantity: i.quantity - 1 } : i
        )
        .filter((i) => i.quantity > 0),
    }));
    get().heal(POTION_HEAL_AMOUNT);
  },

  addGold: (amount) => set((state) => ({ gold: state.gold + amount })),

  setPlayerPosition: (pos) => set({ playerPosition: pos }),

  resetPlayer: () =>
    set({
      hp: 100,
      isAlive: true,
      inventory: [],
      gold: 0,
    }),
}));