export const enum BlockType {
  Air = 0,
  Grass = 1,
  Dirt = 2,
  Stone = 3,
  Sand = 4,
  Wood = 5,
  Leaves = 6,
  Snow = 7,
}

export const HOTBAR = [
  BlockType.Grass,
  BlockType.Dirt,
  BlockType.Stone,
  BlockType.Sand,
  BlockType.Wood,
  BlockType.Leaves,
  BlockType.Snow,
];

// RGB colors for each block type [top, side, bottom]
// Each face can have a different color (e.g., grass top is green, side has brown+green, bottom is dirt)
export interface BlockColors {
  top: [number, number, number];
  side: [number, number, number];
  bottom: [number, number, number];
}

export const BLOCK_COLORS: Record<number, BlockColors> = {
  [BlockType.Grass]: {
    top: [0.36, 0.63, 0.2],
    side: [0.36, 0.5, 0.2],
    bottom: [0.55, 0.37, 0.24],
  },
  [BlockType.Dirt]: {
    top: [0.55, 0.37, 0.24],
    side: [0.55, 0.37, 0.24],
    bottom: [0.55, 0.37, 0.24],
  },
  [BlockType.Stone]: {
    top: [0.55, 0.55, 0.55],
    side: [0.5, 0.5, 0.5],
    bottom: [0.45, 0.45, 0.45],
  },
  [BlockType.Sand]: {
    top: [0.86, 0.82, 0.62],
    side: [0.82, 0.78, 0.58],
    bottom: [0.78, 0.74, 0.54],
  },
  [BlockType.Wood]: {
    top: [0.6, 0.45, 0.25],
    side: [0.45, 0.3, 0.15],
    bottom: [0.6, 0.45, 0.25],
  },
  [BlockType.Leaves]: {
    top: [0.2, 0.5, 0.15],
    side: [0.18, 0.45, 0.13],
    bottom: [0.15, 0.4, 0.1],
  },
  [BlockType.Snow]: {
    top: [0.95, 0.95, 0.97],
    side: [0.9, 0.9, 0.92],
    bottom: [0.85, 0.85, 0.87],
  },
};

export function isTransparent(block: BlockType): boolean {
  return block === BlockType.Air;
}

export function isSolid(block: BlockType): boolean {
  return block !== BlockType.Air;
}
