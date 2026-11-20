import { Chunk, chunkKey } from './chunk';
import { decodeChunk } from './chunkCodec';
import { Noise } from './noise';
import type { WorldStore } from './worldStore';

/**
 * @description World가 청크를 가져오는 곳
 *
 * World는 청크가 저장소에서 왔는지, 새로 생성됐는지, 서버에서 왔는지 모른다.
 * 지금은 LocalChunkSource 하나뿐이고, 멀티플레이에서는 서버에 청크를 요청하는 구현으로 바꿔 끼운다.
 * 어느 쪽이든 결과가 늦게 도착할 수 있으므로 Promise를 돌려준다.
 */
export interface ChunkSource {
  load(cx: number, cz: number): Promise<Chunk>;
}

/**
 * @description 싱글플레이용 청크 출처 — 저장된 청크는 불러오고, 없으면 시드로 생성한다
 *
 * 지형 생성은 결정론적이라 플레이어가 수정한 청크만 저장돼 있다. 어떤 청크가 저장돼
 * 있는지는 월드를 열 때 키 목록으로 한 번에 읽어 두어, 저장되지 않은 청크마다
 * IndexedDB에 "있나요?"를 묻지 않고 바로 생성한다.
 */
export class LocalChunkSource implements ChunkSource {
  private readonly noise: Noise;

  /**
   * @param store null이면 저장소 없이(IndexedDB를 쓸 수 없는 환경) 생성만 한다
   * @param savedKeys 저장소에 있는 청크의 chunkKey 목록
   */
  private constructor(
    seed: number,
    private readonly store: WorldStore | null,
    private readonly worldId: string,
    private readonly savedKeys: Set<string>,
  ) {
    this.noise = new Noise(seed);
  }

  static async create(seed: number, store: WorldStore | null, worldId: string): Promise<LocalChunkSource> {
    const coords = store ? await store.listChunkCoords(worldId) : [];
    const savedKeys = new Set(coords.map(([cx, cz]) => chunkKey(cx, cz)));
    return new LocalChunkSource(seed, store, worldId, savedKeys);
  }

  async load(cx: number, cz: number): Promise<Chunk> {
    if (this.store && this.savedKeys.has(chunkKey(cx, cz))) {
      const bytes = await this.store.loadChunk(this.worldId, cx, cz);
      if (bytes) return new Chunk(cx, cz, decodeChunk(bytes));
    }
    return Chunk.generate(cx, cz, this.noise);
  }
}
