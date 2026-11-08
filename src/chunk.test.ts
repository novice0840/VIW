import { describe, expect, it } from 'vitest';
import { BlockType } from './block';
import { Chunk, FLOATS_PER_VERTEX } from './chunk';

// buildMesh가 정점마다 넣는 값의 순서: 위치 3, 법선 3, uv 2, ao 1
const POS = 0;
const NORMAL = 3;
const AO = 8;

/**
 * @description 지형 생성 결과를 지우고 y=10 평평한 바닥만 깐 청크를 만든다.
 * 생성기가 바뀌어도 테스트가 흔들리지 않도록 배치를 손으로 정한다.
 */
function flatFloorChunk(): Chunk {
  const chunk = new Chunk(0, 0);
  chunk.blocks.fill(BlockType.Air);
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) chunk.setBlock(x, 10, z, BlockType.Stone);
  }
  return chunk;
}

/**
 * @description 위쪽을 향한 면(윗면)의 정점 중 위치가 (x, y, z)인 것들의 AO 값을 모은다.
 * 한 꼭짓점은 여러 윗면 사각형이 공유하므로 값이 여러 개 나올 수 있다.
 */
function topFaceAOAt(chunk: Chunk, x: number, y: number, z: number): number[] {
  const { vertices: v, vertexCount } = chunk.buildMesh();
  const values = new Set<number>();
  for (let i = 0; i < vertexCount; i++) {
    const o = i * FLOATS_PER_VERTEX;
    const isTopFace = v[o + NORMAL + 1] === 1;
    const isHere = v[o + POS] === x && v[o + POS + 1] === y && v[o + POS + 2] === z;
    if (isTopFace && isHere) values.add(v[o + AO]);
  }
  return [...values];
}

describe('정점 AO', () => {
  // 바닥 윗면의 꼭짓점 (5, 11, 5)을 위에서 본 그림 (y=11 층)
  //
  //   z=5 | (4,11,5) side | (5,11,5) 면 위 |
  //   z=4 | (4,11,4) 대각 | (5,11,4) side  |
  //          x=4             x=5
  //
  // 옆 두 칸이 막히면 대각선 칸과 V 사이에 빛이 지나갈 틈이 없다.
  // 그래서 대각선 칸이 비었든 찼든 결과는 똑같이 0이어야 한다.
  // 단순 공식 3 − (막힌 칸 수)만 쓰면 대각선이 빈 경우 1이 나와 구석이 밝게 뜬다.
  //
  // 이름의 $corner 바로 뒤에 한글을 붙이면 한글까지 변수 이름으로 읽혀 undefined가 된다 — 괄호로 띄운다.
  it.each([
    { corner: '비어 있음', fillCorner: false },
    { corner: '막혀 있음', fillCorner: true },
  ])('옆 두 칸이 막히면 0이다 (대각선 칸: $corner)', ({ fillCorner }) => {
    const chunk = flatFloorChunk();
    chunk.setBlock(4, 11, 5, BlockType.Stone);
    chunk.setBlock(5, 11, 4, BlockType.Stone);
    if (fillCorner) chunk.setBlock(4, 11, 4, BlockType.Stone);

    expect(topFaceAOAt(chunk, 5, 11, 5)).toEqual([0]);
  });
});
