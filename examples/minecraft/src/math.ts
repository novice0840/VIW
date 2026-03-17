export type Mat4 = Float32Array;
export type Vec3 = [number, number, number];

export const vec3 = {
  add(a: Vec3, b: Vec3): Vec3 {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  },
  sub(a: Vec3, b: Vec3): Vec3 {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  },
  scale(v: Vec3, s: number): Vec3 {
    return [v[0] * s, v[1] * s, v[2] * s];
  },
  normalize(v: Vec3): Vec3 {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    if (len === 0) return [0, 0, 0];
    return [v[0] / len, v[1] / len, v[2] / len];
  },
  cross(a: Vec3, b: Vec3): Vec3 {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  },
  dot(a: Vec3, b: Vec3): number {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  },
};

export const mat4 = {
  identity(): Mat4 {
    const m = new Float32Array(16);
    m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
    return m;
  },

  perspective(fov: number, aspect: number, near: number, far: number): Mat4 {
    const m = new Float32Array(16);
    const f = 1.0 / Math.tan(fov / 2);
    const rangeInv = 1.0 / (near - far);
    m[0] = f / aspect;
    m[5] = f;
    m[10] = far * rangeInv;
    m[11] = -1;
    m[14] = near * far * rangeInv;
    return m;
  },

  lookAt(eye: Vec3, center: Vec3, up: Vec3): Mat4 {
    const zx = eye[0] - center[0];
    const zy = eye[1] - center[1];
    const zz = eye[2] - center[2];
    let len = 1 / Math.sqrt(zx * zx + zy * zy + zz * zz);
    const fz: Vec3 = [zx * len, zy * len, zz * len];

    const xx = up[1] * fz[2] - up[2] * fz[1];
    const xy = up[2] * fz[0] - up[0] * fz[2];
    const xz = up[0] * fz[1] - up[1] * fz[0];
    len = 1 / Math.sqrt(xx * xx + xy * xy + xz * xz);
    const fx: Vec3 = [xx * len, xy * len, xz * len];

    const fy: Vec3 = [
      fz[1] * fx[2] - fz[2] * fx[1],
      fz[2] * fx[0] - fz[0] * fx[2],
      fz[0] * fx[1] - fz[1] * fx[0],
    ];

    const m = new Float32Array(16);
    m[0] = fx[0]; m[1] = fy[0]; m[2] = fz[0]; m[3] = 0;
    m[4] = fx[1]; m[5] = fy[1]; m[6] = fz[1]; m[7] = 0;
    m[8] = fx[2]; m[9] = fy[2]; m[10] = fz[2]; m[11] = 0;
    m[12] = -(fx[0] * eye[0] + fx[1] * eye[1] + fx[2] * eye[2]);
    m[13] = -(fy[0] * eye[0] + fy[1] * eye[1] + fy[2] * eye[2]);
    m[14] = -(fz[0] * eye[0] + fz[1] * eye[1] + fz[2] * eye[2]);
    m[15] = 1;
    return m;
  },

  multiply(a: Mat4, b: Mat4): Mat4 {
    const m = new Float32Array(16);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        m[j * 4 + i] =
          a[i] * b[j * 4] +
          a[4 + i] * b[j * 4 + 1] +
          a[8 + i] * b[j * 4 + 2] +
          a[12 + i] * b[j * 4 + 3];
      }
    }
    return m;
  },
};
