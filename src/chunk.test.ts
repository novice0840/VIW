import { describe, expect, it } from 'vitest';
import { vertexAO } from './chunk';

describe('vertexAO', () => {
  // 옆 두 칸이 막히면 대각선 칸과 꼭짓점 사이에 빛이 지나갈 틈이 없다.
  // 단순 공식 3 − (막힌 칸 수)만 쓰면 대각선이 빈 경우 1이 나와 구석이 밝게 뜬다.
  it('옆 두 칸이 막히면 대각선 칸과 상관없이 0이다', () => {
    expect(vertexAO(true, true, false)).toBe(0);
    expect(vertexAO(true, true, true)).toBe(0);
  });
});
