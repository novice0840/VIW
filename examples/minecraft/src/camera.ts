import { mat4, vec3, type Vec3 } from './math';
import { isSolid } from './block';
import { World } from './world';

export class Camera {
  position: Vec3 = [32, 50, 32];
  yaw = 0;
  pitch = 0;

  private readonly fov = Math.PI / 3;
  private readonly near = 0.1;
  private readonly far = 300;
  private readonly speed = 6;
  private readonly sensitivity = 0.002;
  private readonly gravity = 24;
  private readonly jumpSpeed = 9;
  private readonly eyeHeight = 1.62;

  private velocityY = 0;
  private onGround = false;
  private keys = new Set<string>();
  private locked = false;
  world: World | null = null;

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

  private isSolidAt(x: number, y: number, z: number): boolean {
    if (!this.world) return false;
    return isSolid(this.world.getBlock(x, y, z));
  }

  private groundHeight(x: number, z: number, startY: number): number {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    for (let y = Math.floor(startY); y >= 0; y--) {
      if (this.isSolidAt(bx, y, bz)) return y + 1;
    }
    return 0;
  }

  update(dt: number) {
    if (!this.locked) return;

    // Horizontal movement (no wall collision for now)
    const forward: Vec3 = [-Math.sin(this.yaw), 0, -Math.cos(this.yaw)];
    const right = this.getRight();
    let move: Vec3 = [0, 0, 0];

    if (this.keys.has('w')) move = vec3.add(move, forward);
    if (this.keys.has('s')) move = vec3.sub(move, forward);
    if (this.keys.has('d')) move = vec3.add(move, right);
    if (this.keys.has('a')) move = vec3.sub(move, right);

    const len = Math.sqrt(move[0] * move[0] + move[2] * move[2]);
    if (len > 0) {
      const s = this.speed * dt / len;
      move[0] *= s;
      move[2] *= s;
    }

    this.position[0] += move[0];
    this.position[2] += move[2];

    // Gravity & jump
    const feetY = this.position[1] - this.eyeHeight;

    if (this.keys.has(' ') && this.onGround) {
      this.velocityY = this.jumpSpeed;
      this.onGround = false;
    }

    this.velocityY -= this.gravity * dt;
    const newFeetY = feetY + this.velocityY * dt;
    const ground = this.groundHeight(this.position[0], this.position[2], feetY + 1);

    if (newFeetY <= ground) {
      this.position[1] = ground + this.eyeHeight;
      this.velocityY = 0;
      this.onGround = true;
    } else {
      this.position[1] = newFeetY + this.eyeHeight;
      this.onGround = false;
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
