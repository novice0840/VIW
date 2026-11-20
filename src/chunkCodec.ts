import { CHUNK_VOLUME } from './chunk';

/**
 * 청크 바이트 포맷의 버전. 바이트 배치를 바꾸면 올린다.
 *
 * 지형 생성 규칙이 바뀌는 것은 여기가 아니라 월드 단위의 SAVE_VERSION(worldStore.ts)이 다룬다.
 * 이 버전은 "바이트를 어떻게 읽는가"만 책임진다.
 */
export const CHUNK_FORMAT_VERSION = 1;

// [0]: 포맷 버전, [1..]: 블록 배열 (Chunk.blocks와 같은 순서)
const HEADER_SIZE = 1;

/**
 * @description 청크 블록 배열을 저장·전송용 바이트로 바꾸는 함수
 *
 * 항상 새 배열에 복사한다. 저장이 비동기로 끝나기 전에 플레이어가 블록을 또 바꿔도,
 * 저장되는 내용은 이 함수를 부른 순간의 상태로 고정된다.
 *
 * 저장소(IndexedDB)와 나중의 네트워크 전송이 같은 포맷을 쓰도록 따로 떼어 두었다.
 */
export function encodeChunk(blocks: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(HEADER_SIZE + blocks.length);
  bytes[0] = CHUNK_FORMAT_VERSION;
  bytes.set(blocks, HEADER_SIZE);
  return bytes;
}

/**
 * @description encodeChunk가 만든 바이트를 블록 배열로 되돌리는 함수
 * @throws 버전이나 길이가 맞지 않으면 — 잘못 읽은 블록으로 월드를 덮어쓰는 것보다 실패가 낫다
 */
export function decodeChunk(bytes: Uint8Array): Uint8Array {
  const version = bytes[0];
  if (version !== CHUNK_FORMAT_VERSION) {
    throw new Error(`지원하지 않는 청크 포맷 버전 ${version}`);
  }
  if (bytes.length !== HEADER_SIZE + CHUNK_VOLUME) {
    throw new Error(`청크 바이트 길이가 ${bytes.length}다 (${HEADER_SIZE + CHUNK_VOLUME}여야 한다)`);
  }
  // slice로 복사해 돌려준다. 원본 바이트와 메모리를 공유하면 저장소 쪽 버퍼와 얽힌다.
  return bytes.slice(HEADER_SIZE);
}
