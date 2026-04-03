// Permutation table (Ken Perlin의 원본 테이블)
const PERM = [
  151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103, 30, 69, 142,
  8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203,
  117, 35, 11, 32, 57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165,
  71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211, 133, 230, 220, 105, 92,
  41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208,
  89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64, 52, 217,
  226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16, 58,
  17, 182, 189, 28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155,
  167, 43, 172, 9, 129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218,
  246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241, 81, 51, 145, 235, 249, 14,
  239, 107, 49, 192, 214, 31, 181, 199, 106, 157, 184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150,
  254, 138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180,
];

const P = new Uint8Array(512);
for (let i = 0; i < 256; i++) {
  P[i] = PERM[i];
  P[256 + i] = PERM[i];
}

// 원래 Perlin fade: 3t² - 2t³
export function fadeOriginal(t: number): number {
  return t * t * (3 - 2 * t);
}

// Improved Perlin fade: 6t⁵ - 15t⁴ + 10t³
export function fadeImproved(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * @description 선형 보간 함수, 0이면 a, 0.5면 a와 b의 중간, 1이면 b를 반환한다.
 * @param a
 * @param b
 * @param t
 * @returns
 */
function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

// 2D gradient: 4방향 중 하나 선택
export function grad2d(hash: number, x: number, y: number): number {
  // h = 0 ~ 3
  const h = hash & 3;
  const u = h < 2 ? x : -x;
  const v = h === 0 || h === 3 ? y : -y;
  return u + v;
}

// 1D gradient
// 1D gradient: hash의 최하위 비트로 방향(+/-) 결정 후 거리 x와의 내적 반환
// (hash & 1) === 0 → +x (오른쪽 방향), 1 → -x (왼쪽 방향)
function grad1d(hash: number, x: number): number {
  return (hash & 1) === 0 ? x : -x;
}

// 격자점의 gradient 벡터 방향을 반환 (시각화용)
export function getGradientDir(ix: number, iy: number): [number, number] {
  // & 255 -> 하위 8비트만 남기고 나머지를 전부 0으로 만드는 기능
  const h = P[P[ix & 255] + (iy & 255)] & 3;
  const dirs: [number, number][] = [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ];
  return dirs[h];
}

// 1D Perlin noise (fade 함수를 선택 가능)
export function noise1d(x: number, fade: (t: number) => number): number {
  const xi = Math.floor(x) & 255; // 소수점 버림 후 하위 8비트만 남겨 0~255 범위로 제한
  const xf = x - Math.floor(x); // 격자 간격은 1, xf는 왼쪽 격자점까지의 거리 (0~1)
  const u = fade(xf);
  // xf-1은 오른쪽 격자점까지의 거리 (-1~0)
  return lerp(grad1d(P[xi], xf), grad1d(P[xi + 1], xf - 1), u);
}

// 2D Perlin noise (fade 함수를 선택 가능)
export function noise2d(x: number, y: number, fade: (t: number) => number = fadeImproved): number {
  const xi = Math.floor(x) & 255; // 소수점 버림 후 하위 8비트만 남겨 0~255 범위로 제한
  const yi = Math.floor(y) & 255; // 소수점 버림 후 하위 8비트만 남겨 0~255 범위로 제한
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);

  const u = fade(xf);
  const v = fade(yf);

  const aa = P[P[xi] + yi];
  const ab = P[P[xi] + yi + 1];
  const ba = P[P[xi + 1] + yi];
  const bb = P[P[xi + 1] + yi + 1];

  return lerp(
    lerp(grad2d(aa, xf, yf), grad2d(ba, xf - 1, yf), u),
    lerp(grad2d(ab, xf, yf - 1), grad2d(bb, xf - 1, yf - 1), u),
    v,
  );
}

// fBm (Fractal Brownian Motion)
export function fbm(
  x: number,
  y: number,
  octaves: number,
  lacunarity: number,
  gain: number,
): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let max = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise2d(x * freq, y * freq) * amp;
    max += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / max;
}
