import { Renderer } from './renderer';
import { Camera } from './camera';
import { isSolid } from './block';

async function main() {
  // HTML의 <canvas id="canvas"> 요소를 가져온다. WebGPU가 이 캔버스에 렌더링한다.
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;

  // 브라우저가 WebGPU를 지원하는지 확인. navigator.gpu가 없으면 지원 안 함.
  // 지원하지 않는 브라우저(구 버전, 일부 모바일 등)에서는 안내 메시지를 보여주고 종료한다.
  if (!navigator.gpu) {
    document.getElementById('no-webgpu')!.style.display = 'block';
    return;
  }

  // Renderer: WebGPU 파이프라인, 셰이더, 월드(청크) 관리 담당
  // Camera: 위치, 시선 방향, 키/마우스 입력 처리 담당
  const renderer = new Renderer();
  const camera = new Camera();

  try {
    // GPU 어댑터/디바이스 요청, 셰이더 컴파일, 텍스처 로딩 등 비동기 초기화 수행
    await renderer.init(canvas);
  } catch (e) {
    // GPU 초기화 실패 시(드라이버 문제, 권한 등) 안내 메시지 표시 후 종료
    document.getElementById('no-webgpu')!.style.display = 'block';
    console.error(e);
    return;
  }

  // 카메라가 블록 충돌/지형 감지를 위해 월드 데이터에 접근할 수 있도록 연결
  camera.world = renderer.world;
  // 카메라 현재 위치(x, z) 주변의 청크를 반경 1로 미리 생성해둔다(스폰 지점 지형 준비).
  renderer.world.generateAround(camera.position[0], camera.position[2], 1);
  // 스폰 X/Z 좌표를 정수로 내려 해당 컬럼(세로 기둥)의 블록을 탐색할 준비
  const spawnX = Math.floor(camera.position[0]);
  const spawnZ = Math.floor(camera.position[2]);
  // 위에서부터 아래로 내려가며 처음 만나는 solid(불투명) 블록의 y를 찾는다.
  // 63은 일반적인 지표면 근처 높이에서 시작하는 값.
  let spawnY = 63;
  while (spawnY > 0 && !isSolid(renderer.world.getBlock(spawnX, spawnY, spawnZ))) {
    spawnY--;
  }
  // 지표면 블록 위(+1)에 발을 딛고, 마인크래프트 플레이어의 눈높이(1.62 블록)만큼 더해서 카메라 y 설정
  camera.position[1] = spawnY + 1 + 1.62; // feet on top of block + eye height

  // 캔버스에 키보드/마우스/포인터락 등 이벤트 리스너를 연결 (FPS 조작)
  camera.attachEvents(canvas);

  // 디바이스 픽셀 비율: 고해상도(레티나) 디스플레이에서 선명하게 렌더링하기 위해 사용
  // 일반 모니터는 1, 레티나/고DPI는 2 이상. devicePixelRatio가 없는 경우 fallback으로 1.
  const dpr = window.devicePixelRatio || 1;
  const resize = () => {
    // CSS 픽셀 크기(clientWidth/Height)에 dpr을 곱해 실제 렌더 버퍼 크기 계산
    // Math.max(1, ...)로 0 이하 방지(GPU 텍스처는 크기 0 불가)
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    // 크기가 실제로 바뀌었을 때만 재설정 (불필요한 GPU 리소스 재할당 방지)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      // 렌더러에게 알려 깊이 버퍼, 프로젝션 행렬(종횡비), 스왑체인 등을 새 크기로 재생성
      renderer.onResize(w, h);
    }
  };
  // ResizeObserver: 캔버스 크기가 변할 때(창 크기 조절, CSS 변경 등) 콜백 호출
  // window.onresize보다 더 정확하게 해당 요소의 크기 변화를 감지한다.
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  // 최초 1회 직접 호출해 초기 캔버스 크기를 설정
  resize();

  // 프레임 간 경과 시간(delta time) 계산을 위한 이전 프레임 타임스탬프
  let lastTime = performance.now();

  // 매 프레임 호출되는 렌더 루프. requestAnimationFrame이 timestamp를 자동 주입한다.
  function frame(timestamp: number) {
    // 이전 프레임과의 시간차(초 단위)를 구해 프레임 독립적 이동/물리 연산에 사용
    // Math.min(..., 0.1)로 최대 0.1초 제한: 탭 비활성화 후 복귀 시 큰 dt로 갑자기 멀리 튀는 것 방지
    const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;

    // 카메라 위치/회전 업데이트 (입력 처리, 중력, 충돌 등)
    camera.update(dt);
    // 현재 카메라 시점으로 월드를 렌더링. timestamp는 셰이더에서 시간 기반 효과(물결 등)용
    renderer.render(camera, timestamp / 1000);
    // 다음 프레임 예약: 브라우저 리프레시레이트(보통 60Hz)에 맞춰 호출됨
    requestAnimationFrame(frame);
  }

  // 첫 프레임 시작
  requestAnimationFrame(frame);
}

main();
