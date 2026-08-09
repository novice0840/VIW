// 조준 중인 블록의 외곽선(와이어프레임)을 그리는 셰이더.
//
// block.wgsl과 달리 조명·안개를 적용하지 않는다. 하이라이트는 세계의 일부가 아니라
// "지금 이 블록을 조준 중"이라는 UI 신호라서, 거리가 멀어져도 흐려지면 안 된다.

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

@vertex
fn vs_main(@location(0) position : vec3<f32>) -> @builtin(position) vec4<f32> {
  return global.viewProj * vec4<f32>(position, 1.0);
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
  return vec4<f32>(0.0, 0.0, 0.0, 1.0);
}
