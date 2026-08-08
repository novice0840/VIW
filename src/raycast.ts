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
  // 축별 상태를 [X, Y, Z] 배열로 묶는다.
  // 매 스텝 "가장 가까운 축"을 골라 그 인덱스로만 접근하므로 축마다 분기할 필요가 없다.

  // 현재 광선이 들어있는 복셀(블록 칸)
  const block: Vec3 = [Math.floor(origin[0]), Math.floor(origin[1]), Math.floor(origin[2])];

  // Math.sign(x): 숫자의 부호만 뽑아내는 함수
  const step: Vec3 = [Math.sign(dir[0]), Math.sign(dir[1]), Math.sign(dir[2])];

  // dir 성분이 0이면 Infinity가 되어 그 축은 영원히 선택되지 않는다
  // tDelta[i] i축 격자 한 칸 건너는 시간
  const tDelta: Vec3 = [Math.abs(1 / dir[0]), Math.abs(1 / dir[1]), Math.abs(1 / dir[2])];

  // tMax 초기값
  // 지금 칸을 벗어나 첫 격자선을 넘는 순간의 t
  // 예) tMax = [1.1667, Infinity, 1.0]
  // -> X는 다음 칸을 넘기까지 1.1667 만큼의 시간이 소요된다
  const tMax: Vec3 = [
    initialTMax(origin[0], dir[0]),
    initialTMax(origin[1], dir[1]),
    initialTMax(origin[2], dir[2]),
  ];

  let t = 0;
  while (t <= maxDistance) {
    // 다음 격자선이 가장 가까운 축으로 한 칸 이동
    const axis = nearestAxis(tMax);
    block[axis] += step[axis];
    t = tMax[axis];
    tMax[axis] += tDelta[axis];

    if (t > maxDistance) return null;

    if (isSolid(world.getBlock(block[0], block[1], block[2]))) {
      // 이동한 축의 반대 방향이 곧 "들어간 면"의 법선이 된다
      const normal: Vec3 = [0, 0, 0];
      normal[axis] = -step[axis];
      return { block: [block[0], block[1], block[2]], normal };
    }
  }

  return null;
}

/**
 * @description tMax가 가장 작은 축, 즉 다음 격자선이 가장 가까운 축을 고르는 함수
 * @returns 0 = X, 1 = Y, 2 = Z
 *
 * 광선이 격자의 모서리를 정확히 지나 값이 동점이면 뒤쪽 축이 선택된다.
 * 어느 쪽을 골라도 지나는 칸을 빠짐없이 방문하므로 결과는 달라지지 않는다.
 */
function nearestAxis(tMax: Vec3): 0 | 1 | 2 {
  if (tMax[0] < tMax[1] && tMax[0] < tMax[2]) return 0;
  return tMax[1] < tMax[2] ? 1 : 2;
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
