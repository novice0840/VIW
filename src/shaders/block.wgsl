// 학습 노트 
// WGSL 타입별 정렬 (전체)
// 타입	크기(size)	정렬(align)
// f32, i32, u32	4	4
// vec2<f32>	8	8
// vec3<f32>	12	16 ⚠️
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

@group(0) @binding(0) var<uniform> global : GlobalUniforms;

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

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  out.clipPos  = global.viewProj * vec4<f32>(in.position, 1.0);
  out.worldPos = in.position;
  out.normal   = in.normal;
  out.color    = in.color;
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  // Directional light (sun)
  let nDotL = max(dot(in.normal, global.sunDir), 0.0);
  let ambient = 0.35;
  let diffuse = nDotL * 0.65;
  let lighting = ambient + diffuse;

  var color = in.color * lighting;

  // Distance fog
  let dist = distance(in.worldPos, global.cameraPos);
  let fogFactor = 1.0 - exp(-dist * global.fogDensity * dist * global.fogDensity);
  let fog = clamp(fogFactor, 0.0, 1.0);
  color = mix(color, global.fogColor, fog);

  return vec4<f32>(color, 1.0);
}
