import { Renderer } from './renderer';
import { Player } from './player';
import { BlockType, isSolid } from './block';
import { raycast, type RaycastHit } from './raycast';
import { WORLD_HEIGHT } from './chunk';

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

async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;

  if (!navigator.gpu) {
    document.getElementById('no-webgpu')!.style.display = 'block';
    return;
  }

  // WebGPU API를 직접 다루며 화면에 세계를 그리는 역할
  const renderer = new Renderer();
  // 플레이어의 물리·입력과 1인칭 시점을 함께 담당
  const player = new Player();

  try {
    await renderer.init(canvas);
  } catch (e) {
    document.getElementById('no-webgpu')!.style.display = 'block';
    console.error(e);
    return;
  }

  player.world = renderer.world;
  renderer.world.generateAround(player.position[0], player.position[2], 1);
  const spawnX = Math.floor(player.position[0]);
  const spawnZ = Math.floor(player.position[2]);
  let spawnY = 63;
  while (spawnY > 0 && !isSolid(renderer.world.getBlock(spawnX, spawnY, spawnZ))) {
    spawnY--;
  }
  player.position[1] = spawnY + 1 + 1.62;

  player.attachEvents(canvas);

  // 매 프레임 갱신되는 조준 대상. 하이라이트 렌더링과 클릭 처리가 같은 값을 본다.
  let aimed: RaycastHit | null = null;

  canvas.addEventListener('mousedown', (e) => {
    if (document.pointerLockElement !== canvas) return;

    const hit = aimed;
    if (!hit) return;

    if (e.button === MouseButton.Left) {
      // 좌클릭 = 파괴. y=0은 월드 바닥(베드락 역할)이라 뚫리지 않게 보호
      if (hit.block[1] === 0) return;
      renderer.world.setBlock(hit.block[0], hit.block[1], hit.block[2], BlockType.Air);
      renderer.invalidateChunkAt(hit.block[0], hit.block[2]);
    } else if (e.button === MouseButton.Right) {
      // 우클릭 = 설치. 맞은 면의 법선 방향 한 칸 앞이 설치 위치
      const px = hit.block[0] + hit.normal[0];
      const py = hit.block[1] + hit.normal[1];
      const pz = hit.block[2] + hit.normal[2];
      if (py < 0 || py >= WORLD_HEIGHT) return;
      if (player.occupiesBlock(px, py, pz)) return;
      renderer.world.setBlock(px, py, pz, player.selectedBlock);
      renderer.invalidateChunkAt(px, pz);
    }
  });

  // 우클릭 시 브라우저 컨텍스트 메뉴가 뜨지 않도록 차단
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

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
    const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;

    player.update(dt);
    // 조준 대상은 플레이어가 움직인 뒤에 구해야 이번 프레임 화면과 어긋나지 않는다.
    aimed = raycast(renderer.world, player.position, player.getForward(), REACH);
    renderer.render(player, timestamp / 1000, aimed && aimed.block);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main();
