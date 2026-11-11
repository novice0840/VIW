import { ATLAS_GRID, BlockType, BLOCK_TILES, isTransparent } from './block';
import { fbm, hash2d, noise3d } from './noise';
import type { Vec3 } from './math';

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

// 치즈 동굴: 노이즈 값이 임계값을 넘는 곳을 비운다. 임계값이 클수록 cavern이 작고 드물다.
const CHEESE_THRESHOLD = 0.4;
// 노이즈 좌표 배율 = 주파수. 작을수록 cavern이 커진다. y를 더 크게 줘서 cavern을 납작하게 만든다.
const CHEESE_SCALE_XZ = 0.05;
const CHEESE_SCALE_Y = 0.09;
// 치즈 동굴은 지표에서 이 깊이보다 아래에만 만든다 — 지표 근처가 크게 무너지지 않게.
const CHEESE_MIN_DEPTH = 6;

// 스파게티 동굴: 노이즈 두 개가 동시에 0 근처인 곳을 비운다. 폭이 클수록 터널이 굵다.
// 폭은 고정값이 아니라 BASE를 중심으로 굵기 노이즈만큼 오르내린다 — 굵기가 일정하면 하수관처럼 보인다.
const SPAGHETTI_WIDTH_BASE = 0.08;
const SPAGHETTI_WIDTH_VARIATION = 0.08;
// 굵기 노이즈의 주파수. 터널 모양 노이즈보다 낮게 줘서, 한 터널 안에서 굵기가 천천히 변하게 한다.
const SPAGHETTI_THICKNESS_SCALE = 0.012;
// 스케일을 줄이면 터널 전체가 확대된다 — 굵어지는 대신 드물어져서, 폭만 키울 때보다 지하가 덜 빈다.
const SPAGHETTI_SCALE_XZ = 0.02;
const SPAGHETTI_SCALE_Y = 0.035;
// noise3d에는 seed가 없으므로, 좌표를 멀리 밀어서 서로 무관한 노이즈 두 개를 얻는다.
const SPAGHETTI_OFFSET_A = 71.3;
const SPAGHETTI_OFFSET_B = 157.9;
const SPAGHETTI_OFFSET_THICKNESS = 233.7;

// position(3) + normal(3) + uv(2) + ao(1)
export const FLOATS_PER_VERTEX = 9;

/**
 * @description 면의 꼭짓점 하나 — 블록 원점 기준 위치(각 축 0 또는 1)와 면 안의 로컬 UV
 */
interface CornerSpec {
  pos: Vec3;
  uv: [number, number];
}

/**
 * @description 꼭짓점 하나의 AO를 정하는 이웃 칸 세 곳 (블록 기준 상대 좌표)
 *
 * 세 칸 모두 면 바깥 칸(블록 + 법선) 층에 있다. 그 층에서 꼭짓점 쪽으로
 * 접선 축 하나씩 한 칸 간 것이 side1·side2, 두 축 모두 한 칸 간 대각선이 corner다.
 */
interface CornerAO {
  side1: Vec3;
  side2: Vec3;
  corner: Vec3;
}

interface FaceDef {
  dir: Vec3;
  tile: 'top' | 'side' | 'bottom';
  corners: CornerSpec[];
  ao: CornerAO[];
}

/**
 * @description 면 하나의 정의를 만들고, 꼭짓점마다 AO 조회 위치를 미리 계산하는 함수
 *
 * corners는 사각형을 한 바퀴 도는 순서(c0 → c1 → c2 → c3)여야 한다.
 * 삼각형을 (0,1,2)(0,2,3) 또는 (1,2,3)(1,3,0)으로 잘라도 감김 방향이 같아야
 * 대각선을 뒤집어도 back-face culling에 걸리지 않는다.
 *
 * AO 조회 위치는 면과 꼭짓점만으로 정해지므로 정점마다 계산하지 않고 모듈 로드 때 한 번만 만든다.
 */
function defineFace(dir: Vec3, tile: FaceDef['tile'], corners: CornerSpec[]): FaceDef {
  // 법선이 0인 두 축이 면을 따라 뻗는 접선 축이다.
  const [a, b] = [0, 1, 2].filter((axis) => dir[axis] === 0);
  const ao = corners.map(({ pos }) => {
    // 꼭짓점 좌표가 1이면 그 축의 + 쪽, 0이면 - 쪽 이웃을 본다.
    const sa = pos[a] * 2 - 1;
    const sb = pos[b] * 2 - 1;
    const side1: Vec3 = [...dir];
    side1[a] += sa;
    const side2: Vec3 = [...dir];
    side2[b] += sb;
    const corner: Vec3 = [...dir];
    corner[a] += sa;
    corner[b] += sb;
    return { side1, side2, corner };
  });
  return { dir, tile, corners, ao };
}

