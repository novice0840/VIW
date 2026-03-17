export const SPHERE_WGSL = /* wgsl */ `
struct GlobalUniforms {
  viewProj    : mat4x4<f32>,
  cameraPos   : vec3<f32>,
  _pad0       : f32,
  cameraRight : vec3<f32>,
  _pad1       : f32,
  cameraUp    : vec3<f32>,
  _pad2       : f32,
  time        : f32,
  _pad3       : f32,
  _pad4       : f32,
  _pad5       : f32,
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
  @location(1) normal   : vec3<f32>,
  @location(2) uv       : vec2<f32>,
};

struct VertexOutput {
  @builtin(position) clipPos  : vec4<f32>,
  @location(0)       worldPos : vec3<f32>,
  @location(1)       normal   : vec3<f32>,
  @location(2)       uv       : vec2<f32>,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  let worldPos = (obj.model * vec4<f32>(in.position, 1.0)).xyz;
  out.clipPos  = global.viewProj * vec4<f32>(worldPos, 1.0);
  out.worldPos = worldPos;
  out.normal   = normalize((obj.model * vec4<f32>(in.normal, 0.0)).xyz);
  out.uv       = in.uv;
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
  time        : f32,
  _pad3       : f32,
  _pad4       : f32,
  _pad5       : f32,
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
  time        : f32,
  _pad3       : f32,
  _pad4       : f32,
  _pad5       : f32,
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
  time        : f32,
  _pad3       : f32,
  _pad4       : f32,
  _pad5       : f32,
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
