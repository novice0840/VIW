import { Renderer } from './renderer';
import { Player } from './player';
import { BlockType, isSolid } from './block';
import { raycast, type RaycastHit } from './raycast';
import { WORLD_HEIGHT } from './chunk';
import { Hotbar } from './hotbar';
import { DebugHud } from './debugHud';
import { stats } from './stats';
import { openLocalWorld, openStore, openTemporaryWorld, type OpenedWorld } from './localWorld';
import { WorldSaver } from './worldSaver';
import { menuUrl, showWorldMenu } from './worldMenu';

// 블록을 바꾸지 않아도 플레이어 위치가 저장되도록 이 간격마다 저장한다.
const AUTOSAVE_INTERVAL_MS = 30_000;

// 블록을 조준할 수 있는 최대 거리 (마인크래프트의 손 닿는 거리 ≈ 4.5~5블록)
const REACH = 6;

// MouseEvent.button 값 (Pointer Events 스펙의 Left/Middle/Right Mouse 명명을 따름).
// 주의: 물리적 위치가 아니라 OS가 정한 순서라, 왼손잡이 설정을 켜면
// 물리적 오른쪽 버튼이 Left(0)를 보낸다.
const enum MouseButton {
  Left = 0,
  Middle = 1, // 휠 클릭
  Right = 2,
}

/**
 * @description 시작 지점 — 주소에 따라 시작 화면을 보여 주거나 월드를 연다
 *
 * - `?world=<id>` 없음: 시작 화면(월드 목록)
 * - `?world=<id>` 있음: 그 월드를 플레이
 * - IndexedDB를 쓸 수 없으면: 목록 없이 저장되지 않는 임시 월드를 바로 연다
 */
async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;

  if (!navigator.gpu) {
    document.getElementById('no-webgpu')!.style.display = 'block';
    return;
  }

  const store = await openStore();
  const worldId = new URLSearchParams(location.search).get('world');

  if (store && worldId === null) {
    await showWorldMenu(store);
    return;
  }

  const opened = store ? await openLocalWorld(store, worldId!) : await openTemporaryWorld();
  if (!opened) {
    // 삭제됐거나 이전 버전이라 열 수 없는 월드. 시작 화면으로 돌아간다.
    console.warn(`월드 ${worldId}를 열 수 없어 시작 화면으로 돌아간다`);
    location.replace(menuUrl());
    return;
  }

  await startGame(canvas, opened);
}

/**
 * @description 연 월드로 게임을 시작하는 함수
 */
