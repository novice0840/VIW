export const BLOCK_WGSL = /* wgsl */ `
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
`;

export const SKY_WGSL = /* wgsl */ `
struct VertexOutput {
  @builtin(position) clipPos : vec4<f32>,
  @location(0)       uv      : vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vIdx: u32) -> VertexOutput {
  // Full-screen triangle
  var pos = array<vec2<f32>, 3>(
    vec2(-1.0, -1.0),
    vec2( 3.0, -1.0),
    vec2(-1.0,  3.0)
  );
  var out: VertexOutput;
  out.clipPos = vec4<f32>(pos[vIdx], 0.9999, 1.0);
  out.uv = pos[vIdx] * 0.5 + 0.5;
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let topColor = vec3<f32>(0.40, 0.60, 0.92);
  let bottomColor = vec3<f32>(0.70, 0.82, 0.95);
  let t = in.uv.y;
  let color = mix(bottomColor, topColor, t);
  return vec4<f32>(color, 1.0);
}
`;
