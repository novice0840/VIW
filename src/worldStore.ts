import type { PlayerState } from './player';

/**
 * 저장된 월드의 버전. 지형 생성 규칙(노이즈, 난수, 생성 상수)이나 저장 구조가 바뀌면 올린다.
 *
 * 수정된 청크만 저장하고 나머지는 시드로 다시 생성하므로, 생성 규칙이 바뀌면
 * 저장된 청크(옛 지형)와 새로 생성한 청크(새 지형) 사이 경계가 어긋난다.
 * 버전이 다른 월드는 열지 않는다.
 */
export const SAVE_VERSION = 1;

const DB_NAME = 'viw';
// IndexedDB 스키마(object store 구성)의 버전. SAVE_VERSION과는 별개다.
const DB_VERSION = 1;

const WORLDS = 'worlds';
const CHUNKS = 'chunks';

/**
 * @description worlds store에 저장되는 월드 하나의 정보
 *
 * 로컬 월드에는 플레이어가 한 명뿐이라 플레이어 상태를 월드 레코드에 같이 둔다.
 * 멀티플레이 월드는 서버가 플레이어별로 따로 저장하므로 이 구조를 쓰지 않는다.
 */
export interface WorldRecord {
  id: string;
  name: string;
  seed: number;
  createdAt: number;
  lastPlayedAt: number;
  version: number;
  // 아직 한 번도 저장되지 않은 새 월드는 null — 스폰 위치를 새로 계산한다.
  player: PlayerState | null;
}

export interface SavedChunk {
  cx: number;
  cz: number;
  bytes: Uint8Array;
}

export function createWorldRecord(id: string, name: string, seed: number): WorldRecord {
  const now = Date.now();
  return { id, name, seed, createdAt: now, lastPlayedAt: now, version: SAVE_VERSION, player: null };
}

/**
 * @description IndexedDB의 콜백 기반 요청을 Promise로 감싸는 함수
 */
function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * @description 트랜잭션이 끝까지 커밋될 때까지 기다리는 함수
 *
 * 요청 하나의 onsuccess는 "그 요청이 처리됐다"일 뿐, 디스크에 반영됐다는 뜻이 아니다.
 * 쓰기는 트랜잭션의 oncomplete까지 기다려야 저장이 끝난 것이다.
 */
function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('트랜잭션이 중단됐다'));
  });
}

/**
 * @description 한 월드의 모든 청크 키 [worldId, cx, cz]를 덮는 범위
 *
 * 배열 키는 원소를 앞에서부터 차례로 비교한다. 첫 원소를 worldId로 고정하고
 * 나머지를 -∞부터 +∞까지 열어 두면 그 월드의 청크만 정확히 잡힌다.
 */
function worldChunkRange(worldId: string): IDBKeyRange {
  return IDBKeyRange.bound([worldId, -Infinity, -Infinity], [worldId, Infinity, Infinity]);
}

/**
 * @description 브라우저 IndexedDB에 로컬 월드를 저장하고 불러오는 저장소
 *
 * - worlds: 키 = 월드 id, 값 = WorldRecord
 * - chunks: 키 = [worldId, cx, cz], 값 = chunkCodec으로 인코딩한 바이트
 *
 * 청크 키를 월드 id로 시작하는 복합 키로 두어, 월드 하나의 청크만 범위로 찾거나 지울 수 있다.
 */
export class WorldStore {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(): Promise<WorldStore> {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    // DB가 처음 만들어지거나 DB_VERSION이 올라갔을 때만 불린다. store 구성은 이 안에서만 바꿀 수 있다.
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(WORLDS)) db.createObjectStore(WORLDS, { keyPath: 'id' });
      // 청크는 값 안에 키가 없으므로 키를 따로 넘기는 out-of-line 방식으로 둔다.
      if (!db.objectStoreNames.contains(CHUNKS)) db.createObjectStore(CHUNKS);
    };
    return new WorldStore(await request(req));
  }

  close() {
    this.db.close();
  }

  async getWorld(id: string): Promise<WorldRecord | undefined> {
    const tx = this.db.transaction(WORLDS, 'readonly');
    return request<WorldRecord | undefined>(tx.objectStore(WORLDS).get(id));
  }

  async putWorld(world: WorldRecord): Promise<void> {
    const tx = this.db.transaction(WORLDS, 'readwrite');
    tx.objectStore(WORLDS).put(world);
    await transactionDone(tx);
  }

  /**
   * @description 이 월드에 저장된 청크 좌표 목록을 돌려주는 함수
   *
   * 키만 읽으므로 청크 바이트(개당 16KB)는 메모리에 올라오지 않는다.
   */
  async listChunkCoords(worldId: string): Promise<[number, number][]> {
    const tx = this.db.transaction(CHUNKS, 'readonly');
    const keys = await request(tx.objectStore(CHUNKS).getAllKeys(worldChunkRange(worldId)));
    return keys.map((key) => {
      const [, cx, cz] = key as [string, number, number];
      return [cx, cz];
    });
  }

  async loadChunk(worldId: string, cx: number, cz: number): Promise<Uint8Array | undefined> {
    const tx = this.db.transaction(CHUNKS, 'readonly');
    return request<Uint8Array | undefined>(tx.objectStore(CHUNKS).get([worldId, cx, cz]));
  }

  /**
   * @description 바뀐 청크들과 월드 레코드를 한 트랜잭션으로 저장하는 함수
   *
   * 한 트랜잭션이라 전부 저장되거나 전부 저장되지 않는다. 플레이어 위치만 저장되고
   * 그 사이에 부순 블록은 빠지는 식으로 둘이 어긋나지 않는다.
   */
  async save(world: WorldRecord, chunks: SavedChunk[]): Promise<void> {
    const tx = this.db.transaction([WORLDS, CHUNKS], 'readwrite');
    const chunkStore = tx.objectStore(CHUNKS);
    for (const { cx, cz, bytes } of chunks) {
      chunkStore.put(bytes, [world.id, cx, cz]);
    }
    tx.objectStore(WORLDS).put(world);
    await transactionDone(tx);
  }

  /**
   * @description 월드 레코드와 그 월드의 청크를 모두 지우는 함수
   */
  async deleteWorld(id: string): Promise<void> {
    const tx = this.db.transaction([WORLDS, CHUNKS], 'readwrite');
    tx.objectStore(WORLDS).delete(id);
    tx.objectStore(CHUNKS).delete(worldChunkRange(id));
    await transactionDone(tx);
  }
}
