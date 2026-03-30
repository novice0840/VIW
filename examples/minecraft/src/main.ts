import { Renderer } from './renderer';
import { Camera } from './camera';
import { isSolid } from './block';

async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;

  if (!navigator.gpu) {
    document.getElementById('no-webgpu')!.style.display = 'block';
    return;
  }

  const renderer = new Renderer();
  const camera = new Camera();

  try {
    await renderer.init(canvas);
  } catch (e) {
    document.getElementById('no-webgpu')!.style.display = 'block';
    console.error(e);
    return;
  }

  // Link world to camera and spawn on terrain
  camera.world = renderer.world;
  renderer.world.generateAround(camera.position[0], camera.position[2], 1);
  const spawnX = Math.floor(camera.position[0]);
  const spawnZ = Math.floor(camera.position[2]);
  let spawnY = 63;
  while (spawnY > 0 && !isSolid(renderer.world.getBlock(spawnX, spawnY, spawnZ))) {
    spawnY--;
  }
  camera.position[1] = spawnY + 1 + 1.62; // feet on top of block + eye height

  camera.attachEvents(canvas);

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
