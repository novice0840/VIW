import { chunkKey, type Chunk } from './chunk';
import { encodeChunk } from './chunkCodec';
import type { PlayerState } from './player';
import type { World } from './world';
import type { SavedChunk, WorldRecord, WorldStore } from './worldStore';

// 블록이 바뀐 뒤 이만큼 기다렸다가 저장한다. 그 사이의 변경은 한 번에 묶인다.
const SAVE_DELAY_MS = 2000;

/**
 * @description 로컬 월드의 변경을 모아 WorldStore에 저장하는 역할
 *
 * 블록을 바꿀 때마다 바로 쓰지 않는다. 블록을 연달아 부수면 같은 청크(16KB)를 매번
 * 다시 쓰게 되므로, 바뀐 청크를 모아 두었다가 잠시 뒤 한 번에 저장한다.
 *
 * 멀티플레이 월드에서는 저장이 서버의 일이라 이 클래스를 쓰지 않는다.
 */
export class WorldSaver {
  // 마지막 저장 이후 바뀐 청크. 같은 청크가 여러 번 바뀌어도 한 번만 저장한다.
  private readonly dirty = new Map<string, Chunk>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  // 저장을 순서대로 이어 붙이는 꼬리. 앞선 저장이 끝나기 전에 다음 저장이 끼어들지 않게 한다.
  private saving: Promise<void> = Promise.resolve();
  private readonly unsubscribe: () => void;

  /**
   * @param record 저장할 월드 레코드. 저장할 때마다 플레이어 상태와 마지막 플레이 시각을 갱신해 쓴다.
   * @param getPlayerState 저장 순간의 플레이어 상태를 돌려주는 함수
   */
  constructor(
    private readonly store: WorldStore,
    world: World,
    private readonly record: WorldRecord,
    private readonly getPlayerState: () => PlayerState,
  ) {
    this.unsubscribe = world.onBlockChange(({ cx, cz, chunk }) => {
      this.dirty.set(chunkKey(cx, cz), chunk);
      this.schedule();
    });
  }

  /**
   * @description 바뀐 청크와 플레이어 상태를 지금 저장하는 함수
   * @returns 이번 저장이 끝나면 resolve된다. 실패해도 reject하지 않고, 바뀐 청크를 다음 저장으로 넘긴다.
   *
   * 저장할 내용은 이 함수를 부른 순간에 확정한다. 청크는 encodeChunk가 복사하고,
   * 플레이어 상태도 새 객체로 받는다. 그래서 IndexedDB 쓰기가 끝나기 전에 블록이나
   * 위치가 또 바뀌어도 저장되는 내용이 섞이지 않는다.
   */
  flush(): Promise<void> {
    this.cancelTimer();

    const entries = [...this.dirty];
    this.dirty.clear();
    const chunks: SavedChunk[] = entries.map(([, chunk]) => ({
      cx: chunk.cx,
      cz: chunk.cz,
      bytes: encodeChunk(chunk.blocks),
    }));
    const record: WorldRecord = {
      ...this.record,
      player: this.getPlayerState(),
      lastPlayedAt: Date.now(),
    };

    this.saving = this.saving
      .then(() => this.store.save(record, chunks))
      .catch((err) => {
        console.error('월드를 저장하지 못했다', err);
        // 저장하지 못한 청크를 다시 dirty로 돌려 다음 저장에 포함시킨다.
        // 그 사이 또 바뀌어 이미 dirty에 있는 청크는 같은 객체라 그대로 둬도 된다.
        for (const [key, chunk] of entries) {
          if (!this.dirty.has(key)) this.dirty.set(key, chunk);
        }
        if (this.dirty.size > 0) this.schedule();
      });
    return this.saving;
  }

  /**
   * @description 구독과 예약된 저장을 정리하는 함수. 남은 변경은 저장하지 않으므로 필요하면 먼저 flush한다.
   */
  dispose() {
    this.cancelTimer();
    this.unsubscribe();
  }

  private schedule() {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, SAVE_DELAY_MS);
  }

  private cancelTimer() {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}
