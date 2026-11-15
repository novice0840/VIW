import { describe, expect, it } from 'vitest';
import { Noise } from './noise';
import { Chunk } from './chunk';

// 정수 격자점에서는 Perlin 노이즈가 항상 0이라 비교가 무의미하다. 격자 사이 좌표를 쓴다.
const SAMPLES: [number, number, number][] = [
  [0.5, 0.3, 0.7],
  [12.25, 3.5, -7.75],
  [-40.1, 17.9, 88.3],
];

describe('Noise', () => {
  it('같은 시드는 같은 값을 낸다', () => {
    const a = new Noise(1234);
    const b = new Noise(1234);
    for (const [x, y, z] of SAMPLES) {
      expect(a.noise3d(x, y, z)).toBe(b.noise3d(x, y, z));
      expect(a.fbm(x, z, 5, 2, 0.5)).toBe(b.fbm(x, z, 5, 2, 0.5));
    }
  });

  it('다른 시드는 다른 값을 낸다', () => {
    const a = new Noise(1);
    const b = new Noise(2);
    const differs = SAMPLES.some(([x, y, z]) => a.noise3d(x, y, z) !== b.noise3d(x, y, z));
    expect(differs).toBe(true);
  });

  // 나무 배치가 월드마다 달라지려면 해시에도 월드 시드가 섞여야 한다.
  it('hash2d도 시드에 따라 달라진다', () => {
    const a = new Noise(1);
    const b = new Noise(2);
    expect(a.hash2d(10, 20, 1)).toBe(new Noise(1).hash2d(10, 20, 1));
    expect(a.hash2d(10, 20, 1)).not.toBe(b.hash2d(10, 20, 1));
  });

  it('같은 시드 안에서 channel이 다르면 독립적인 값을 낸다', () => {
    const n = new Noise(1);
    expect(n.hash2d(10, 20, 1)).not.toBe(n.hash2d(10, 20, 2));
  });
});

describe('Chunk 생성', () => {
  it('같은 시드와 좌표면 블록이 똑같다', () => {
    const a = new Chunk(3, -2, new Noise(42));
    const b = new Chunk(3, -2, new Noise(42));
    expect(a.blocks).toEqual(b.blocks);
  });

  it('시드가 다르면 블록이 달라진다', () => {
    const a = new Chunk(0, 0, new Noise(42));
    const b = new Chunk(0, 0, new Noise(43));
    expect(a.blocks).not.toEqual(b.blocks);
  });
});
