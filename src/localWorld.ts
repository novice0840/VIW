import { LocalChunkSource } from './chunkSource';
import { parseSeed, randomSeed } from './seed';
import { World } from './world';
import { SAVE_VERSION, WorldStore, createWorldRecord, type WorldRecord } from './worldStore';

// 월드 목록 화면(#22)이 생기기 전까지는 이 월드 하나만 연다.
const DEFAULT_WORLD_ID = 'default';
const DEFAULT_WORLD_NAME = '새 월드';

export interface OpenedWorld {
  world: World;
  record: WorldRecord;
  // IndexedDB를 쓸 수 없는 환경이면 null — 저장 없이 플레이한다.
  store: WorldStore | null;
}

/**
 * @description 저장된 기본 월드를 열고, 없으면 새로 만드는 함수
 *
 * 주소 파라미터 (월드 목록 화면이 생기기 전까지의 임시 방편):
 * - `?seed=값`: 새 월드를 만들 때 쓸 시드. 이미 저장된 월드가 있으면 무시된다.
 * - `?reset`: 저장된 월드를 지우고 새로 시작한다. 한 번 쓰고 나면 주소에서 지운다 —
 *   남겨 두면 새로고침할 때마다 월드가 지워진다.
 */
export async function openLocalWorld(params: URLSearchParams): Promise<OpenedWorld> {
  const store = await openStore();
  let record = store ? await store.getWorld(DEFAULT_WORLD_ID) : undefined;

  if (record && record.version !== SAVE_VERSION) {
    console.warn(`저장된 월드의 버전(${record.version})이 현재 버전(${SAVE_VERSION})과 달라 새 월드로 시작한다`);
    await store!.deleteWorld(record.id);
    record = undefined;
  }
  if (record && params.has('reset')) {
    await store!.deleteWorld(record.id);
    record = undefined;
  }
  if (params.has('reset')) {
    const url = new URL(location.href);
    url.searchParams.delete('reset');
    history.replaceState(null, '', url);
  }

  if (!record) {
    const seedParam = params.get('seed');
    const seed = (seedParam !== null ? parseSeed(seedParam) : null) ?? randomSeed();
    record = createWorldRecord(DEFAULT_WORLD_ID, DEFAULT_WORLD_NAME, seed);
    await store?.putWorld(record);
  }

  const source = await LocalChunkSource.create(record.seed, store, record.id);
  return { world: new World(source), record, store };
}

/**
 * @description IndexedDB를 여는 함수. 열 수 없으면 null을 돌려주고 저장 없이 진행한다
 *
 * 일부 브라우저의 사생활 보호 모드나 저장소 차단 설정에서는 IndexedDB가 막혀 있다.
 * 저장을 못 한다고 게임 자체를 못 하게 할 이유는 없다.
 */
async function openStore(): Promise<WorldStore | null> {
  try {
    const store = await WorldStore.open();
    // 브라우저는 저장 공간이 부족하면 사이트 데이터를 지울 수 있다. 지우지 말아 달라고 요청만 해 둔다
    // (허락 여부는 브라우저가 정하고, 거절돼도 저장은 그대로 된다).
    void navigator.storage?.persist?.();
    return store;
  } catch (err) {
    console.warn('IndexedDB를 열 수 없어 저장 없이 진행한다', err);
    return null;
  }
}
