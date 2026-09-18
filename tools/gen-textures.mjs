// 16x16 블록 텍스처 타일 + 4x4 아틀라스(64x64) 생성기
// 의존성 없음 — Node 내장 zlib으로 PNG를 직접 인코딩한다.
//
//   node tools/gen-textures.mjs public/textures
//
// 색이나 패턴을 바꾸고 싶으면 아래 타일 함수를 고치고 다시 돌린다.
// 픽셀을 직접 찍는 것보다 빠르고, 어떤 색을 썼는지가 코드로 남는다.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const TILE = 16;
const GRID = 4;
const OUT = process.argv[2];
if (!OUT) throw new Error('usage: node gen-textures.mjs <outDir>');

// ---------- PNG 인코딩 ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** rgba: Uint8Array(w*h*4) -> PNG Buffer */
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const o = y * (1 + w * 4);
    raw[o] = 0; // filter: None
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, o + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 그리기 헬퍼 ----------
function mulberry32(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

class Tile {
  constructor() {
    this.px = new Uint8Array(TILE * TILE * 4);
  }
  set(x, y, r, g, b) {
    const i = (y * TILE + x) * 4;
    this.px[i] = clamp(r);
    this.px[i + 1] = clamp(g);
    this.px[i + 2] = clamp(b);
    this.px[i + 3] = 255;
  }
}

/** base 색에 픽셀마다 밝기 흔들림을 준다 */
function speckle(tile, rand, base, amp, tint = [1, 1, 1]) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const d = (rand() * 2 - 1) * amp;
      tile.set(x, y, base[0] + d * tint[0], base[1] + d * tint[1], base[2] + d * tint[2]);
    }
  }
}

// ---------- 타일 정의 ----------
const DIRT = [134, 92, 60];
const GRASS = [94, 158, 52];
const STONE = [128, 128, 128];
const SAND = [219, 208, 158];
const WOOD_BARK = [110, 76, 40];
const WOOD_CORE = [166, 128, 78];
const LEAVES = [54, 122, 40];
const SNOW = [240, 241, 246];

function dirt(rand) {
  const t = new Tile();
  speckle(t, rand, DIRT, 20);
  // 자갈처럼 어두운 점 몇 개
  for (let i = 0; i < 22; i++) {
    const x = (rand() * TILE) | 0;
    const y = (rand() * TILE) | 0;
    t.set(x, y, DIRT[0] - 34, DIRT[1] - 26, DIRT[2] - 18);
  }
  return t;
}

function grassTop(rand) {
  const t = new Tile();
  speckle(t, rand, GRASS, 24, [0.7, 1, 0.5]);
  for (let i = 0; i < 18; i++) {
    const x = (rand() * TILE) | 0;
    const y = (rand() * TILE) | 0;
    t.set(x, y, GRASS[0] - 26, GRASS[1] - 34, GRASS[2] - 16);
  }
  return t;
}

function grassSide(rand) {
  const t = dirt(rand);
  // v=0(맨 윗줄)이 블록의 위쪽이 되도록 위에서부터 잔디를 덮는다
  for (let x = 0; x < TILE; x++) {
    const h = 3 + ((rand() * 3) | 0); // 3~5픽셀, 들쭉날쭉한 경계
    for (let y = 0; y < h; y++) {
      const d = (rand() * 2 - 1) * 22;
      t.set(x, y, GRASS[0] + d * 0.7, GRASS[1] + d, GRASS[2] + d * 0.5);
    }
    if (rand() < 0.45) {
      const d = (rand() * 2 - 1) * 16;
      t.set(x, h, GRASS[0] + d * 0.7 - 10, GRASS[1] + d - 12, GRASS[2] + d * 0.5 - 6);
    }
  }
  return t;
}

function stone(rand) {
  const t = new Tile();
  speckle(t, rand, STONE, 22);
  // 짧은 균열 — 무작위 걸음
  for (let c = 0; c < 4; c++) {
    let x = (rand() * TILE) | 0;
    let y = (rand() * TILE) | 0;
    const len = 4 + ((rand() * 5) | 0);
    for (let i = 0; i < len; i++) {
      t.set(x, y, STONE[0] - 40, STONE[1] - 40, STONE[2] - 38);
      x = (x + ((rand() * 3) | 0) - 1 + TILE) % TILE;
      y = (y + ((rand() * 3) | 0) - 1 + TILE) % TILE;
    }
  }
  return t;
}

function sand(rand) {
  const t = new Tile();
  speckle(t, rand, SAND, 12);
  for (let i = 0; i < 16; i++) {
    const x = (rand() * TILE) | 0;
    const y = (rand() * TILE) | 0;
    t.set(x, y, SAND[0] + 16, SAND[1] + 14, SAND[2] + 12);
  }
  return t;
}

