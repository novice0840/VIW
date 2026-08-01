import { BlockType, BLOCK_COLORS, isTransparent } from './block';
import { fbm } from './noise';

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 64;
const SEA_LEVEL = 20;

const DIRT_DEPTH = 4;

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

          const colors = BLOCK_COLORS[block];
          if (!colors) continue;

          const wx = this.cx * CHUNK_SIZE + x;
          const wz = this.cz * CHUNK_SIZE + z;

          // Check 6 faces: +X, -X, +Y, -Y, +Z, -Z
          // Each face: 2 triangles = 6 vertices
          // Vertex: position(3) + normal(3) + color(3) = 9 floats

          // +Y (top)
          if (isTransparent(this.getBlock(x, y + 1, z))) {
            const c = colors.top;
            const n: [number, number, number] = [0, 1, 0];
            // vertex 6개로 삼각형 2개를 만들어 사각형 1개를 채우는 로직
            verts.push(wx, y + 1, wz, ...n, ...c);
            verts.push(wx + 1, y + 1, wz + 1, ...n, ...c);
            verts.push(wx + 1, y + 1, wz, ...n, ...c);
            verts.push(wx, y + 1, wz, ...n, ...c);
            verts.push(wx, y + 1, wz + 1, ...n, ...c);
            verts.push(wx + 1, y + 1, wz + 1, ...n, ...c);
          }

          // -Y (bottom)
          if (y === 0 || isTransparent(this.getBlock(x, y - 1, z))) {
            const c = colors.bottom;
            const n: [number, number, number] = [0, -1, 0];
            verts.push(wx, y, wz + 1, ...n, ...c);
            verts.push(wx + 1, y, wz, ...n, ...c);
            verts.push(wx + 1, y, wz + 1, ...n, ...c);
            verts.push(wx, y, wz + 1, ...n, ...c);
            verts.push(wx, y, wz, ...n, ...c);
            verts.push(wx + 1, y, wz, ...n, ...c);
          }

          // +X (right)
          if (isTransparent(this.getBlock(x + 1, y, z))) {
            const c = colors.side;
            const n: [number, number, number] = [1, 0, 0];
            verts.push(wx + 1, y, wz, ...n, ...c);
            verts.push(wx + 1, y + 1, wz, ...n, ...c);
            verts.push(wx + 1, y + 1, wz + 1, ...n, ...c);
            verts.push(wx + 1, y, wz, ...n, ...c);
            verts.push(wx + 1, y + 1, wz + 1, ...n, ...c);
            verts.push(wx + 1, y, wz + 1, ...n, ...c);
          }

          // -X (left)
          if (isTransparent(this.getBlock(x - 1, y, z))) {
            const c = colors.side;
            const n: [number, number, number] = [-1, 0, 0];
            verts.push(wx, y, wz + 1, ...n, ...c);
            verts.push(wx, y + 1, wz + 1, ...n, ...c);
            verts.push(wx, y + 1, wz, ...n, ...c);
            verts.push(wx, y, wz + 1, ...n, ...c);
            verts.push(wx, y + 1, wz, ...n, ...c);
            verts.push(wx, y, wz, ...n, ...c);
          }

          // +Z (front)
          if (isTransparent(this.getBlock(x, y, z + 1))) {
            const c = colors.side;
            const n: [number, number, number] = [0, 0, 1];
            verts.push(wx + 1, y, wz + 1, ...n, ...c);
            verts.push(wx + 1, y + 1, wz + 1, ...n, ...c);
            verts.push(wx, y + 1, wz + 1, ...n, ...c);
            verts.push(wx + 1, y, wz + 1, ...n, ...c);
            verts.push(wx, y + 1, wz + 1, ...n, ...c);
            verts.push(wx, y, wz + 1, ...n, ...c);
          }

          // -Z (back)
          if (isTransparent(this.getBlock(x, y, z - 1))) {
            const c = colors.side;
            const n: [number, number, number] = [0, 0, -1];
            verts.push(wx, y, wz, ...n, ...c);
            verts.push(wx, y + 1, wz, ...n, ...c);
            verts.push(wx + 1, y + 1, wz, ...n, ...c);
            verts.push(wx, y, wz, ...n, ...c);
            verts.push(wx + 1, y + 1, wz, ...n, ...c);
            verts.push(wx + 1, y, wz, ...n, ...c);
          }
        }
      }
    }

    const vertices = new Float32Array(verts);
    // 정점 하나가 float 9개로 이루어져 있어서 9로 나눈다.
    // position(3) + normal(3) + color(3) = 9 floats
    // verts는 그냥 숫자를 쭉 이어붙인 평평한 배열이라 길이가 "float 개수"지 "정점 개수"가 아니다. 그래서 9로 나누어야 실제 정점 수가 나온다.
    return { vertices, vertexCount: verts.length / 9 };
  }

  private idx(x: number, y: number, z: number): number {
    return y * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x;
  }

  private generate() {
    const wx = this.cx * CHUNK_SIZE;
    const wz = this.cz * CHUNK_SIZE;

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
      }
    }
  }
}
