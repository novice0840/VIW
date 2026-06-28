// 학습 노트 
// WGSL 타입별 정렬 (전체)
// 타입	크기(size)	정렬(align)
// f32, i32, u32	4	4
// vec2<f32>	8	8
// vec3<f32>	12	16
// vec4<f32>	16	16
// mat2x2<f32>	16	8
// mat3x3<f32>	48	16
// mat4x4<f32>	64	16
// * 특히나 vec3<f32>의 경우 크기가 정렬의 배수가 아니기 때문에 추기적인 padding을 넣어줘야 하는 경우가 자주 발생한다 

struct GlobalUniforms {
  viewProj  : mat4x4<f32>,
  cameraPos : vec3<f32>,
  _pad0     : f32,
  sunDir    : vec3<f32>,
  _pad1     : f32,
  fogColor  : vec3<f32>,
  fogDensity: f32,
};

// 학습 노트 
// - 큰 틀: struct ≈ interface, global ≈ 변수 ✅ (맞는 직관)
// - 미세 차이: global은 값을 담은 게 아니라 JS가 채운 GPU 버퍼를 가리키는 읽기 전용 핸들
// - @group/@binding = JS의 버퍼와 셰이더의 global을 이어주는 주소

// Global/binding
// 1. 구조 
// @group(0) @binding(0) -> 0번 그룹의 0번 슬롯
// group 0  ┬─ binding 0  (global 유니폼)   ← 지금 쓰는 곳
//          ├─ binding 1  (예: 텍스처)
//          └─ binding 2  (예: 샘플러)
// group 1  ┬─ binding 0
//          └─ binding 1
// ...
// 한 group 안에는 binding이 여러 개 들어갈 수 있음

// 왜 굳이 gruop으로 나누나? (실무 관례)
// 개수 제한 때문이기도 하지만, 갱신 빈도별로 묶으려고 나눠요. 이게 성능 핵심이에요. 
// group 0 -> per-frame (카메라, 시간 - 프레임당 1번 갱신) 
// group 1 -> per-material (텍스쳐 - 재질 바뀔 때만)
// group 2 -> per-object (오브젝트 위치 - 물체마다)

// @group(0) @binding(0)  var<uniform>  global : GlobalUniforms;
// └── 어디에(주소) ──┘   └─ 무엇으로 ─┘  └이름┘   └─ 타입 ─┘
 
// 부분	역할
// @group(0) @binding(0)	위치 (JS와 연결될 슬롯)
// var<uniform>	종류: 읽기 전용 + 작고 빠른 상수 데이터
// global	셰이더 안에서 부를 이름
// GlobalUniforms	데이터 모양(struct)
// uniform vs 다른 종류 (핵심)
// var<...> 자리에 올 수 있는 종류가 여러 개예요. 이게 uniform이 뭔지 가장 잘 보여줘요:

// 종류	특징	용도
// var<uniform>	읽기 전용, 작음(~64KB), 빠름	카메라, 시간, 조명 ← 지금 이거
// var<storage, read>	읽기 전용, 큼(~128MB)	수만 개 블록 데이터
// var<storage, read_write>	읽기+쓰기	컴퓨트 셰이더 결과
// 즉 uniform이라는 단어 자체가 "모든 정점/픽셀에 동일하게(uniform) 주어지는, 작고 읽기 전용인 데이터"라는 뜻이에요. 그래서 이름이 uniform이에요 — "균일하다".

@group(0) @binding(0) var<uniform> global : GlobalUniforms;

// @location vs @builtin
// 이 둘은 struct 멤버가 어디서 오는/가는 데이터인지를 지정해요
// @location(N) - 내가 직접 정의하는 데이터 통로 
// ex) @location(0) position : vec3<f32> 
// - 번호로 식별되는 사용자 정의 슬록이에요
// - vertex 입력에선 -> JS의 vertex buffer 레이아웃의 shaderLocation:0 과 연결 
// - stage 간 전달 (vertex -> fragment)에서 -> 같은 @location 번호끼리 자동 연결 

// @builtin(name) - GPU가 자동으로 채워주는 특수 데이터 
// @builtin(position) clipPos : vec4<f32>
// builtin에 들어올 수 있는 값 
// position, vertex_index, instance_index, front_facing, frag_depth

struct VertexInput {
  @location(0) position : vec3<f32>,
  @location(1) normal   : vec3<f32>,
  @location(2) color    : vec3<f32>,
};

struct VertexOutput {
  @builtin(position) clipPos  : vec4<f32>,
  @location(0)       worldPos : vec3<f32>,
  @location(1)       normal   : vec3<f32>,
  @location(2)       color    : vec3<f32>,
};

// 학습 노트 
// vertex shader function
// 정점(vertex) 1개마다 1번씩 실행되어, 그 정점의 위치를 화면 좌표로 변환하는 함수 
// 언제 실행: 정점 1개당 1번 
// 입력(input): VertexInput - JS가 버퍼로 넣어준 position/normal/color
// 출력(output): VertexOutput - 변환된 좌표 + fragment로 넘길 데이터 
// 개수: draw call 1개당 1개 함수만 실행 

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  // 월드 좌표: 게임 세계 안에서의 실제 위치 
  // 클립 좌표: 화면에 그리기 위해 카메라 시점으로 변환된 위치 
  out.clipPos  = global.viewProj * vec4<f32>(in.position, 1.0);
  out.worldPos = in.position;
  out.normal   = in.normal;
  out.color    = in.color;
  return out;
}

// 학습 노트 
// fragment shader function 
// 픽셀(fragment) 1개마다 1번씩 실행되어, 그 픽셀의 최종 색을 결정하는 함수
// 	vertex shader	vs fragment shader
// 실행 단위	정점 1개당	vs 픽셀 1개당
// 실행 횟수	정점 36개면 36번	vs 화면 픽셀 수만큼 (수만~수백만 번)
// 책임	점을 어디에 찍을지 (위치)	vs 점을 무슨 색으로 칠할지 (색)
// 출력	화면 좌표	vs 최종 색 vec4(r,g,b,a)

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  // Directional light (sun)
  let nDotL = max(dot(in.normal, global.sunDir), 0.0);
  let ambient = 0.35;
  let diffuse = nDotL * 0.65;
  let lighting = ambient + diffuse;

  var color = in.color * lighting;


  // Distance fog
  // distance, exp, clamp, mix는 WGSL의 내장 빌트인 함수 
  let dist = distance(in.worldPos, global.cameraPos);
  let fogFactor = 1.0 - exp(-dist * global.fogDensity * dist * global.fogDensity);
  let fog = clamp(fogFactor, 0.0, 1.0);
  color = mix(color, global.fogColor, fog);


  return vec4<f32>(color, 1.0);
}