// atlasUV의 (u, v)는 면 안에서의 로컬 좌표(0~1)로,
// 면을 바깥에서 바라봤을 때 u는 왼쪽→오른쪽, v는 위→아래로 커진다.
// 옆면의 v는 블록 윗변이 0, 아랫변이 1 — 잔디 옆면의 풀이 위쪽에 오게 된다.
// 꼭짓점 순서는 바깥에서 봤을 때 시계 반대 방향(CCW) 삼각형이 나오도록 정했다 — 파이프라인의 front face다.
const FACES: FaceDef[] = [
  // +Y (top)
  defineFace([0, 1, 0], 'top', [
    { pos: [0, 1, 0], uv: [0, 0] },
    { pos: [0, 1, 1], uv: [0, 1] },
    { pos: [1, 1, 1], uv: [1, 1] },
    { pos: [1, 1, 0], uv: [1, 0] },
  ]),
  // -Y (bottom)
  defineFace([0, -1, 0], 'bottom', [
    { pos: [0, 0, 1], uv: [0, 1] },
    { pos: [0, 0, 0], uv: [0, 0] },
    { pos: [1, 0, 0], uv: [1, 0] },
    { pos: [1, 0, 1], uv: [1, 1] },
  ]),
  // +X (right) — 바깥에서 보면 오른쪽이 -Z
  defineFace([1, 0, 0], 'side', [
    { pos: [1, 0, 0], uv: [1, 1] },
    { pos: [1, 1, 0], uv: [1, 0] },
    { pos: [1, 1, 1], uv: [0, 0] },
    { pos: [1, 0, 1], uv: [0, 1] },
  ]),
  // -X (left) — 바깥에서 보면 오른쪽이 +Z
  defineFace([-1, 0, 0], 'side', [
    { pos: [0, 0, 1], uv: [1, 1] },
    { pos: [0, 1, 1], uv: [1, 0] },
    { pos: [0, 1, 0], uv: [0, 0] },
    { pos: [0, 0, 0], uv: [0, 1] },
  ]),
  // +Z (front) — 바깥에서 보면 오른쪽이 +X
  defineFace([0, 0, 1], 'side', [
    { pos: [1, 0, 1], uv: [1, 1] },
    { pos: [1, 1, 1], uv: [1, 0] },
    { pos: [0, 1, 1], uv: [0, 0] },
    { pos: [0, 0, 1], uv: [0, 1] },
  ]),
  // -Z (back) — 바깥에서 보면 오른쪽이 -X
  defineFace([0, 0, -1], 'side', [
    { pos: [0, 0, 0], uv: [1, 1] },
    { pos: [0, 1, 0], uv: [1, 0] },
    { pos: [1, 1, 0], uv: [0, 0] },
    { pos: [1, 0, 0], uv: [0, 1] },
  ]),
];

// 사각형을 삼각형 두 개로 자르는 두 방법. 숫자는 corners의 인덱스다.
const SPLIT_02 = [0, 1, 2, 0, 2, 3]; // 대각선 c0–c2
const SPLIT_13 = [1, 2, 3, 1, 3, 0]; // 대각선 c1–c3

/**
 * @description 꼭짓점 하나의 AO 단계를 구하는 함수 (0 = 가장 어두움, 3 = 가려지지 않음)
 *
 * 옆 칸 두 개가 모두 막혀 있으면 대각선 칸과 상관없이 0이다. 두 옆 칸이 막히면
 * 대각선 칸은 그 사이에 갇혀 보이지 않으므로, 대각선만 비었다고 밝아지면 안 된다.
 */
