import { Renderer } from './renderer';
import { Camera } from './camera';
import { BlockType, isSolid } from './block';
import { raycast } from './raycast';
import { WORLD_HEIGHT } from './world';

// 블록을 조준할 수 있는 최대 거리 (마인크래프트의 손 닿는 거리 ≈ 4.5~5블록)
const REACH = 6;
// 플레이어 키 — 설치할 블록이 몸과 겹치는지 검사할 때 사용
const PLAYER_HEIGHT = 1.8;

async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;

  if (!navigator.gpu) {
    document.getElementById('no-webgpu')!.style.display = 'block';
    return;
  }

  // WebGPU API를 직접 다루며 화면에 세계를 그리는 역할
  const renderer = new Renderer();
  // 1인칭 시점 카메라이자 플레이어 물리 엔진 역할을 동시에 담당
  const camera = new Camera();

  try {
    await renderer.init(canvas);
  } catch (e) {
    document.getElementById('no-webgpu')!.style.display = 'block';
    console.error(e);
    return;
  }

  camera.world = renderer.world;
  renderer.world.generateAround(camera.position[0], camera.position[2], 1);
  const spawnX = Math.floor(camera.position[0]);
  const spawnZ = Math.floor(camera.position[2]);
  let spawnY = 63;
  while (spawnY > 0 && !isSolid(renderer.world.getBlock(spawnX, spawnY, spawnZ))) {
    spawnY--;
  }
  camera.position[1] = spawnY + 1 + 1.62;

  camera.attachEvents(canvas);

  // 설치하려는 블록 칸이 플레이어 몸과 겹치는지 검사
  // 이 게임은 수평 충돌이 없어 플레이어를 발~머리 구간의 세로 기둥으로 취급한다
  const overlapsPlayer = (bx: number, by: number, bz: number): boolean => {
    const feetY = camera.position[1] - camera.eyeHeight;
    return (
      bx === Math.floor(camera.position[0]) &&
      bz === Math.floor(camera.position[2]) &&
      by < feetY + PLAYER_HEIGHT && // 블록 아랫면이 머리보다 낮고
      by + 1 > feetY // 블록 윗면이 발보다 높으면 겹침
    );
  };

  canvas.addEventListener('mousedown', (e) => {
    if (document.pointerLockElement !== canvas) return;

    const hit = raycast(renderer.world, camera.position, camera.getForward(), REACH);
    if (!hit) return;

    if (e.button === 0) {
      // 좌클릭 = 파괴. y=0은 월드 바닥(베드락 역할)이라 뚫리지 않게 보호
      if (hit.block[1] === 0) return;
      renderer.world.setBlock(hit.block[0], hit.block[1], hit.block[2], BlockType.Air);
      renderer.invalidateChunkAt(hit.block[0], hit.block[2]);
    } else if (e.button === 2) {
      // 우클릭 = 설치. 맞은 면의 법선 방향 한 칸 앞이 설치 위치
      const px = hit.block[0] + hit.normal[0];
      const py = hit.block[1] + hit.normal[1];
      const pz = hit.block[2] + hit.normal[2];
      if (py < 0 || py >= WORLD_HEIGHT) return;
      if (overlapsPlayer(px, py, pz)) return;
      renderer.world.setBlock(px, py, pz, BlockType.Stone);
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

    camera.update(dt);
    renderer.render(camera, timestamp / 1000);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main();
