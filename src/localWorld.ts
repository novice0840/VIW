import { LocalChunkSource } from './chunkSource';
import { parseSeed, randomSeed } from './seed';
import { World } from './world';
import { SAVE_VERSION, WorldStore, createWorldRecord, type WorldRecord } from './worldStore';

export const DEFAULT_WORLD_NAME = '새 월드';

export interface OpenedWorld {
  world: World;
  record: WorldRecord;
  // 저장 없이 플레이하는 임시 월드면 null
  store: WorldStore | null;
}

/**
 * @description IndexedDB를 여는 함수. 열 수 없으면 null을 돌려준다
 *
 * 일부 브라우저의 사생활 보호 모드나 저장소 차단 설정에서는 IndexedDB가 막혀 있다.
 * 저장을 못 한다고 게임 자체를 못 하게 할 이유는 없으므로, 호출하는 쪽은 임시 월드로 대신한다.
 */
export async function openStore(): Promise<WorldStore | null> {
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

/**
 * @description 새 월드를 만들어 저장하는 함수
 * @param name 비어 있으면 DEFAULT_WORLD_NAME
 * @param seedText 사람이 입력한 시드. 비어 있으면 무작위
 *
 * 월드는 시드가 아니라 id로 구분한다. 같은 시드로 만든 두 월드도 처음 지형만 같을 뿐
 * 서로 다른 월드다.
 */
export async function createLocalWorld(
  store: WorldStore,
  name: string,
  seedText: string,
): Promise<WorldRecord> {
  const seed = parseSeed(seedText) ?? randomSeed();
  const record = createWorldRecord(crypto.randomUUID(), name.trim() || DEFAULT_WORLD_NAME, seed);
  await store.putWorld(record);
  return record;
}

/**
 * @description 이 월드를 지금 버전에서 열 수 있는지
 */
export function isPlayable(record: WorldRecord): boolean {
  return record.version === SAVE_VERSION;
}

/**
 * @description 저장된 월드를 여는 함수
 * @returns 없는 월드이거나 버전이 달라 열 수 없으면 null
 */
export async function openLocalWorld(store: WorldStore, id: string): Promise<OpenedWorld | null> {
  const stored = await store.getWorld(id);
  if (!stored || !isPlayable(stored)) return null;

  // 목록이 "마지막으로 플레이한 순서"라, 연 순간 바로 맨 위로 오게 한다.
  const record: WorldRecord = { ...stored, lastPlayedAt: Date.now() };
  await store.putWorld(record);

  const source = await LocalChunkSource.create(record.seed, store, record.id);
  return { world: new World(source), record, store };
}

/**
 * @description 저장하지 않는 임시 월드를 여는 함수 — IndexedDB를 쓸 수 없을 때 쓴다
 */
export async function openTemporaryWorld(): Promise<OpenedWorld> {
  const record = createWorldRecord('temporary', '임시 월드', randomSeed());
  const source = await LocalChunkSource.create(record.seed, null, record.id);
  return { world: new World(source), record, store: null };
}
