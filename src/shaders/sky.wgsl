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
