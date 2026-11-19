// 지형 생성용 Perlin 노이즈 (improved Perlin noise 기반)

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
 * @description 시드 하나로 [0, 1) 난수를 차례로 뽑는 의사난수 생성기 (mulberry32)
 *
 * Math.random()은 시드를 줄 수 없어서, 같은 시드로 같은 월드를 다시 만들 수 없다.
 * 이 함수는 상태가 32비트 정수 하나뿐이라 같은 시드면 항상 같은 수열이 나온다.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @description 정수 좌표 (x, z)를 [0, 1) 범위의 의사난수로 바꾸는 함수
 *
 * 같은 입력에는 항상 같은 값을 돌려준다 — 청크를 언제 어떤 순서로 생성해도
 * 결과가 같아야 하므로 Math.random() 대신 이걸 쓴다.
 * Perlin 노이즈와 달리 이웃 좌표끼리 값이 전혀 닮지 않는다 (매끄러움이 없는 "흩뿌리기"용).
 *
 * seed를 바꾸면 같은 좌표에서 서로 독립적인 값을 여러 개 뽑을 수 있다.
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

/**
 * @description 월드 시드 하나로 만든 노이즈 묶음 — 한 월드의 지형은 모두 이 인스턴스에서 나온다
 *
 * Perlin 노이즈의 모양은 순열표(0–255를 섞은 표)가 정한다. 격자 꼭짓점마다 이 표로
 * 기울기 방향을 고르기 때문에, 표를 다르게 섞으면 같은 좌표에서도 전혀 다른 지형이 나온다.
 * 그래서 시드로 순열표를 섞는 것만으로 월드마다 다른 지형을 얻는다.
 *
 * 좌표와 시드만 보고 답하는 순수한 계산이라 브라우저 API에 의존하지 않는다 —
 * 나중에 서버에서 같은 시드로 같은 지형을 만들 수 있다.
 */
export class Noise {
  // 순열표를 두 번 이어 붙인 512칸. P[P[xi] + yi]처럼 더한 인덱스가 255를 넘어도 % 없이 읽을 수 있다.
  private readonly p = new Uint8Array(512);

  constructor(readonly seed: number) {
    const perm = Array.from({ length: 256 }, (_, i) => i);
    const random = mulberry32(seed);
    // Fisher–Yates 셔플: 뒤에서부터 남은 칸 중 하나와 자리를 바꾼다. 모든 순열이 같은 확률로 나온다.
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    for (let i = 0; i < 256; i++) {
      this.p[i] = perm[i];
      this.p[256 + i] = perm[i];
    }
  }

  noise2d(x: number, y: number): number {
    const P = this.p;
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
   * @description 3D Perlin 노이즈. 대략 -1 ~ 1 사이 값을 매끄럽게 돌려준다
   *
   * noise2d와 원리는 같고 축이 하나 늘었다 — 점을 둘러싼 격자 꼭짓점이 4개에서 8개가 되고,
   * 보간도 x → y 두 번에서 x → y → z 세 번이 된다.
   */
  noise3d(x: number, y: number, z: number): number {
    const P = this.p;
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

  fbm(x: number, y: number, octaves: number, lacunarity: number, gain: number): number {
    let sum = 0;
    let amp = 1;
    let freq = 1;
    let max = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise2d(x * freq, y * freq) * amp;
      max += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / max;
  }

  /**
   * @description 이 월드에서 정수 좌표 (x, z)의 [0, 1) 의사난수를 뽑는 함수
   * @param channel 같은 좌표에서 서로 독립적인 값을 여러 개 뽑기 위한 번호 (배치 여부, 높이 등)
   *
   * 월드 시드와 channel을 섞어 hash2d의 seed로 쓴다. 섞지 않고 channel만 넘기면
   * 지형은 월드마다 달라도 나무 배치 패턴은 모든 월드에서 같아진다.
   */
  hash2d(x: number, z: number, channel: number): number {
    return hash2d(x, z, this.seed ^ Math.imul(channel, 0x632be5ab));
  }
}
