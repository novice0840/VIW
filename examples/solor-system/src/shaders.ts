export const SPHERE_WGSL = /* wgsl */ `
// GlobalUniform -> 1개 (모든 오브젝트가 공유)
// 프레임 당 한 번 세팅:
// 카메라, 시간 등 → 모든 오브젝트에 동일
// pass.setBindGroup(0, globalBindGroup);  // 한 번
struct GlobalUniforms {
  viewProj    : mat4x4<f32>, // 뷰 행렬 x 프로젝션 행렬
  cameraPos   : vec3<f32>, // 카메라 월드 좌표 (조명 계산용)
  _pad0       : f32, 
  cameraRight : vec3<f32>, // 카메라 오른쪽 방향 (빌보드용) * 빌보드란?: 항상 카메라를 향하도록 회전하는 오브젝트
  _pad1       : f32,
  cameraUp    : vec3<f32>, // 카메라 위쪽 방향 (빌보드용)
  _pad2       : f32,
};

// ObjectUniform -> 오브젝트 수만큼 (태양 1개 + 행성 8개 + 링 1 = 10개)
// pass.setBindGroup(1, objectBindGroups[0]);  // 태양
// pass.drawIndexed(...);
// pass.setBindGroup(1, objectBindGroups[1]);  // 수성
// pass.drawIndexed(...);
// pass.setBindGroup(1, objectBindGroups[2]);  // 금성
// pass.drawIndexed(...);
// ...
struct ObjectUniforms {
  model     : mat4x4<f32>,
  color     : vec3<f32>,
  emissive  : f32,
  glowColor : vec3<f32>,
  _pad      : f32,
};

// 한 프레임에서 실제 변경 횟수 
// group(0): per-frame (카메라 관련), group(1): per-object (모델 행렬, 색상 등)

// binding에 들어갈 수 있는 리소스 타입
// 타입 / 용도 / 예시 
// GPUBuffer / 유니폼,스토리지 데이터 / 행렬, 색상, 시간
// GPUTextureView / 텍스쳐 이미지 / 행성 표면 이미지 
// GPUSampler / 텍스쳐 샘플링 설정 / 필터링, 반복 모드
// 현재 프로젝트는 GPUBuffer만 사용중

// GPUBuffer vs uniform
// var<uniform> - WGSL(셰이더) 측 선언
// GPU 메모리 공간의 용도를 지정합니다:
// WGSL 선언 / 의미 / 특징 
// var<uniform> / 읽기 전용, 작은 데이터 / 행렬, 색상 등 
// var<storage> / 읽기/쓰기 가능, 큰 데이터 / 파티클, 대량 데이터
// var(텍스쳐) / 텍스쳐/샘플러 / var texture: texture_2d<f32>
// GPUBuffer - JavaScript(CPU) 측 객체
// GPU 메모리를 할당하는 컨테이너입니다. usage 플래그를 용도로 지정
// * 셰이더(WSGL)에서는 GPUBuffer라는 개념 자체가 존재하지 않는다 
@group(0) @binding(0) var<uniform> global : GlobalUniforms;
@group(1) @binding(0) var<uniform> obj    : ObjectUniforms;

// @location(n)은 버텍스 버퍼에서 데이터를 어느 슬롯으로 받을지 지정하는 번호
// 주의: position에는 행성의 중점이 아닌 행성 표면의 정점 좌표가 들어있음 (즉, 로컬 좌표계에서의 위치)
struct VertexInput {
  @location(0) position : vec3<f32>,
  @location(1) normal   : vec3<f32>,
};

// @builtin(position)은 GPU가 미리 정해놓은 특별한 슬롯으로, 클립 공간 좌표를 전달하는 용도입니다. 
// vertex shader에서 반드시 출력해야 하는 값으로, GPU가 이 값을 보고 화면의 어느 픽셀에 그릴지 결정합니다. 

// 클립 좌표계:
// - (0, 0) -> 화면 정중앙
// - (-1, -1) -> 왼쪽 아래 
// - (1, 1) -> 오른쪽 위
// z값: 
// - 0 -> near plane (카메라 바로 앞)
// - 1 -> far plane (가장 멀리)
// w값: 
// - 원근 투영을 위해 존재 
// - GPU가 최종적으로 x/w, y/w, z/w를 계산해서 실제 화면 좌표로 변환 (Perspective Divide)
struct VertexOutput {
  @builtin(position) clipPos  : vec4<f32>, // GPU가 화면에 그리는데 사용
  @location(0)       worldPos : vec3<f32>, // fragment shader에서 조명 계산에 사용
  @location(1)       normal   : vec3<f32>, // normal (법선 벡터: 정점에서 표면의 향하는 방향을 나타내는 벡터입니다. 조명 계산에 사용됩니다.)
};

// 좌표 변환 3단계
// 로컬 좌표 (position)
//  ↓ × 모델 행렬
// 월드 좌표 (worldPos)
//  ↓ × 뷰프로젝션 행렬
// 클립 좌표 (clipPos)
@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  let worldPos = (obj.model * vec4<f32>(in.position, 1.0)).xyz;
  out.clipPos  = global.viewProj * vec4<f32>(worldPos, 1.0);
  out.worldPos = worldPos;
  out.normal   = normalize((obj.model * vec4<f32>(in.normal, 0.0)).xyz);
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let lightDir = normalize(-in.worldPos);
  let diffuse  = max(dot(in.normal, lightDir), 0.08);

  let litColor   = obj.color * diffuse;
  let finalColor = mix(litColor, obj.color, obj.emissive);

  let viewDir = normalize(global.cameraPos - in.worldPos);
  let rim     = 1.0 - max(dot(in.normal, viewDir), 0.0);
  let rimGlow = obj.glowColor * pow(rim, 3.0) * obj.emissive * 2.0;

  return vec4<f32>(finalColor + rimGlow, 1.0);
}
`;

