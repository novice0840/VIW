import { ATLAS_GRID, BlockType, BLOCK_TILES, isTransparent } from './block';
import { fbm, hash2d } from './noise';

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 64;
const SEA_LEVEL = 20;

const DIRT_DEPTH = 4;

// 잔디 기둥 하나에 나무가 설 확률
const TREE_CHANCE = 0.03;
const TREE_MIN_TRUNK = 4;
const TREE_MAX_TRUNK = 6;
// 잎이 기둥에서 수평으로 퍼지는 최대 칸 수
const LEAF_RADIUS = 2;
// 나무 기둥끼리 이 칸 수보다 가까우면 심지 않는다 (가로·세로 중 큰 쪽 기준)
const TREE_MIN_GAP = 4;
// hash2d에서 서로 독립적인 값을 뽑기 위한 seed
const SEED_TREE_PLACE = 1;
const SEED_TREE_HEIGHT = 2;

// position(3) + normal(3) + uv(2)
export const FLOATS_PER_VERTEX = 8;

/**
 * @description 타일 번호와 타일 안의 로컬 좌표(0~1)를 아틀라스 전체 기준 UV로 바꾸는 함수
 *
 * 이미지 좌표계라 v=0이 타일의 위쪽이다.
 *
 * 타일 경계 UV를 그대로 쓴다. nearest 필터 + 밉맵 없음에서는 옆 타일이 번지지 않는다.
 * linear 필터나 밉맵을 도입하면 경계에서 옆 타일 텍셀이 섞이므로
 * 반 텍셀 inset이나 타일 간 여백이 필요해진다.
 */
function atlasUV(tile: number, u: number, v: number): [number, number] {
  const col = tile % ATLAS_GRID;
  const row = Math.floor(tile / ATLAS_GRID);
  return [(col + u) / ATLAS_GRID, (row + v) / ATLAS_GRID];
}

/**
 * @description 청크 좌표를 Map 키 문자열로 만드는 함수
 *
 * World(블록 데이터)와 Renderer(GPU 메시)가 각자 Map을 들고 있지만 키 규칙은 하나여야
 * 하므로, 포맷을 여기 한 군데에만 둔다.
 */
export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

/**
 * @description 지형 높이에 따라 맨 위 표면에 깔릴 블록 종류를 결정하는 함수
 */
function surfaceBlock(height: number): BlockType {
  if (height > SEA_LEVEL + 1) return BlockType.Snow;
  if (height <= SEA_LEVEL - 2) return BlockType.Sand;
  return BlockType.Grass;
}

/**
 * @description 기둥의 특정 높이 y에 들어갈 블록 종류를 결정하는 함수
 * @param height 이 기둥의 지형 높이
 * @param surface 이 기둥의 표면 블록 종류
 */
function columnBlock(y: number, height: number, surface: BlockType): BlockType {
  if (y === 0) return BlockType.Stone; // 최하단은 항상 돌
  if (y === height - 1) return surface;
  if (y >= height - DIRT_DEPTH) return BlockType.Dirt;
  return BlockType.Stone;
}

export class Chunk {
  blocks: Uint8Array;

  constructor(
    public readonly cx: number,
    public readonly cz: number,
  ) {
    this.blocks = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
    this.generate();
  }