export function vertexAO(side1: boolean, side2: boolean, corner: boolean): number {
  if (side1 && side2) return 0;
  return 3 - (Number(side1) + Number(side2) + Number(corner));
}

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
 * @description 월드 좌표 (wx, y, wz)가 동굴(파낼 칸)인지 판정하는 함수
 * @param ground 이 기둥의 지형 높이. 지표 위(y >= ground)는 이미 공기라 동굴이 아니다.
 *
 * 좌표와 지형 높이만 보고 답하는 순수 함수다. 블록 배열을 읽지 않으므로, 동굴을 파는
 * 단계든 나무를 심는 단계든 "이 칸이 파이는가"를 생성 순서와 상관없이 물어볼 수 있다.
 *
 * - 치즈: 노이즈 하나가 임계값을 넘는 곳 → 덩어리 모양의 넓은 cavern(지하 빈 공간)
 * - 스파게티: 노이즈 두 개가 동시에 0 근처인 곳 → 가는 터널.
 *   3D에서 노이즈 하나의 "0 근처"는 얇은 판(면)이 되고, 판 두 장이 교차하는 곳이 선(터널)이 된다.
 *
 * 스파게티는 지표까지 뚫을 수 있어 동굴 입구가 된다.
 * 최하단 y = 0은 파지 않아 월드 바닥이 뚫리지 않는다.
 */
