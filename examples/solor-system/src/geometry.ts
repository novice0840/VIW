export interface Mesh {
  vertices: Float32Array;
  indices: Uint16Array;
}

export function generateSphere(latBands: number, longBands: number): Mesh {
  const verts: number[] = [];
  const idxs: number[] = [];

  for (let lat = 0; lat <= latBands; lat++) {
    // 위에서 아래로의 각도 (0 ~ PI)
    const theta = (lat * Math.PI) / latBands;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);

    for (let lon = 0; lon <= longBands; lon++) {
      // 왼쪽에서 오른쪽으로의 각도 (0 ~ 2PI)
      const phi = (lon * 2 * Math.PI) / longBands;
      // 위에서 바라보았을 때 반지름이 sinT이므로
      // 반지름 * cos(phi) = x
      const x = sinT * Math.cos(phi);
      // y는 lon에 영향을 받지 않고 위에서 아래로만 변함
      const y = cosT;
      // 반지름 * sin(phi) = z
      const z = sinT * Math.sin(phi);
      const u = lon / longBands;
      const v = lat / latBands;

      // position + normal + uv
      verts.push(x, y, z, x, y, z, u, v);
    }
  }

  for (let lat = 0; lat < latBands; lat++) {
    for (let lon = 0; lon < longBands; lon++) {
      const first = lat * (longBands + 1) + lon;
      const second = first + longBands + 1;
      // 6개 = 삼각형 2개 = 사각형 1개
      // 각 숫자는 정점의 인덱스를 의미함
      // 예) 정점 0번 = verts[0..7] (8개 요소: position(3) + normal(3) + uv(2))
      idxs.push(first, first + 1, second);
      idxs.push(second, first + 1, second + 1);
    }
  }

  return {
    vertices: new Float32Array(verts),
    indices: new Uint16Array(idxs),
  };
}

export function generateRing(innerR: number, outerR: number, segments: number): Mesh {
  const verts: number[] = [];
  const idxs: number[] = [];

  // verts에서는 y값이 0으로 고정되어 있음 (x,z 평면에 놓임)
  // 실제 렌더링에서 기울기에 있는 이유는 renderer에서 행렬로 회전하기 때문
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // inner vertex: position(3) + uv(2)
    verts.push(cos * innerR, 0, sin * innerR, 0, i / segments);
    // outer vertex
    verts.push(cos * outerR, 0, sin * outerR, 1, i / segments);
  }

  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    idxs.push(a, c, b);
    idxs.push(b, c, d);
  }

  return {
    vertices: new Float32Array(verts),
    indices: new Uint16Array(idxs),
  };
}

export function generateOrbitLine(radius: number, segments: number): Float32Array {
  const verts: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    verts.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  }
  return new Float32Array(verts);
}

export interface StarData {
  instances: Float32Array; // per-star: center(3) + color(3) + size(1)
  count: number;
}

export function generateStars(count: number): StarData {
  const data: number[] = [];
  for (let i = 0; i < count; i++) {
    // random point on sphere shell at radius 250-400
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 250 + Math.random() * 150;
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);

    // slight color variation (white/blue/yellow)
    const tint = Math.random();
    let cr: number, cg: number, cb: number;
    if (tint < 0.33) {
      cr = 0.8 + Math.random() * 0.2;
      cg = 0.8 + Math.random() * 0.2;
      cb = 1.0;
    } else if (tint < 0.66) {
      cr = 1.0;
      cg = 1.0;
      cb = 0.7 + Math.random() * 0.3;
    } else {
      cr = 1.0;
      cg = 1.0;
      cb = 1.0;
    }

    const size = 0.3 + Math.random() * 0.7;

    data.push(x, y, z, cr, cg, cb, size);
  }

  return { instances: new Float32Array(data), count };
}
