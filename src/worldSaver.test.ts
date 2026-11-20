import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BlockType } from './block';
import { Chunk } from './chunk';
import { LocalChunkSource } from './chunkSource';
import { Noise } from './noise';
import type { PlayerState } from './player';
import { World } from './world';
import { WorldSaver } from './worldSaver';
import { WorldStore, createWorldRecord, type WorldRecord } from './worldStore';

const SEED = 7;

const PLAYER: PlayerState = {
  position: [10.5, 40, -3.25],
  yaw: 1.2,
  pitch: -0.3,
  selectedBlock: BlockType.Wood,
  flying: true,
};

/**
 * 월드를 열고 주변 청크를 불러온다. 게임이 시작할 때와 같은 순서다.
 */
async function openWorld(store: WorldStore, record: WorldRecord): Promise<World> {
  const world = new World(await LocalChunkSource.create(record.seed, store, record.id));
  await world.loadAround(0, 0, 1);
  return world;
}

describe('월드 저장과 불러오기', () => {
  let store: WorldStore;
  let record: WorldRecord;

  beforeEach(async () => {
    // 테스트마다 빈 IndexedDB로 시작한다.
    globalThis.indexedDB = new IDBFactory();
    store = await WorldStore.open();
    record = createWorldRecord('w1', '테스트', SEED);
    await store.putWorld(record);
  });

  afterEach(() => store.close());

  it('바꾼 블록과 플레이어 상태가 다시 열어도 남아 있다', async () => {
    const world = await openWorld(store, record);
    const saver = new WorldSaver(store, world, record, () => PLAYER);
    world.setBlock(5, 60, 5, BlockType.Wood);
    world.setBlock(-3, 60, -3, BlockType.Snow); // 다른 청크
    await saver.flush();
    saver.dispose();

    const saved = await store.getWorld('w1');
    expect(saved?.player).toEqual(PLAYER);

    const reopened = await openWorld(store, saved!);
    expect(reopened.getBlock(5, 60, 5)).toBe(BlockType.Wood);
    expect(reopened.getBlock(-3, 60, -3)).toBe(BlockType.Snow);
  });

  // 수정하지 않은 청크는 저장하지 않고, 다시 열 때 시드로 똑같이 생성한다.
  it('바뀐 청크만 저장하고, 나머지는 시드로 다시 생성한다', async () => {
    const world = await openWorld(store, record);
    const saver = new WorldSaver(store, world, record, () => PLAYER);
    world.setBlock(5, 60, 5, BlockType.Wood);
    await saver.flush();
    saver.dispose();

    expect(await store.listChunkCoords('w1')).toEqual([[0, 0]]);

    const reopened = await openWorld(store, record);
    const expected = Chunk.generate(1, 1, new Noise(SEED));
    expect(reopened.getChunk(1, 1)?.blocks).toEqual(expected.blocks);
  });

  it('저장 내용은 flush를 부른 순간의 상태다', async () => {
    const world = await openWorld(store, record);
    const saver = new WorldSaver(store, world, record, () => PLAYER);
    world.setBlock(5, 60, 5, BlockType.Wood);
    const saving = saver.flush();
    // 쓰기가 끝나기 전에 같은 블록을 또 바꾼다. 이 변경은 다음 저장 몫이다.
    world.setBlock(5, 60, 5, BlockType.Stone);
    await saving;
    saver.dispose();

    const reopened = await openWorld(store, record);
    expect(reopened.getBlock(5, 60, 5)).toBe(BlockType.Wood);
  });

  it('월드를 지우면 그 월드의 청크만 지워진다', async () => {
    const other = createWorldRecord('w2', '다른 월드', SEED);
    await store.putWorld(other);
    const bytes = new Uint8Array([1]);
    await store.save(record, [{ cx: 0, cz: 0, bytes }]);
    await store.save(other, [{ cx: 0, cz: 0, bytes }]);

    await store.deleteWorld('w1');

    expect(await store.getWorld('w1')).toBeUndefined();
    expect(await store.listChunkCoords('w1')).toEqual([]);
    expect(await store.listChunkCoords('w2')).toEqual([[0, 0]]);
  });
});