function isCave(wx: number, y: number, wz: number, ground: number): boolean {
  if (y < 1 || y >= ground) return false;

  const cheese =
    y < ground - CHEESE_MIN_DEPTH &&
    noise3d(wx * CHEESE_SCALE_XZ, y * CHEESE_SCALE_Y, wz * CHEESE_SCALE_XZ) > CHEESE_THRESHOLD;
  if (cheese) return true;

  // 이 위치의 터널 폭. 굵기 노이즈(대략 -1 ~ 1)만큼 BASE에서 오르내린다.
  const t = SPAGHETTI_THICKNESS_SCALE;
  const width =
    SPAGHETTI_WIDTH_BASE +
    noise3d(wx * t + SPAGHETTI_OFFSET_THICKNESS, y * t, wz * t) * SPAGHETTI_WIDTH_VARIATION;

  const sx = wx * SPAGHETTI_SCALE_XZ;
  const sy = y * SPAGHETTI_SCALE_Y;
  const sz = wz * SPAGHETTI_SCALE_XZ;
  return (
    Math.abs(noise3d(sx + SPAGHETTI_OFFSET_A, sy, sz)) < width &&
    Math.abs(noise3d(sx, sy, sz + SPAGHETTI_OFFSET_B)) < width
  );
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

          for (const face of FACES) {
            const [nx, ny, nz] = face.dir;
            // 맞닿은 칸이 비어 있어야 면이 보인다. 월드 맨 아래(y = -1)는 getBlock이 Air를 돌려줘 그려진다.
            if (!isTransparent(this.getBlock(x + nx, y + ny, z + nz))) continue;

            const ao = face.ao.map(({ side1, side2, corner }) =>
              vertexAO(
                this.occludes(x, y, z, side1),
                this.occludes(x, y, z, side2),
                this.occludes(x, y, z, corner),
              ),
            );

            // 대각선은 AO 합이 작은(더 어두운) 두 꼭짓점을 잇는다. 반대로 자르면 어두운 꼭짓점
            // 하나의 그늘이 삼각형 하나에만 번져 대각선을 따라 꺾인 띠가 생긴다.
            const split = ao[0] + ao[2] > ao[1] + ao[3] ? SPLIT_13 : SPLIT_02;
            const t = tiles[face.tile];

            // 정점 6개로 삼각형 2개를 만들어 사각형 1개를 채운다.
            for (const i of split) {
              const { pos, uv } = face.corners[i];
              verts.push(wx + pos[0], y + pos[1], wz + pos[2], nx, ny, nz, ...atlasUV(t, uv[0], uv[1]), ao[i]);
            }
          }
        }
      }
    }

    const vertices = new Float32Array(verts);
    // verts는 그냥 숫자를 쭉 이어붙인 평평한 배열이라 길이가 "float 개수"지 "정점 개수"가 아니다.
    // 정점 하나의 float 수로 나누어야 실제 정점 수가 나온다.
    return { vertices, vertexCount: verts.length / FLOATS_PER_VERTEX };
  }

  /**
   * @description 블록 (x, y, z)에서 offset만큼 떨어진 칸이 빛을 가리는지 반환하는 함수
   *
   * 청크 밖은 getBlock이 Air로 돌려주므로 청크 경계의 꼭짓점은 덜 어둡게 나온다 (이슈 범위 밖).
   */
  private occludes(x: number, y: number, z: number, offset: Vec3): boolean {
    return !isTransparent(this.getBlock(x + offset[0], y + offset[1], z + offset[2]));
  }

  private idx(x: number, y: number, z: number): number {
    return y * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x;
  }

  /**
   * @description 청크의 블록을 채우는 함수
   *
   * 지형을 채운 뒤 동굴과 나무를 얹는다. 동굴과 나무는 서로가 고친 블록을 읽지 않고
   * 좌표·높이맵·isCave만 보고 판단하므로, 둘의 순서를 바꿔도 결과가 같다.
   * - 동굴은 지표 아래(y < ground)만, 나무는 지표 위(y >= ground)만 건드려 칸이 겹치지 않는다
   * - 나무는 표면이 파이는 자리(isCave)를 직접 물어보고 피한다
   */
  private generate() {
    const heights = this.generateTerrain();
    this.carveCaves(heights);
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
   * @description 땅 속에서 isCave가 참인 칸을 공기로 바꿔 동굴을 만드는 함수
   *
   * 블록마다 그 좌표만 보고 판정하므로 이웃 청크를 볼 필요가 없어,
   * 청크 경계에서도 동굴이 끊김 없이 이어진다.
   */
  private carveCaves(heights: Uint8Array) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = this.cx * CHUNK_SIZE + x;
        const wz = this.cz * CHUNK_SIZE + z;
        const ground = heights[z * CHUNK_SIZE + x];

        // 땅이 있는 칸(y < ground)만 검사한다. 지표 위는 이미 공기라 노이즈 계산을 건너뛴다.
        for (let y = 1; y < ground; y++) {
          if (isCave(wx, y, wz, ground)) this.setBlock(x, y, z, BlockType.Air);
        }
      }
    }
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

        // 블록 배열 대신 지형 규칙과 isCave로 판단한다 — 동굴을 이미 팠는지와 상관없이 같은 답이 나온다.
        const ground = heights[z * CHUNK_SIZE + x];
        if (surfaceBlock(ground) !== BlockType.Grass) continue;
        if (isCave(wx, ground - 1, wz, ground)) continue; // 표면이 파이는 동굴 입구 자리


        const tooClose = planted.some(
          ([px, pz]) => Math.max(Math.abs(px - x), Math.abs(pz - z)) < TREE_MIN_GAP,
        );
        if (tooClose) continue;

        const trunk =
          TREE_MIN_TRUNK +
          Math.floor(hash2d(wx, wz, SEED_TREE_HEIGHT) * (TREE_MAX_TRUNK - TREE_MIN_TRUNK + 1));
        // 잎 꼭대기(기둥 맨 위 + 1)가 월드 높이를 넘으면 심지 않는다.
        if (ground + trunk >= WORLD_HEIGHT) continue;

        this.placeTree(x, ground, z, trunk, heights);
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
  private placeTree(x: number, ground: number, z: number, trunk: number, heights: Uint8Array) {
    const top = ground + trunk - 1;

    for (let y = ground; y <= top; y++) {
      this.setBlock(x, y, z, BlockType.Wood);
    }

    this.placeLeafLayer(x, top - 2, z, LEAF_RADIUS, true, heights); // 5×5, 모서리 제외
    this.placeLeafLayer(x, top - 1, z, LEAF_RADIUS, true, heights); // 5×5, 모서리 제외
    this.placeLeafLayer(x, top, z, 1, false, heights); // 3×3
    this.placeLeafLayer(x, top + 1, z, 1, true, heights); // + 모양
  }

  /**
   * @description (x, z)를 중심으로 높이 y에 한 변이 2 * radius + 1인 정사각형 잎 층을 까는 함수
   * @param cutCorners true면 네 모서리 칸을 비운다
   * @param heights 기둥별 지형 높이. 잎이 지형 속으로 들어가지 않게 막는 데 쓴다.
   */
  private placeLeafLayer(
    x: number,
    y: number,
    z: number,
    radius: number,
    cutCorners: boolean,
    heights: Uint8Array,
  ) {
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (cutCorners && Math.abs(dx) === radius && Math.abs(dz) === radius) continue;
        // 지형 높이 아래는 잎을 두지 않는다. 블록이 Air인지만 보면, 옆 언덕 속 동굴이
        // 이미 파였을 때(동굴 → 나무 순서) 그 빈 칸에 잎이 박혀 생성 순서에 따라 결과가 달라진다.
        if (y < heights[(z + dz) * CHUNK_SIZE + (x + dx)]) continue;
        // 기둥이나 다른 나무의 잎을 덮어쓰지 않고 빈 칸만 잎으로 채운다.
        if (this.getBlock(x + dx, y, z + dz) !== BlockType.Air) continue;
        this.setBlock(x + dx, y, z + dz, BlockType.Leaves);
      }
    }
  }
}
