import { BlockType } from './block';
import { Chunk, CHUNK_SIZE, WORLD_HEIGHT, chunkKey } from './chunk';
import type { ChunkSource } from './chunkSource';

/**
 * @description 블록 하나가 바뀐 기록. (x, y, z)는 월드 좌표, (cx, cz)는 그 블록이 속한 청크다.
 */
export interface BlockChange {
  x: number;
  y: number;
  z: number;
  type: BlockType;
  cx: number;
  cz: number;
  chunk: Chunk;
}

export type BlockChangeListener = (change: BlockChange) => void;

/**
 * @descriotion 청크(Chunk)들의 컨네이너
 * 월드의 지형 데이터를 불러와 들고 있고, 블록을 읽고 바꾸는 창구 역할
 * 청크(Chunk): 블록 여러 개의 묶음 (CHUNK_SIZE X CHUNK_SIZE X WORLD_HEIGHT)
 *
 * 청크는 ChunkSource에서 비동기로 도착한다. 도착하기 전까지 그 칸은 "없는 청크"라
 * getBlock은 Air를, getChunk는 undefined를 돌려준다.
 */
export class World {
  private readonly chunks = new Map<string, Chunk>();
  // 요청했지만 아직 도착하지 않은 청크. 같은 청크를 여러 번 요청하지 않게 막고, 도착을 기다릴 수 있게 한다.
  private readonly loading = new Map<string, Promise<Chunk>>();
  // 불러오다 실패한 청크. 매 프레임 다시 요청해 에러가 쏟아지지 않게 한 번만 시도한다.
  private readonly failed = new Set<string>();
  private readonly listeners = new Set<BlockChangeListener>();

  constructor(private readonly source: ChunkSource) {}

  /**
   * @description 도착한 청크를 돌려주는 함수. 아직 없으면 undefined다 (요청은 하지 않는다)
   */
  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  /**
   * @description 청크를 요청하고, 도착하면 resolve되는 Promise를 돌려주는 함수
   *
   * 이미 있거나 불러오는 중이면 새로 요청하지 않는다.
   */
  requestChunk(cx: number, cz: number): Promise<Chunk> {
    const key = chunkKey(cx, cz);
    const ready = this.chunks.get(key);
    if (ready) return Promise.resolve(ready);
    const pending = this.loading.get(key);
    if (pending) return pending;

    const promise = this.source.load(cx, cz).then(
      (chunk) => {
        this.loading.delete(key);
        this.chunks.set(key, chunk);
        return chunk;
      },
      (err) => {
        this.loading.delete(key);
        this.failed.add(key);
        console.error(`청크 (${cx}, ${cz})를 불러오지 못했다`, err);
        throw err;
      },
    );
    this.loading.set(key, promise);
    return promise;
  }

  /**
   * @description centerX, centerZ 좌표 주위의 청크를 요청하는 함수 — 도착을 기다리지 않는다
   *
   * (radius×2 + 1)²개의 chunk를 요청한다. 매 프레임 불러도 이미 있거나 불러오는 중인 청크는 건너뛴다.
   */
  requestAround(centerX: number, centerZ: number, radius: number) {
    const ccx = Math.floor(centerX / CHUNK_SIZE);
    const ccz = Math.floor(centerZ / CHUNK_SIZE);

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const cx = ccx + dx;
        const cz = ccz + dz;
        if (this.failed.has(chunkKey(cx, cz))) continue;
        // 실패는 requestChunk가 이미 로그로 남겼다. 기다리지 않는 호출이라 여기서는 삼킨다.
        this.requestChunk(cx, cz).catch(() => {});
      }
    }
  }

  /**
   * @description requestAround와 같지만, 요청한 청크가 모두 도착할 때까지 기다리는 함수
   *
   * 게임 시작처럼 발밑 지형이 반드시 있어야 하는 순간에 쓴다.
   */
  async loadAround(centerX: number, centerZ: number, radius: number): Promise<void> {
    const ccx = Math.floor(centerX / CHUNK_SIZE);
    const ccz = Math.floor(centerZ / CHUNK_SIZE);
    const all: Promise<Chunk>[] = [];
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        all.push(this.requestChunk(ccx + dx, ccz + dz));
      }
    }
    await Promise.all(all);
  }

  /**
   * @description 월드 좌표를 입력 받아 해당 블록의 타입을 반환하는 함수
   * @returns BlockType. 청크가 아직 도착하지 않았으면 Air
   */
  getBlock(wx: number, wy: number, wz: number): BlockType {
    // world coordinate(실수) -> block index(정수)로 변환
    const bx = Math.floor(wx);
    const by = Math.floor(wy);
    const bz = Math.floor(wz);
    if (by < 0 || by >= WORLD_HEIGHT) return BlockType.Air;
    // chunk index 추출
    const cx = Math.floor(bx / CHUNK_SIZE);
    const cz = Math.floor(bz / CHUNK_SIZE);
    // lx, ly: local coordinate (청크 내부 지역 좌표)
    // (bx,by % CHUNK_SIZE) + CHUNK_SIZE): JavaScript의 % 연산자는 수학적인 modulo가 아니라 부호를 그대로 유지하는
    // remainer이기 때문에 음수를 0 ~ 15 로 변경하기 위한 작업
    const lx = ((bx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((bz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return BlockType.Air;
    return chunk.getBlock(lx, by, lz);
  }

  /**
   * @description 월드 좌표의 블록을 다른 타입으로 바꾸는 함수 (파괴 = Air 설정)
   * @returns 실제로 바뀌었으면 true. 범위 밖이거나, 청크가 아직 없거나, 이미 같은 블록이면 false
   *
   * 좌표 변환 방식은 getBlock과 동일하다.
   * 바뀌면 구독자(메시 갱신, 저장, 나중에는 네트워크 전송)에게 알린다. 블록을 바꾸는 쪽은
   * 누가 이 변경을 필요로 하는지 몰라도 된다.
   */
  setBlock(wx: number, wy: number, wz: number, type: BlockType): boolean {
    const bx = Math.floor(wx);
    const by = Math.floor(wy);
    const bz = Math.floor(wz);
    if (by < 0 || by >= WORLD_HEIGHT) return false;
    const cx = Math.floor(bx / CHUNK_SIZE);
    const cz = Math.floor(bz / CHUNK_SIZE);
    const lx = ((bx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((bz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return false;
    if (chunk.getBlock(lx, by, lz) === type) return false;

    chunk.setBlock(lx, by, lz, type);
    const change: BlockChange = { x: bx, y: by, z: bz, type, cx, cz, chunk };
    for (const listener of this.listeners) listener(change);
    return true;
  }

  /**
   * @description 블록 변경을 구독하는 함수
   * @returns 구독을 해제하는 함수
   */
  onBlockChange(listener: BlockChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
