// Simplex-like 2D noise for terrain generation
// Based on improved Perlin noise

const P = new Uint8Array(512);
const PERM = [
  151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,
  8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,
  117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,
  165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,
  105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,
  187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,
  64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,
  227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,
  221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,
  178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,
  241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,
  176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,
  128,195,78,66,215,61,156,180,
];
for (let i = 0; i < 256; i++) {
  P[i] = PERM[i];
  P[256 + i] = PERM[i];
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

function grad2d(hash: number, x: number, y: number): number {
  const h = hash & 3;
  const u = h < 2 ? x : -x;
  const v = h === 0 || h === 3 ? y : -y;
  return u + v;
}

export function noise2d(x: number, y: number): number {
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;
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

/**
 * @description 3D 격자 꼭짓점의 기울기 벡터와 거리 벡터 (x, y, z)의 내적
 *
 * hash 하위 4비트로 정육면체 모서리 방향 12개(일부 중복해 16개) 중 하나를 고른다.
 * 2D의 grad2d가 대각 방향 4개를 쓰는 것과 같은 역할이다.
 */
function grad3d(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

/**
 * @description 3D Perlin 노이즈. 대략 -1 ~ 1 사이 값을 매끄럽게 돌려준다
 *
 * noise2d와 원리는 같고 축이 하나 늘었다 — 점을 둘러싼 격자 꼭짓점이 4개에서 8개가 되고,
 * 보간도 x → y 두 번에서 x → y → z 세 번이 된다.
 */
export function noise3d(x: number, y: number, z: number): number {
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;
  const zi = Math.floor(z) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const zf = z - Math.floor(z);

  const u = fade(xf);
  const v = fade(yf);
  const w = fade(zf);

  // 꼭짓점 8개의 해시. 이름의 세 글자는 각각 x, y, z 쪽에서 a = 작은 쪽, b = 큰 쪽.
  const aaa = P[P[P[xi] + yi] + zi];
  const aba = P[P[P[xi] + yi + 1] + zi];
  const aab = P[P[P[xi] + yi] + zi + 1];
  const abb = P[P[P[xi] + yi + 1] + zi + 1];
  const baa = P[P[P[xi + 1] + yi] + zi];
  const bba = P[P[P[xi + 1] + yi + 1] + zi];
  const bab = P[P[P[xi + 1] + yi] + zi + 1];
  const bbb = P[P[P[xi + 1] + yi + 1] + zi + 1];

  // x 방향으로 4쌍을 보간 → y 방향으로 2쌍 → z 방향으로 1쌍
  const x1 = lerp(grad3d(aaa, xf, yf, zf), grad3d(baa, xf - 1, yf, zf), u);
  const x2 = lerp(grad3d(aba, xf, yf - 1, zf), grad3d(bba, xf - 1, yf - 1, zf), u);
  const x3 = lerp(grad3d(aab, xf, yf, zf - 1), grad3d(bab, xf - 1, yf, zf - 1), u);
  const x4 = lerp(grad3d(abb, xf, yf - 1, zf - 1), grad3d(bbb, xf - 1, yf - 1, zf - 1), u);

  return lerp(lerp(x1, x2, v), lerp(x3, x4, v), w);
}

/**
 * @description 정수 좌표 (x, z)를 [0, 1) 범위의 의사난수로 바꾸는 함수
 *
 * 같은 입력에는 항상 같은 값을 돌려준다 — 청크를 언제 어떤 순서로 생성해도
 * 결과가 같아야 하므로 Math.random() 대신 이걸 쓴다.
 * noise2d와 달리 이웃 좌표끼리 값이 전혀 닮지 않는다 (매끄러움이 없는 "흩뿌리기"용).
 *
 * seed를 바꾸면 같은 좌표에서 서로 독립적인 값을 여러 개 뽑을 수 있다 (배치 여부, 높이 등).
 */
export function hash2d(x: number, z: number, seed = 0): number {
  // 좌표마다 다른 큰 홀수를 곱해 섞은 뒤, murmur3의 finalizer로 비트를 골고루 흩뜨린다.
  // 곱셈만 하고 끝내면 인접 좌표의 하위 비트가 비슷하게 남아 줄무늬 패턴이 생긴다.
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(z, 0x165667b1) ^ Math.imul(seed, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  // >>> 0 으로 부호 없는 32비트로 바꾼 뒤 2^32로 나눠 [0, 1)로 만든다.
  return (h >>> 0) / 4294967296;
}

export function fbm(x: number, y: number, octaves: number, lacunarity: number, gain: number): number {
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