async function startGame(canvas: HTMLCanvasElement, { world, record, store }: OpenedWorld) {
  // WebGPU API를 직접 다루며 화면에 세계를 그리는 역할
  const renderer = new Renderer();
  // 플레이어의 물리·입력과 1인칭 시점을 함께 담당
  const player = new Player();

  try {
    await renderer.init(canvas, world);
  } catch (e) {
    document.getElementById('no-webgpu')!.style.display = 'block';
    console.error(e);
    return;
  }

  player.world = world;
  if (record.player) player.applyState(record.player);
  // 청크는 비동기로 도착한다. 발밑 지형이 없으면 시작하자마자 떨어지므로 주변 청크를 기다린다.
  await world.loadAround(player.position[0], player.position[2], 1);
  if (!record.player) {
    // 처음 여는 월드라 저장된 위치가 없다. 스폰 기둥의 가장 높은 블록 위에 세운다.
    const spawnX = Math.floor(player.position[0]);
    const spawnZ = Math.floor(player.position[2]);
    let spawnY = WORLD_HEIGHT - 1;
    while (spawnY > 0 && !isSolid(world.getBlock(spawnX, spawnY, spawnZ))) {
      spawnY--;
    }
    player.position[1] = spawnY + 1 + 1.62;
  }

  const saver = store ? new WorldSaver(store, world, record, () => player.getState()) : null;
  if (saver) {
    setInterval(() => void saver.flush(), AUTOSAVE_INTERVAL_MS);
    // 탭을 숨기거나 닫을 때 저장한다. visibilitychange(hidden)는 탭 전환, 창 최소화, 닫기에서
    // 대부분 불리고 pagehide보다 먼저 와서 비동기 저장이 끝날 시간이 더 있다. pagehide는 그걸 놓친 경우의 보험이다.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void saver.flush();
    });
    window.addEventListener('pagehide', () => void saver.flush());
  }

  player.attachEvents(canvas);
  setupPauseMenu(canvas, record.name, saver);

  const hotbar = new Hotbar(
    document.getElementById('hotbar')!,
    document.getElementById('block-name')!,
  );

  // 매 프레임 갱신되는 조준 대상. 하이라이트 렌더링과 클릭 처리가 같은 값을 본다.
  let aimed: RaycastHit | null = null;

  canvas.addEventListener('mousedown', (e) => {
    if (document.pointerLockElement !== canvas) return;

    const hit = aimed;
    if (!hit) return;

    if (e.button === MouseButton.Left) {
      // 좌클릭 = 파괴. y=0은 월드 바닥(베드락 역할)이라 뚫리지 않게 보호
      if (hit.block[1] === 0) return;
      // 메시 갱신과 저장은 World의 블록 변경 구독자가 맡는다.
      world.setBlock(hit.block[0], hit.block[1], hit.block[2], BlockType.Air);
    } else if (e.button === MouseButton.Right) {
      // 우클릭 = 설치. 맞은 면의 법선 방향 한 칸 앞이 설치 위치
      const px = hit.block[0] + hit.normal[0];
      const py = hit.block[1] + hit.normal[1];
      const pz = hit.block[2] + hit.normal[2];
      if (py < 0 || py >= WORLD_HEIGHT) return;
      if (player.occupiesBlock(px, py, pz)) return;
      world.setBlock(px, py, pz, player.selectedBlock);
    }
  });

  // 우클릭 시 브라우저 컨텍스트 메뉴가 뜨지 않도록 차단
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const debugHud = new DebugHud(document.getElementById('debug')!);

  // 디버그 키는 포인터 잠금 여부와 상관없이 받는다 — 숫자를 보면서 마우스를 풀어 둘 때가 많다.
  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'F3') {
      // F3은 브라우저의 '다음 찾기' 단축키라 기본 동작을 막아야 한다.
      e.preventDefault();
      debugHud.toggle();
    } else if (e.code === 'BracketLeft') {
      renderer.changeRenderDistance(-1);
    } else if (e.code === 'BracketRight') {
      renderer.changeRenderDistance(1);
    }
  });

  const dpr = window.devicePixelRatio || 1;
  const resize = () => {
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      renderer.onResize(w, h);
    }
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  let lastTime = performance.now();

  function frame(timestamp: number) {
    const cpuStart = performance.now();
    const frameMs = timestamp - lastTime;
    const dt = Math.min(frameMs / 1000, 0.1);
    lastTime = timestamp;

    player.update(dt);
    hotbar.update(player.selectedBlock);
    // 조준 대상은 플레이어가 움직인 뒤에 구해야 이번 프레임 화면과 어긋나지 않는다.
    aimed = raycast(world, player.position, player.getForward(), REACH);
    renderer.render(player, timestamp / 1000, aimed && aimed.block);

    // CPU 시간 = 이번 프레임에 JS가 일한 시간. GPU는 submit 이후 따로 일하므로 여기에 들어가지 않는다.
    stats.endFrame(frameMs, performance.now() - cpuStart);
    const report = stats.takeReport(performance.now());
    if (report) {
      debugHud.update(report, {
        position: player.position,
        renderDistance: renderer.renderDistance,
        seed: record.seed,
        gpuTimingSupported: renderer.gpuTimingSupported,
      });
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

/**
 * @description 마우스 잠금이 풀려 있는 동안 일시정지 메뉴를 보여 주는 함수
 * @param saver null이면 임시 월드라 저장하지 않고 나간다
 *
 * 게임을 처음 열었을 때도 잠금 전이라 이 메뉴가 보인다 — "게임으로 돌아가기"가 시작 버튼 역할을 한다.
 * 화면은 메뉴 뒤에서 계속 그려진다 (마크처럼 시간을 멈추지는 않는다).
 */
function setupPauseMenu(canvas: HTMLCanvasElement, worldName: string, saver: WorldSaver | null) {
  const menu = document.getElementById('pause-menu')!;
  const resume = document.getElementById('resume') as HTMLButtonElement;
  const exit = document.getElementById('exit-world') as HTMLButtonElement;
  document.getElementById('pause-title')!.textContent = worldName;
  if (!saver) exit.textContent = '나가기 (저장되지 않음)';

  const update = () => {
    menu.style.display = document.pointerLockElement === canvas ? 'none' : 'flex';
  };
  document.addEventListener('pointerlockchange', update);
  update();

  resume.addEventListener('click', () => {
    // ESC로 잠금을 푼 직후 1초 정도는 브라우저가 다시 잠그는 요청을 거절한다 (Chrome).
    // 거절돼도 메뉴가 그대로 남아 다시 누르면 되므로 에러는 무시한다.
    void Promise.resolve(canvas.requestPointerLock()).catch(() => {});
  });

  exit.addEventListener('click', async () => {
    exit.disabled = true;
    resume.disabled = true;
    exit.textContent = '저장 중…';
    if (saver && !(await saver.flush())) {
      alert('저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      exit.disabled = false;
      resume.disabled = false;
      exit.textContent = '저장 후 나가기';
      return;
    }
    location.assign(menuUrl());
  });
}

main();
