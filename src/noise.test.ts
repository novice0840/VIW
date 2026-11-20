import { describe, expect, it } from 'vitest';
import { Noise } from './noise';
import { Chunk } from './chunk';

describe('Noise', () => {
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
    const a = Chunk.generate(3, -2, new Noise(42));
    const b = Chunk.generate(3, -2, new Noise(42));
    expect(a.blocks).toEqual(b.blocks);
  });

  it('시드가 다르면 블록이 달라진다', () => {
    const a = Chunk.generate(0, 0, new Noise(42));
    const b = Chunk.generate(0, 0, new Noise(43));
    expect(a.blocks).not.toEqual(b.blocks);
  });
});
