import { BlockType, BLOCK_COLORS, isTransparent } from './block';
import { fbm } from './noise';

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 64;
const SEA_LEVEL = 20;

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

        for (let y = 0; y < WORLD_HEIGHT; y++) {
          if (y === 0) {
            this.setBlock(x, y, z, BlockType.Stone);
          } else if (y < clampedHeight - 4) {
            this.setBlock(x, y, z, BlockType.Stone);
          } else if (y < clampedHeight - 1) {
            this.setBlock(x, y, z, BlockType.Dirt);
          } else if (y === clampedHeight - 1) {
            if (clampedHeight > SEA_LEVEL + 1) {
              this.setBlock(x, y, z, BlockType.Snow);
            } else if (clampedHeight <= SEA_LEVEL - 2) {
              this.setBlock(x, y, z, BlockType.Sand);
            } else {
              this.setBlock(x, y, z, BlockType.Grass);
            }
          }
        }

      }
    }
  }

}
