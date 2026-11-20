import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_WORLD_NAME, createLocalWorld, openLocalWorld } from './localWorld';
import { SAVE_VERSION, WorldStore, createWorldRecord } from './worldStore';

describe('로컬 월드 목록', () => {
  let store: WorldStore;

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    store = await WorldStore.open();
  });

  afterEach(() => store.close());

  // 월드는 시드가 아니라 id로 구분한다. 같은 시드로 만든 두 월드는 처음 지형만 같은 별개의 월드다.
  it('같은 시드로 월드를 두 개 만들 수 있다', async () => {
    const a = await createLocalWorld(store, '하나', 'hello');
    const b = await createLocalWorld(store, '둘', 'hello');
    expect(a.id).not.toBe(b.id);
    expect(a.seed).toBe(b.seed);
    expect(await store.listWorlds()).toHaveLength(2);
  });

  it('이름을 비우면 기본 이름, 시드를 비우면 무작위 시드로 만든다', async () => {
    const w = await createLocalWorld(store, '   ', '');
    expect(w.name).toBe(DEFAULT_WORLD_NAME);
    expect(Number.isInteger(w.seed)).toBe(true);
  });

  it('목록은 마지막으로 플레이한 월드가 먼저 온다', async () => {
    await store.putWorld({ ...createWorldRecord('old', '오래된', 1), lastPlayedAt: 1000 });
    await store.putWorld({ ...createWorldRecord('new', '최근', 2), lastPlayedAt: 3000 });
    await store.putWorld({ ...createWorldRecord('mid', '중간', 3), lastPlayedAt: 2000 });
    expect((await store.listWorlds()).map((w) => w.id)).toEqual(['new', 'mid', 'old']);
  });

  it('월드를 열면 마지막 플레이 시각이 갱신돼 목록 맨 위로 온다', async () => {
    await store.putWorld({ ...createWorldRecord('a', 'A', 1), lastPlayedAt: 1000 });
    await store.putWorld({ ...createWorldRecord('b', 'B', 2), lastPlayedAt: 2000 });

    await openLocalWorld(store, 'a');

    expect((await store.listWorlds())[0].id).toBe('a');
  });

  it('없는 월드나 버전이 다른 월드는 열지 않는다', async () => {
    await store.putWorld({ ...createWorldRecord('legacy', '옛 월드', 1), version: SAVE_VERSION - 1 });
    expect(await openLocalWorld(store, 'missing')).toBeNull();
    expect(await openLocalWorld(store, 'legacy')).toBeNull();
  });
});