  /**
   * @description 로컬 좌표 x,y,z를 받아 해당 위치의 블록 종류를 반환하는 함수
   */
  getBlock(x: number, y: number, z: number): BlockType {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
      return BlockType.Air;
    }
    return this.blocks[this.idx(x, y, z)];
  }

  setBlock(x: number, y: number, z: number, type: BlockType) {
    this.blocks[this.idx(x, y, z)] = type;
  }

  /**
   * @description 청크의 블록 데이터를 GPU가 그릴 수 있는 버텍스 배열로 변환하는 함수
   */
  buildMesh(): { vertices: Float32Array; vertexCount: number } {
    const verts: number[] = [];

    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const block = this.getBlock(x, y, z);
          if (block === BlockType.Air) continue;

          const tiles = BLOCK_TILES[block];
          if (!tiles) continue;

          const wx = this.cx * CHUNK_SIZE + x;
          const wz = this.cz * CHUNK_SIZE + z;

          // Check 6 faces: +X, -X, +Y, -Y, +Z, -Z
          // Each face: 2 triangles = 6 vertices
          // Vertex: position(3) + normal(3) + uv(2)
          // atlasUV의 (u, v)는 면 안에서의 로컬 좌표(0~1)로,
          // 면을 바깥에서 바라봤을 때 u는 왼쪽→오른쪽, v는 위→아래로 커진다.
          // 옆면의 v는 블록 윗변이 0, 아랫변이 1 — 잔디 옆면의 풀이 위쪽에 오게 된다.

          // +Y (top)
          if (isTransparent(this.getBlock(x, y + 1, z))) {
            const t = tiles.top;
            const n = [0, 1, 0];
            // vertex 6개로 삼각형 2개를 만들어 사각형 1개를 채우는 로직
            verts.push(wx, y + 1, wz, ...n, ...atlasUV(t, 0, 0));
            verts.push(wx + 1, y + 1, wz + 1, ...n, ...atlasUV(t, 1, 1));
            verts.push(wx + 1, y + 1, wz, ...n, ...atlasUV(t, 1, 0));
            verts.push(wx, y + 1, wz, ...n, ...atlasUV(t, 0, 0));
            verts.push(wx, y + 1, wz + 1, ...n, ...atlasUV(t, 0, 1));
            verts.push(wx + 1, y + 1, wz + 1, ...n, ...atlasUV(t, 1, 1));
          }

          // -Y (bottom)
          if (y === 0 || isTransparent(this.getBlock(x, y - 1, z))) {
            const t = tiles.bottom;
            const n = [0, -1, 0];
            verts.push(wx, y, wz + 1, ...n, ...atlasUV(t, 0, 1));
            verts.push(wx + 1, y, wz, ...n, ...atlasUV(t, 1, 0));
            verts.push(wx + 1, y, wz + 1, ...n, ...atlasUV(t, 1, 1));
            verts.push(wx, y, wz + 1, ...n, ...atlasUV(t, 0, 1));
            verts.push(wx, y, wz, ...n, ...atlasUV(t, 0, 0));
            verts.push(wx + 1, y, wz, ...n, ...atlasUV(t, 1, 0));
          }

          // +X (right) — 바깥에서 보면 오른쪽이 -Z
          if (isTransparent(this.getBlock(x + 1, y, z))) {
            const t = tiles.side;
            const n = [1, 0, 0];
            verts.push(wx + 1, y, wz, ...n, ...atlasUV(t, 1, 1));
            verts.push(wx + 1, y + 1, wz, ...n, ...atlasUV(t, 1, 0));
            verts.push(wx + 1, y + 1, wz + 1, ...n, ...atlasUV(t, 0, 0));
            verts.push(wx + 1, y, wz, ...n, ...atlasUV(t, 1, 1));
            verts.push(wx + 1, y + 1, wz + 1, ...n, ...atlasUV(t, 0, 0));
            verts.push(wx + 1, y, wz + 1, ...n, ...atlasUV(t, 0, 1));
          }

          // -X (left) — 바깥에서 보면 오른쪽이 +Z
          if (isTransparent(this.getBlock(x - 1, y, z))) {
            const t = tiles.side;
            const n = [-1, 0, 0];
            verts.push(wx, y, wz + 1, ...n, ...atlasUV(t, 1, 1));
            verts.push(wx, y + 1, wz + 1, ...n, ...atlasUV(t, 1, 0));
            verts.push(wx, y + 1, wz, ...n, ...atlasUV(t, 0, 0));
            verts.push(wx, y, wz + 1, ...n, ...atlasUV(t, 1, 1));
            verts.push(wx, y + 1, wz, ...n, ...atlasUV(t, 0, 0));
            verts.push(wx, y, wz, ...n, ...atlasUV(t, 0, 1));
          }

          // +Z (front) — 바깥에서 보면 오른쪽이 +X
          if (isTransparent(this.getBlock(x, y, z + 1))) {
            const t = tiles.side;
            const n = [0, 0, 1];
            verts.push(wx + 1, y, wz + 1, ...n, ...atlasUV(t, 1, 1));
            verts.push(wx + 1, y + 1, wz + 1, ...n, ...atlasUV(t, 1, 0));
            verts.push(wx, y + 1, wz + 1, ...n, ...atlasUV(t, 0, 0));
            verts.push(wx + 1, y, wz + 1, ...n, ...atlasUV(t, 1, 1));
            verts.push(wx, y + 1, wz + 1, ...n, ...atlasUV(t, 0, 0));
            verts.push(wx, y, wz + 1, ...n, ...atlasUV(t, 0, 1));
          }

          // -Z (back) — 바깥에서 보면 오른쪽이 -X
          if (isTransparent(this.getBlock(x, y, z - 1))) {
            const t = tiles.side;
            const n = [0, 0, -1];
            verts.push(wx, y, wz, ...n, ...atlasUV(t, 1, 1));
            verts.push(wx, y + 1, wz, ...n, ...atlasUV(t, 1, 0));
            verts.push(wx + 1, y + 1, wz, ...n, ...atlasUV(t, 0, 0));
            verts.push(wx, y, wz, ...n, ...atlasUV(t, 1, 1));
            verts.push(wx + 1, y + 1, wz, ...n, ...atlasUV(t, 0, 0));
            verts.push(wx + 1, y, wz, ...n, ...atlasUV(t, 0, 1));
          }
        }
      }
    }

    const vertices = new Float32Array(verts);
    // verts는 그냥 숫자를 쭉 이어붙인 평평한 배열이라 길이가 "float 개수"지 "정점 개수"가 아니다.
    // 정점 하나의 float 수로 나누어야 실제 정점 수가 나온다.
    return { vertices, vertexCount: verts.length / FLOATS_PER_VERTEX };
  }

  private idx(x: number, y: number, z: number): number {
    return y * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x;
  }

  /**
   * @description 청크의 블록을 채우는 함수
   *
   * 1단계에서 높이맵으로 땅을 채우고, 2단계에서 그 표면 위에 나무를 얹는다.
   * 나무는 "표면이 잔디인가", "땅 높이가 얼마인가"를 알아야 하므로 땅이 다 채워진 뒤에 놓는다.
   */
  private generate() {
    const heights = this.generateTerrain();
    this.placeTrees(heights);
  }

  /**
   * @description 높이맵으로 기둥마다 땅을 채우는 함수
   * @returns 기둥별 지형 높이 (index = z * CHUNK_SIZE + x). 표면 블록은 height - 1에 있다.
   */
  private generateTerrain(): Uint8Array {
    const wx = this.cx * CHUNK_SIZE;
    const wz = this.cz * CHUNK_SIZE;
    const heights = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const worldX = wx + x;
        const worldZ = wz + z;

        // Terrain height using fractal Brownian motion
        // baseHeight: fBm이 반환한 원시 노이즈 값
        // height: 노이즈를 실제 블록 높이로 변환
        // clampedHeight: 유효 범위로 제한
        const baseHeight = fbm(worldX * 0.01, worldZ * 0.01, 5, 2.0, 0.5);
        const height = Math.floor(SEA_LEVEL + baseHeight * 18);
        const clampedHeight = Math.max(1, Math.min(WORLD_HEIGHT - 1, height));

        // 표면 블록은 기둥 전체에서 하나로 정해지므로 루프 밖에서 미리 구한다.
        const surface = surfaceBlock(clampedHeight);

        // clampedHeight 위쪽은 공기이고, blocks는 0(Air)으로 초기화되어 있어 채울 필요가 없다.
        for (let y = 0; y < clampedHeight; y++) {
          this.setBlock(x, y, z, columnBlock(y, clampedHeight, surface));
        }
        heights[z * CHUNK_SIZE + x] = clampedHeight;
      }
    }

    return heights;
  }

  /**
   * @description 잔디 표면 위에 나무를 심는 함수
   *
   * 심을지 말지와 기둥 높이는 월드 좌표의 해시로 정한다. 그래서 같은 청크를
   * 다시 생성해도 같은 자리에 같은 나무가 나온다.
   *
   * 잎이 옆 청크로 삐져나가지 않도록 청크 가장자리 LEAF_RADIUS칸 안쪽에만 심는다.
   * 그 결과 청크 경계를 따라 폭 2 * LEAF_RADIUS의 나무 없는 띠가 생긴다 — 경계를 넘는
   * 구조물을 다루려면 이웃 청크에 블록을 써 넣는 구조가 필요하다.
   */
  private placeTrees(heights: Uint8Array) {
    // 이미 심은 기둥의 로컬 좌표. 간격 검사용이다.
    // 순회 순서가 고정이라 이 검사도 결정론적이다 — 같은 청크면 항상 같은 나무가 탈락한다.
    const planted: [number, number][] = [];

    for (let z = LEAF_RADIUS; z < CHUNK_SIZE - LEAF_RADIUS; z++) {
      for (let x = LEAF_RADIUS; x < CHUNK_SIZE - LEAF_RADIUS; x++) {
        const wx = this.cx * CHUNK_SIZE + x;
        const wz = this.cz * CHUNK_SIZE + z;
        if (hash2d(wx, wz, SEED_TREE_PLACE) >= TREE_CHANCE) continue;

        const ground = heights[z * CHUNK_SIZE + x];
        if (this.getBlock(x, ground - 1, z) !== BlockType.Grass) continue;

        const tooClose = planted.some(
          ([px, pz]) => Math.max(Math.abs(px - x), Math.abs(pz - z)) < TREE_MIN_GAP,
        );
        if (tooClose) continue;

        const trunk =
          TREE_MIN_TRUNK +
          Math.floor(hash2d(wx, wz, SEED_TREE_HEIGHT) * (TREE_MAX_TRUNK - TREE_MIN_TRUNK + 1));
        // 잎 꼭대기(기둥 맨 위 + 1)가 월드 높이를 넘으면 심지 않는다.
        if (ground + trunk >= WORLD_HEIGHT) continue;

        this.placeTree(x, ground, z, trunk);
        planted.push([x, z]);
      }
    }
  }

  /**
   * @description (x, z) 기둥의 땅 높이 ground 위에 나무 한 그루를 놓는 함수
   *
   * top = 기둥 맨 위 블록의 y. 잎은 위로 갈수록 좁아지고,
   * 모서리를 깎아 정사각 상자가 아니라 둥근 덩어리처럼 보이게 한다.
   */
  private placeTree(x: number, ground: number, z: number, trunk: number) {
    const top = ground + trunk - 1;

    for (let y = ground; y <= top; y++) {
      this.setBlock(x, y, z, BlockType.Wood);
    }

    this.placeLeafLayer(x, top - 2, z, LEAF_RADIUS, true); // 5×5, 모서리 제외
    this.placeLeafLayer(x, top - 1, z, LEAF_RADIUS, true); // 5×5, 모서리 제외
    this.placeLeafLayer(x, top, z, 1, false); // 3×3
    this.placeLeafLayer(x, top + 1, z, 1, true); // + 모양
  }

  /**
   * @description (x, z)를 중심으로 높이 y에 한 변이 2 * radius + 1인 정사각형 잎 층을 까는 함수
   * @param cutCorners true면 네 모서리 칸을 비운다
   */
  private placeLeafLayer(x: number, y: number, z: number, radius: number, cutCorners: boolean) {
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (cutCorners && Math.abs(dx) === radius && Math.abs(dz) === radius) continue;
        // 기둥이나 지형을 덮어쓰지 않고 빈 칸만 잎으로 채운다.
        if (this.getBlock(x + dx, y, z + dz) !== BlockType.Air) continue;
        this.setBlock(x + dx, y, z + dz, BlockType.Leaves);
      }
    }
  }
}
