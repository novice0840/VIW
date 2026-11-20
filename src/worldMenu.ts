import { DEFAULT_WORLD_NAME, createLocalWorld, isPlayable } from './localWorld';
import type { WorldRecord, WorldStore } from './worldStore';

/**
 * 화면 전환은 주소로 한다. `?world=<id>`가 있으면 그 월드를 플레이하고, 없으면 시작 화면이다.
 *
 * 월드를 고르거나 나갈 때 페이지를 새로 불러온다. 렌더러(GPU 자원), 이벤트 리스너, 프레임 루프를
 * 하나하나 정리하는 코드 없이도 이전 월드의 상태가 남지 않는다. 브라우저 뒤로 가기도 그대로 동작한다.
 */
export function worldUrl(id: string): string {
  return `${location.pathname}?world=${encodeURIComponent(id)}`;
}

export function menuUrl(): string {
  return location.pathname;
}

/**
 * @description 시작 화면 — 저장된 월드 목록, 새 월드 만들기, 플레이, 삭제
 */
export async function showWorldMenu(store: WorldStore) {
  const menu = document.getElementById('world-menu')!;
  const list = document.getElementById('world-list')!;
  const form = document.getElementById('world-create') as HTMLFormElement;
  const nameInput = document.getElementById('world-name') as HTMLInputElement;
  const seedInput = document.getElementById('world-seed') as HTMLInputElement;

  nameInput.placeholder = DEFAULT_WORLD_NAME;
  menu.style.display = 'flex';

  const render = async () => {
    const worlds = await store.listWorlds();
    list.replaceChildren(...worlds.map((w) => worldRow(w, render)));
    if (worlds.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'world-empty';
      empty.textContent = '아직 만든 월드가 없어요.';
      list.appendChild(empty);
    }
  };

  /**
   * @description 월드 한 줄 — 이름, 마지막 플레이 시각, 시드, 플레이·삭제 버튼
   */
  function worldRow(world: WorldRecord, refresh: () => Promise<void>): HTMLLIElement {
    const row = document.createElement('li');
    row.className = 'world-row';

    // 이름은 사용자가 입력한 문자열이라 innerHTML이 아니라 textContent로 넣는다.
    const info = document.createElement('div');
    info.className = 'world-info';
    const name = document.createElement('div');
    name.className = 'world-title';
    name.textContent = world.name;
    const detail = document.createElement('div');
    detail.className = 'world-detail';
    const playable = isPlayable(world);
    detail.textContent = playable
      ? `${new Date(world.lastPlayedAt).toLocaleString()} · 시드 ${world.seed}`
      : '이전 버전에서 만든 월드라 열 수 없어요';
    info.append(name, detail);

    const play = document.createElement('button');
    play.textContent = '플레이';
    play.disabled = !playable;
    play.addEventListener('click', () => location.assign(worldUrl(world.id)));

    const remove = document.createElement('button');
    remove.textContent = '삭제';
    remove.className = 'danger';
    remove.addEventListener('click', async () => {
      if (!confirm(`'${world.name}' 월드를 삭제할까요? 되돌릴 수 없어요.`)) return;
      await store.deleteWorld(world.id);
      await refresh();
    });

    row.append(info, play, remove);
    return row;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const record = await createLocalWorld(store, nameInput.value, seedInput.value);
    location.assign(worldUrl(record.id));
  });

  await render();
}
