import { mat4, vec3, type Vec3 } from './math';

export class Camera {
  position: Vec3 = [32, 50, 32];
  yaw = 0;
  pitch = 0;

  private readonly fov = Math.PI / 3;
  private readonly near = 0.1;
  private readonly far = 300;
  private readonly speed = 12;
  private readonly sensitivity = 0.002;

  private keys = new Set<string>();
  private locked = false;

  getForward(): Vec3 {
    return [
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    ];
  }

  getRight(): Vec3 {
    return [Math.cos(this.yaw), 0, -Math.sin(this.yaw)];
  }

  getViewMatrix() {
    const forward = this.getForward();
    const target = vec3.add(this.position, forward);
    return mat4.lookAt(this.position, target, [0, 1, 0]);
  }

  getProjectionMatrix(aspect: number) {
    return mat4.perspective(this.fov, aspect, this.near, this.far);
  }

  update(dt: number) {
    if (!this.locked) return;

    const forward: Vec3 = [-Math.sin(this.yaw), 0, -Math.cos(this.yaw)];
    const right = this.getRight();
    let move: Vec3 = [0, 0, 0];

    if (this.keys.has('w')) move = vec3.add(move, forward);
    if (this.keys.has('s')) move = vec3.sub(move, forward);
    if (this.keys.has('d')) move = vec3.add(move, right);
    if (this.keys.has('a')) move = vec3.sub(move, right);
    if (this.keys.has(' ')) move[1] += 1;
    if (this.keys.has('shift')) move[1] -= 1;

    const len = Math.sqrt(move[0] * move[0] + move[1] * move[1] + move[2] * move[2]);
    if (len > 0) {
      move = vec3.scale(move, this.speed * dt / len);
      this.position = vec3.add(this.position, move);
    }
  }

  attachEvents(canvas: HTMLCanvasElement) {
    canvas.addEventListener('click', () => {
      canvas.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch = Math.max(
        -Math.PI / 2 + 0.01,
        Math.min(Math.PI / 2 - 0.01, this.pitch - e.movementY * this.sensitivity),
      );
    });

    document.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
    });

    document.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
  }
}
