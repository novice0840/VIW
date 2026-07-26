import { isSolid } from './block';
import { World } from './world';
import type { Vec3 } from './math';

export interface RaycastHit {
  // 광선이 처음 맞춘 블록의 정수 좌표
  block: [number, number, number];
  // 맞은 면의 법선 (파괴 대상 = block, 설치 위치 = block + normal)
  normal: [number, number, number];
}

/**
 * @description DDA(Amanatides & Woo voxel traversal)로 광선이 처음 맞는 블록을 찾는 함수
 *
 * 광선을 P(t) = origin + t * dir 로 표현했을 때(t = 진행 거리),
 * 고정 간격으로 전진하는 대신 "격자선을 넘는 지점"으로만 점프한다.
 * 광선이 지나는 칸을 순서대로 전부 방문하므로 얇은 모서리를 건너뛰는 일이 없다.
 *
 * 축마다 두 값만 관리하면 된다:
 * - tMax:   다음 격자선을 넘는 시점 t
 * - tDelta: 격자 한 칸을 건너는 데 걸리는 t (고정값, |1 / dir|)
 * 매 스텝 tMax가 가장 작은 축(다음 격자선이 가장 가까운 축)으로 한 칸 이동한다.
 */
export function raycast(
  world: World,
  origin: Vec3,
  dir: Vec3,
  maxDistance: number,
): RaycastHit | null {
  // 현재 광선이 들어있는 복셀(블록 칸)
  let bx = Math.floor(origin[0]);
  let by = Math.floor(origin[1]);
  let bz = Math.floor(origin[2]);

  // 각 축의 진행 방향 (+1 / -1, dir 성분이 0이면 0)
  const stepX = Math.sign(dir[0]);
  const stepY = Math.sign(dir[1]);
  const stepZ = Math.sign(dir[2]);

  // dir 성분이 0이면 Infinity가 되어 그 축은 영원히 선택되지 않는다
  const tDeltaX = Math.abs(1 / dir[0]);
  const tDeltaY = Math.abs(1 / dir[1]);
  const tDeltaZ = Math.abs(1 / dir[2]);

  let tMaxX = initialTMax(origin[0], dir[0]);
  let tMaxY = initialTMax(origin[1], dir[1]);
  let tMaxZ = initialTMax(origin[2], dir[2]);

  let t = 0;
  while (t <= maxDistance) {
    // 다음 격자선이 가장 가까운 축으로 한 칸 이동
    // 이동한 축의 반대 방향이 곧 "들어간 면"의 법선이 된다
    let nx = 0;
    let ny = 0;
    let nz = 0;

    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      bx += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
      nx = -stepX;
    } else if (tMaxY < tMaxZ) {
      by += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      ny = -stepY;
    } else {
      bz += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      nz = -stepZ;
    }

    if (t > maxDistance) return null;

    if (isSolid(world.getBlock(bx, by, bz))) {
      return { block: [bx, by, bz], normal: [nx, ny, nz] };
    }
  }

  return null;
}

/**
 * @description 시작 위치에서 해당 축의 첫 격자 경계까지의 t를 구하는 함수
 * 양의 방향이면 다음 정수까지, 음의 방향이면 이전 정수까지의 거리를 dir로 나눈다.
 */
function initialTMax(p: number, d: number): number {
  if (d > 0) return (Math.floor(p) + 1 - p) / d;
  if (d < 0) return (p - Math.floor(p)) / -d;
  return Infinity;
}
