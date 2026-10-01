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

// const enum은 컴파일 시 숫자로 인라인돼 런타임에 이름이 남지 않는다.
// 핫바 UI에 블록 이름을 띄우려면 따로 적어둬야 한다.
export const BLOCK_NAMES: Record<number, string> = {
  [BlockType.Grass]: 'Grass',
  [BlockType.Dirt]: 'Dirt',
  [BlockType.Stone]: 'Stone',
  [BlockType.Sand]: 'Sand',
  [BlockType.Wood]: 'Wood',
  [BlockType.Leaves]: 'Leaves',
  [BlockType.Snow]: 'Snow',
};

/**
 * @description 아틀라스(public/textures/atlas.png)의 타일 번호
 *
 * 아틀라스는 16px 타일이 4x4로 놓인 한 장의 이미지이고, 번호는 row * 4 + col 순서다.
 * 순서는 tools/gen-textures.mjs의 LAYOUT이 정하므로 둘을 함께 바꿔야 한다.
 */
export const ATLAS_GRID = 4;

// public/ 아래 파일은 빌드 결과물 루트에 그대로 복사된다. 상대 경로라 배포 base 경로가 달라도 동작한다.
// 렌더러(WebGPU 텍스처)와 핫바(CSS 배경)가 같은 이미지를 쓴다.
export const ATLAS_URL = 'textures/atlas.png';

const enum Tile {
  GrassTop = 0,
  GrassSide = 1,
  Dirt = 2,
  Stone = 3,
  Sand = 4,
  WoodTop = 5,
  WoodSide = 6,
  Leaves = 7,
  Snow = 8,
}

export interface BlockTiles {
  top: number;
  side: number;
  bottom: number;
}

const uniform = (tile: Tile): BlockTiles => ({ top: tile, side: tile, bottom: tile });

export const BLOCK_TILES: Record<number, BlockTiles> = {
  [BlockType.Grass]: { top: Tile.GrassTop, side: Tile.GrassSide, bottom: Tile.Dirt },
  [BlockType.Dirt]: uniform(Tile.Dirt),
  [BlockType.Stone]: uniform(Tile.Stone),
  [BlockType.Sand]: uniform(Tile.Sand),
  [BlockType.Wood]: { top: Tile.WoodTop, side: Tile.WoodSide, bottom: Tile.WoodTop },
  [BlockType.Leaves]: uniform(Tile.Leaves),
  [BlockType.Snow]: uniform(Tile.Snow),
};

export function isTransparent(block: BlockType): boolean {
  return block === BlockType.Air;
}

export function isSolid(block: BlockType): boolean {
  return block !== BlockType.Air;
}
