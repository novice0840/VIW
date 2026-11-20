import { describe, expect, it } from 'vitest';
import { CHUNK_VOLUME } from './chunk';
import { decodeChunk, encodeChunk } from './chunkCodec';

function sampleBlocks(): Uint8Array {
  const blocks = new Uint8Array(CHUNK_VOLUME);
  for (let i = 0; i < blocks.length; i++) blocks[i] = i % 8;
  return blocks;
}

describe('chunkCodec', () => {
  it('인코딩한 바이트를 디코딩하면 원래 블록이 나온다', () => {
    const blocks = sampleBlocks();
    expect(decodeChunk(encodeChunk(blocks))).toEqual(blocks);
  });

  // 저장이 끝나기 전에 블록이 또 바뀌어도 저장 내용이 흔들리지 않아야 한다.
  it('인코딩 결과는 원본 블록 배열과 메모리를 공유하지 않는다', () => {
    const blocks = sampleBlocks();
    const bytes = encodeChunk(blocks);
    blocks[0] = 99;
    expect(decodeChunk(bytes)[0]).toBe(0);
  });

  it('버전이 다르면 거부한다', () => {
    const bytes = encodeChunk(sampleBlocks());
    bytes[0] = 255;
    expect(() => decodeChunk(bytes)).toThrow();
  });

  it('길이가 다르면 거부한다', () => {
    const bytes = encodeChunk(sampleBlocks());
    expect(() => decodeChunk(bytes.subarray(0, bytes.length - 1))).toThrow();
  });
});