export const ORBIT_WGSL = /* wgsl */ `
struct GlobalUniforms {
  viewProj    : mat4x4<f32>,
  cameraPos   : vec3<f32>,
  _pad0       : f32,
  cameraRight : vec3<f32>,
  _pad1       : f32,
  cameraUp    : vec3<f32>,
  _pad2       : f32,
};

@group(0) @binding(0) var<uniform> global : GlobalUniforms;

struct VertexOutput {
  @builtin(position) clipPos : vec4<f32>,
};

@vertex
fn vs_main(@location(0) pos: vec3<f32>) -> VertexOutput {
  var out: VertexOutput;
  out.clipPos = global.viewProj * vec4<f32>(pos, 1.0);
  return out;
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
  return vec4<f32>(0.3, 0.3, 0.5, 0.3);
}
`;

export const RING_WGSL = /* wgsl */ `
struct GlobalUniforms {
  viewProj    : mat4x4<f32>,
  cameraPos   : vec3<f32>,
  _pad0       : f32,
  cameraRight : vec3<f32>,
  _pad1       : f32,
  cameraUp    : vec3<f32>,
  _pad2       : f32,
};

struct ObjectUniforms {
  model     : mat4x4<f32>,
  color     : vec3<f32>,
  emissive  : f32,
  glowColor : vec3<f32>,
  _pad      : f32,
};

@group(0) @binding(0) var<uniform> global : GlobalUniforms;
@group(1) @binding(0) var<uniform> obj    : ObjectUniforms;

struct VertexInput {
  @location(0) position : vec3<f32>,
  @location(1) uv       : vec2<f32>,
};

struct VertexOutput {
  @builtin(position) clipPos : vec4<f32>,
  @location(0)       uv      : vec2<f32>,
  @location(1)       worldPos: vec3<f32>,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  let worldPos = (obj.model * vec4<f32>(in.position, 1.0)).xyz;
  out.clipPos  = global.viewProj * vec4<f32>(worldPos, 1.0);
  out.uv       = in.uv;
  out.worldPos = worldPos;
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let alpha = obj.color.x
            * smoothstep(0.0, 0.15, in.uv.x)
            * smoothstep(1.0, 0.85, in.uv.x);
  let band  = 0.5 + 0.5 * sin(in.uv.x * 50.0);
  let color = vec3<f32>(0.85, 0.75, 0.55) * (0.7 + 0.3 * band);

  let lightDir = normalize(-in.worldPos);
  let lit = max(dot(vec3<f32>(0.0, 1.0, 0.0), lightDir), 0.15);

  return vec4<f32>(color * lit, alpha * 0.7);
}
`;

export const STAR_WGSL = /* wgsl */ `
struct GlobalUniforms {
  viewProj    : mat4x4<f32>,
  cameraPos   : vec3<f32>,
  _pad0       : f32,
  cameraRight : vec3<f32>,
  _pad1       : f32,
  cameraUp    : vec3<f32>,
  _pad2       : f32,
};

struct VertexInput {
  @location(0) center : vec3<f32>,
  @location(1) color  : vec3<f32>,
  @location(2) size   : f32,
};

struct VertexOutput {
  @builtin(position) clipPos : vec4<f32>,
  @location(0)       uv      : vec2<f32>,
  @location(1)       color   : vec3<f32>,
};

@group(0) @binding(0) var<uniform> global : GlobalUniforms;

const QUAD_POS = array<vec2<f32>, 6>(
  vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(1.0, 1.0),
  vec2(-1.0, -1.0), vec2(1.0, 1.0),  vec2(-1.0, 1.0)
);

@vertex
fn vs_main(in: VertexInput, @builtin(vertex_index) vIdx: u32) -> VertexOutput {
  var out: VertexOutput;
  let offset = QUAD_POS[vIdx % 6u];
  let worldPos = in.center
               + global.cameraRight * offset.x * in.size
               + global.cameraUp    * offset.y * in.size;
  out.clipPos = global.viewProj * vec4<f32>(worldPos, 1.0);
  out.uv      = offset * 0.5 + 0.5;
  out.color   = in.color;
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let dist = length(in.uv - vec2<f32>(0.5));
  if (dist > 0.5) { discard; }
  let alpha = 1.0 - smoothstep(0.1, 0.5, dist);
  return vec4<f32>(in.color * alpha, alpha);
}
`;
