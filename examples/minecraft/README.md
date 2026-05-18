# Minecraft WebGPU

TypeScript + WebGPU로 구현한 미니멀 복셀(Voxel) 지형 렌더러. 외부 엔진(Three.js 등) 없이 WebGPU와 WGSL만으로 절차적 지형 생성과 렌더링을 구현했습니다.

## 기술 스택

- **TypeScript 5.7 + Vite 6**
- **WebGPU + WGSL 셰이더** (Chrome 113+, Edge 113+ 필요)
- 외부 프레임워크 없음 — 수학/노이즈도 직접 구현

## 아키텍처

```
main.ts (진입점)
  ├── Renderer  — WebGPU 파이프라인, 렌더링
  ├── Camera    — 플레이어 이동/물리/입력
  └── World     — 청크 관리, 지형 생성
```

## 핵심 모듈

| 모듈 | 파일 | 책임 |
|------|------|------|
| World/Chunk | [src/world.ts](src/world.ts) | 16×16×64 청크, 지연 생성, `Uint8Array` 저장 |
| Block | [src/block.ts](src/block.ts) | 블록 타입 enum, 색상/투명도 |
| Renderer | [src/renderer.ts](src/renderer.ts) | WebGPU 파이프라인(블록용 + 하늘용), uniform, 렌더 패스 |
| Camera | [src/camera.ts](src/camera.ts) | WASD/마우스 룩, 중력/점프, 뷰·투영 행렬 |
| Noise | [src/noise.ts](src/noise.ts) | Perlin 2D noise + FBM(5 octaves) |
| Shaders | [src/shaders.ts](src/shaders.ts) | WGSL 버텍스/프래그먼트 셰이더 |
| Math | [src/math.ts](src/math.ts) | Vec3, Mat4 유틸리티 |

## 지형 생성

- **FBM(Fractal Brownian Motion)** 5 옥타브로 높이맵 생성
- 해수면 Y=20 기준 ±18 블록 범위
- 고도별 블록 할당
  - 바닥(Y=0): Stone (bedrock)
  - 중간 층: Dirt
  - 상단: Grass(중간 고도), Sand(해수면), Snow(고도 >32)
- **나무**는 Grass 위에 2% 확률로 시드 기반 랜덤 배치
- 시드 기반이라 같은 좌표는 항상 같은 지형

## 렌더링

- **2개 파이프라인**
  - 블록 파이프라인: 깊이 테스트 O, 백페이스 컬링
  - 하늘 파이프라인: 전체 화면 쿼드, 깊이 쓰기 X
- **버텍스 포맷 36바이트**: position(3) + normal(3) + color(3)
- **Face culling**: 인접 블록이 solid면 해당 면 스킵 (성능 최적화)
- **조명**: 방향성 태양광(정규화 벡터 [0.4, 0.8, 0.3]) + ambient 35% + exponential fog(밀도 0.008)
- 플레이어가 이동하면 4청크 반경 내의 청크만 렌더

### Global Uniforms (128 bytes)

- View-projection 행렬 (64 bytes)
- 카메라 위치 (12 + 4 pad)
- 태양 방향 (12 + 4 pad)
- Fog 색상 (12) + 밀도 (4)

## 플레이어 & 물리

- **이동**: WASD (수평 6 u/s), Space (점프), Shift (비행 모드)
- **마우스 룩**: Pointer Lock API, 감도 0.002 rad/pixel
- **중력**: 24 u/s², 점프 초속 9 u/s, 시야 높이 1.62
- **충돌**: 바닥만 감지 (수평 벽 충돌 없음 — 단순화)

## 주요 설계 결정

1. **WebGPU 전용** — WebGL fallback 없음
2. **블록 수정 불가** — 읽기 전용 지형
3. **텍스처 없음** — 면별 RGB 색상으로만 표현
4. **외부 의존성 최소화** — 수학/노이즈 모두 직접 구현
5. **청크 생성은 lazy** — 플레이어 이동에 따라 필요한 것만 생성
6. **Uint8Array로 블록 저장** — 청크당 ~64KB로 메모리 효율적

## 실행

```bash
npm install
npm run dev
```

브라우저에서 표시된 주소로 접속한 후 캔버스를 클릭하면 마우스 포인터가 잠기며 조작이 시작됩니다.

## 조작법

| 키 | 동작 |
|----|------|
| WASD | 이동 |
| Space | 점프 |
| Shift | 비행 모드 |
| Mouse | 시점 회전 |
| ESC | 포인터 잠금 해제 |

## TODO

- [ ] 물 블록 추가 (반투명 블록으로 구현 — 별도 렌더 패스 + alpha blending)