function woodTop(rand) {
  const t = new Tile();
  const c = 7.5;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const d = Math.hypot(x - c, y - c);
      const ring = Math.floor(d / 1.7) % 2;
      const base = ring === 0 ? WOOD_CORE : WOOD_BARK;
      const n = (rand() * 2 - 1) * 10;
      if (d > 6.6) t.set(x, y, WOOD_BARK[0] - 22 + n, WOOD_BARK[1] - 16 + n, WOOD_BARK[2] - 10 + n);
      else t.set(x, y, base[0] + n, base[1] + n, base[2] + n);
    }
  }
  t.set(7, 7, WOOD_BARK[0] - 34, WOOD_BARK[1] - 26, WOOD_BARK[2] - 16);
  t.set(8, 8, WOOD_BARK[0] - 34, WOOD_BARK[1] - 26, WOOD_BARK[2] - 16);
  return t;
}

function woodSide(rand) {
  const t = new Tile();
  // 세로 결 — 열마다 기준 밝기를 정하고 픽셀마다 살짝 흔든다
  const colShade = [];
  for (let x = 0; x < TILE; x++) colShade.push((rand() * 2 - 1) * 18);
  for (let x = 0; x < TILE; x++) {
    const dark = rand() < 0.22 ? -24 : 0; // 굵은 세로 줄
    for (let y = 0; y < TILE; y++) {
      const n = (rand() * 2 - 1) * 8 + colShade[x] + dark;
      t.set(x, y, WOOD_BARK[0] + n, WOOD_BARK[1] + n * 0.85, WOOD_BARK[2] + n * 0.7);
    }
  }
  return t;
}

function leaves(rand) {
  const t = new Tile();
  speckle(t, rand, LEAVES, 26, [0.8, 1, 0.6]);
  // 잎 사이 틈처럼 보이도록 어두운 구멍 — Grass와 한눈에 구분되도록 크게 판다
  for (let i = 0; i < 16; i++) {
    const x = (rand() * TILE) | 0;
    const y = (rand() * TILE) | 0;
    const size = rand() < 0.4 ? 2 : 1;
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        t.set((x + dx) % TILE, (y + dy) % TILE, 18, 42, 16);
      }
    }
  }
  // 밝은 잎끝 하이라이트
  for (let i = 0; i < 14; i++) {
    const x = (rand() * TILE) | 0;
    const y = (rand() * TILE) | 0;
    t.set(x, y, LEAVES[0] + 40, LEAVES[1] + 52, LEAVES[2] + 30);
  }
  return t;
}

function snow(rand) {
  const t = new Tile();
  speckle(t, rand, SNOW, 9, [0.8, 0.9, 1]);
  return t;
}

/** 빈 슬롯 — UV가 틀리면 눈에 확 띄도록 마젠타 체커 */
function missing() {
  const t = new Tile();
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const on = ((x >> 3) + (y >> 3)) % 2 === 0;
      if (on) t.set(x, y, 255, 0, 220);
      else t.set(x, y, 24, 24, 24);
    }
  }
  return t;
}

// 아틀라스 배치: index = row * 4 + col
// 이 순서가 곧 block.ts의 타일 인덱스이므로 함부로 바꾸지 않는다.
const LAYOUT = [
  ['grass_top', grassTop, 1],
  ['grass_side', grassSide, 2],
  ['dirt', dirt, 3],
  ['stone', stone, 4],
  ['sand', sand, 5],
  ['wood_top', woodTop, 6],
  ['wood_side', woodSide, 7],
  ['leaves', leaves, 8],
  ['snow', snow, 9],
];

mkdirSync(OUT, { recursive: true });

const atlasW = TILE * GRID;
const atlas = new Uint8Array(atlasW * atlasW * 4);

function blit(tile, col, row) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const s = (y * TILE + x) * 4;
      const d = ((row * TILE + y) * atlasW + (col * TILE + x)) * 4;
      atlas[d] = tile.px[s];
      atlas[d + 1] = tile.px[s + 1];
      atlas[d + 2] = tile.px[s + 2];
      atlas[d + 3] = tile.px[s + 3];
    }
  }
}

for (let i = 0; i < GRID * GRID; i++) {
  const col = i % GRID;
  const row = (i / GRID) | 0;
  // LAYOUT에 없는 슬롯은 마젠타 체커로 채운다 — UV가 틀리면 화면에서 바로 튄다
  const tile = i < LAYOUT.length ? LAYOUT[i][1](mulberry32(LAYOUT[i][2] * 7919)) : missing();
  blit(tile, col, row);
}

writeFileSync(join(OUT, 'atlas.png'), encodePNG(atlasW, atlasW, atlas));
console.log(`atlas ${atlasW}x${atlasW} (${LAYOUT.length} tiles) -> ${join(OUT, 'atlas.png')}`);
