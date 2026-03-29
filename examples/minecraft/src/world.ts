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

  private idx(x: number, y: number, z: number): number {
    return y * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x;
  }

  getBlock(x: number, y: number, z: number): BlockType {
    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT || z < 0 || z >= CHUNK_SIZE) {
      return BlockType.Air;
    }
    return this.blocks[this.idx(x, y, z)];
  }

  private setBlock(x: number, y: number, z: number, type: BlockType) {
    this.blocks[this.idx(x, y, z)] = type;
  }

  private generate() {
    const wx = this.cx * CHUNK_SIZE;
    const wz = this.cz * CHUNK_SIZE;

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const worldX = wx + x;
        const worldZ = wz + z;

        // Terrain height using fractal Brownian motion
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
            if (clampedHeight > SEA_LEVEL + 12) {
              this.setBlock(x, y, z, BlockType.Snow);
            } else if (clampedHeight <= SEA_LEVEL + 1) {
              this.setBlock(x, y, z, BlockType.Sand);
            } else {
              this.setBlock(x, y, z, BlockType.Grass);
            }
          } else if (y < SEA_LEVEL) {
            this.setBlock(x, y, z, BlockType.Water);
          }
        }

        // Trees on grass above sea level
        if (
          clampedHeight > SEA_LEVEL + 2 &&
          clampedHeight < SEA_LEVEL + 10 &&
          this.getBlock(x, clampedHeight - 1, z) === BlockType.Grass
        ) {
          const treeSeed = Math.abs(Math.sin(worldX * 12.9898 + worldZ * 78.233) * 43758.5453) % 1;
          if (treeSeed < 0.02 && x > 2 && x < CHUNK_SIZE - 3 && z > 2 && z < CHUNK_SIZE - 3) {
            this.placeTree(x, clampedHeight, z);
          }
        }
      }
    }
  }

  private placeTree(x: number, y: number, z: number) {
    const trunkHeight = 4 + Math.floor(Math.random() * 2);

    for (let i = 0; i < trunkHeight; i++) {
      if (y + i < WORLD_HEIGHT) {
        this.setBlock(x, y + i, z, BlockType.Wood);
      }
    }

    const leafStart = y + trunkHeight - 2;
    const leafEnd = y + trunkHeight + 1;
    for (let ly = leafStart; ly <= leafEnd; ly++) {
      const radius = ly < leafEnd ? 2 : 1;
      for (let lx = -radius; lx <= radius; lx++) {
        for (let lz = -radius; lz <= radius; lz++) {
          if (lx === 0 && lz === 0 && ly < y + trunkHeight) continue;
          if (Math.abs(lx) === radius && Math.abs(lz) === radius && Math.random() > 0.5) continue;
          const bx = x + lx;
          const bz = z + lz;
          if (bx >= 0 && bx < CHUNK_SIZE && bz >= 0 && bz < CHUNK_SIZE && ly < WORLD_HEIGHT) {
            if (this.getBlock(bx, ly, bz) === BlockType.Air) {
              this.setBlock(bx, ly, bz, BlockType.Leaves);
            }
          }
        }
      }
    }
  }

  buildMesh(): { vertices: Float32Array; vertexCount: number } {
    const verts: number[] = [];

    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const block = this.getBlock(x, y, z);
          if (block === BlockType.Air) continue;
          if (block === BlockType.Water) continue; // skip water mesh for now

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
            verts.push(wx, y + 1, wz, ...n, ...c);
            verts.push(wx + 1, y + 1, wz, ...n, ...c);
            verts.push(wx + 1, y + 1, wz + 1, ...n, ...c);
            verts.push(wx, y + 1, wz, ...n, ...c);
            verts.push(wx + 1, y + 1, wz + 1, ...n, ...c);
            verts.push(wx, y + 1, wz + 1, ...n, ...c);
          }

          // -Y (bottom)
          if (y === 0 || isTransparent(this.getBlock(x, y - 1, z))) {
            const c = colors.bottom;
            const n: [number, number, number] = [0, -1, 0];
            verts.push(wx, y, wz + 1, ...n, ...c);
            verts.push(wx + 1, y, wz + 1, ...n, ...c);
            verts.push(wx + 1, y, wz, ...n, ...c);
            verts.push(wx, y, wz + 1, ...n, ...c);
            verts.push(wx + 1, y, wz, ...n, ...c);
            verts.push(wx, y, wz, ...n, ...c);
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
}

export class World {
  chunks = new Map<string, Chunk>();

  private key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  getChunk(cx: number, cz: number): Chunk {
    const k = this.key(cx, cz);
    let chunk = this.chunks.get(k);
    if (!chunk) {
      chunk = new Chunk(cx, cz);
      this.chunks.set(k, chunk);
    }
    return chunk;
  }

  getBlock(wx: number, wy: number, wz: number): BlockType {
    const bx = Math.floor(wx);
    const by = Math.floor(wy);
    const bz = Math.floor(wz);
    if (by < 0 || by >= WORLD_HEIGHT) return BlockType.Air;
    const cx = Math.floor(bx / CHUNK_SIZE);
    const cz = Math.floor(bz / CHUNK_SIZE);
    const lx = ((bx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((bz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const k = this.key(cx, cz);
    const chunk = this.chunks.get(k);
    if (!chunk) return BlockType.Air;
    return chunk.getBlock(lx, by, lz);
  }

  generateAround(centerX: number, centerZ: number, radius: number) {
    const ccx = Math.floor(centerX / CHUNK_SIZE);
    const ccz = Math.floor(centerZ / CHUNK_SIZE);

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        this.getChunk(ccx + dx, ccz + dz);
      }
    }
  }
}
