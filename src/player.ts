import { clamp, hasOverlap, mat4, vec3, type Vec3 } from './math';
import { BlockType, isSolid, HOTBAR } from './block';
import { World } from './world';

export class Player {
  /** 학습 노트
   *  position의 X, Z는 초기 스폰 월드 좌표. 단 Y는 실제로 게임에 반영되기
   * 전에 지형 높이에 맞춰 덮어 씌워진다.
   */

  position: Vec3 = [32, 50, 32];
  // 좌우 회전 (Y축 기준) - 고개를 좌우로 돌리는 것
  yaw = 0;
  // 상하 회전 (X축 기준) - 고개를 위아래로 끄덕이는 것
  pitch = 0;

  selectedBlock = BlockType.Grass;
  world: World | null = null;

  private readonly fov = Math.PI / 3;
  private readonly near = 0.1;
  private readonly far = 300;
  private readonly speed = 6;
  // sensitivity = 마우스 1픽셀 이동당 회전할 라디안(각도)
  private readonly sensitivity = 0.002;
  private readonly gravity = 24;
  private readonly jumpSpeed = 9;
  private readonly eyeHeight = 1.62;
  private readonly halfWidth = 0.3;
  private readonly bodyHeight = 1.8;
  private readonly flySpeed = 20;
  // Space를 이 시간(ms) 안에 두 번 누르면 비행 모드를 토글한다. 마크의 7틱(350ms)에 맞춘다.
  private readonly doubleTapMs = 350;

  private velocityY = 0;
  private onGround = false;
  // 디버그용 비행 모드. 켜져 있으면 중력을 무시한다. 블록 충돌은 걷기와 똑같이 적용된다.
  private flying = false;
  // 직전 Space 입력 시각. 더블탭 판정에 쓴다.
  private lastSpaceTime = -Infinity;
  private keys = new Set<string>();
  private locked = false;

  /**
   * @description 카메라가 바라보는 방향의 단위 벡터를 반환하는 함수
   */
  getForward(): Vec3 {
    return [
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    ];
  }

  /**
   * @description 카메라 기준 오른쪽 방향의 단위 벡터를 반환하는 함수
   * 좌우이동을 할 때 사용한다
   */
  getRight(): Vec3 {
    return [Math.cos(this.yaw), 0, -Math.sin(this.yaw)];
  }

  /**
   * @description 카메라 시점으로 세계를 변환하는 행렬을 반환하는 함수
   */
  getViewMatrix() {
    const forward = this.getForward();
    const target = vec3.add(this.position, forward);
    // 학습 노트
    // 정규화(normalized)란?
    // 벡터의 방향은 그대로 두고, 길이만 1로 만드는 것
    //
    // 왜 하는 가?
    // "크기"와 "방향"을 분리하려고
    // 정규화하지 않은 벡터는 "방향"과 "거리"가 섞여 있어 방향만 필요할 땐 거리 정보가 오염원이 된다.

    // View Matrix - 월드 좌표를 카메라 기준 좌표로 바꿔주는 4X4 변환 행렬
    return mat4.lookAt(this.position, target, [0, 1, 0]);
  }

  getProjectionMatrix(aspect: number) {
    return mat4.perspective(this.fov, aspect, this.near, this.far);
  }

  /**
   * @description 블록 칸 (bx, by, bz)가 플레이어 몸과 겹치는지 판정하는 함수
   */
  occupiesBlock(bx: number, by: number, bz: number): boolean {
    const x = this.position[0];
    const z = this.position[2];
    const feetY = this.position[1] - this.eyeHeight;
    return (
      hasOverlap(bx, bx + 1, x - this.halfWidth, x + this.halfWidth) &&
      hasOverlap(bz, bz + 1, z - this.halfWidth, z + this.halfWidth) &&
      hasOverlap(by, by + 1, feetY, feetY + this.bodyHeight)
    );
  }

  update(dt: number) {
    if (!this.locked) return;
    const forward: Vec3 = [-Math.sin(this.yaw), 0, -Math.cos(this.yaw)];
    const right = this.getRight();
    let move: Vec3 = [0, 0, 0];

    if (this.keys.has('KeyW')) move = vec3.add(move, forward);
    if (this.keys.has('KeyS')) move = vec3.sub(move, forward);
    if (this.keys.has('KeyD')) move = vec3.add(move, right);
    if (this.keys.has('KeyA')) move = vec3.sub(move, right);

    const len = Math.sqrt(move[0] * move[0] + move[2] * move[2]);
    if (len > 0) {
      const s = ((this.flying ? this.flySpeed : this.speed) * dt) / len;
      move[0] *= s;
      move[2] *= s;
    }

    if (this.flying) {
      this.fly(move, dt);
      return;
    }

    const feetY = this.position[1] - this.eyeHeight;

    const newX = this.position[0] + move[0];
    const newZ = this.position[2] + move[2];

    if (!this.collidesAt(newX, feetY, this.position[2])) {
      this.position[0] = newX;
    }

    if (!this.collidesAt(this.position[0], feetY, newZ)) {
      this.position[2] = newZ;
    }

    if (this.keys.has('Space') && this.onGround) {
      this.velocityY = this.jumpSpeed;
      this.onGround = false;
    }

    this.velocityY -= this.gravity * dt;
    const newFeetY = feetY + this.velocityY * dt;
    const x = this.position[0];
    const z = this.position[2];
    const ground = Math.max(
      this.groundHeight(x + this.halfWidth, z + this.halfWidth, feetY + 1),
      this.groundHeight(x + this.halfWidth, z - this.halfWidth, feetY + 1),
      this.groundHeight(x - this.halfWidth, z + this.halfWidth, feetY + 1),
      this.groundHeight(x - this.halfWidth, z - this.halfWidth, feetY + 1),
    );

    if (this.velocityY > 0 && this.collidesAt(x, newFeetY, z)) {
      this.velocityY = 0;
    } else if (newFeetY <= ground) {
      this.position[1] = ground + this.eyeHeight;
      this.velocityY = 0;
      this.onGround = true;
    } else {
      this.position[1] = newFeetY + this.eyeHeight;
      this.onGround = false;
    }
  }

  /**
   * @description 비행 모드의 이동. 수평 이동량 move에 Space/Shift 상하 이동을 더해 축마다 따로 적용한다
   *
   * 축을 나눠 검사하므로 벽에 비스듬히 부딪혀도 막힌 축만 멈추고 나머지 축으로는 미끄러진다.
   * 세로 이동이 막히면 블록 면에 딱 붙인다. 그냥 멈추기만 하면 비행 속도가 빨라
   * 바닥이나 천장과 최대 flySpeed * dt(60fps에서 약 0.33칸)만큼 틈이 남는다.
   */
  private fly(move: Vec3, dt: number) {
    let up = 0;
    if (this.keys.has('Space')) up += 1;
    if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) up -= 1;

    const feetY = this.position[1] - this.eyeHeight;

    const newX = this.position[0] + move[0];
    if (!this.collidesAt(newX, feetY, this.position[2])) this.position[0] = newX;

    const newZ = this.position[2] + move[2];
    if (!this.collidesAt(this.position[0], feetY, newZ)) this.position[2] = newZ;

    if (up === 0) return;
    const x = this.position[0];
    const z = this.position[2];
    let newFeetY = feetY + up * this.flySpeed * dt;
    if (this.collidesAt(x, newFeetY, z)) {
      // 내려갈 땐 발이 닿은 블록의 윗면, 올라갈 땐 머리가 닿은 블록의 아랫면에 맞춘다.
      // collidesAt은 floor(maxY) 칸까지 검사하므로, 머리가 정확히 정수 y에 닿으면 그 위 블록과
      // 겹친다고 본다. 머리 쪽은 아주 조금 아래로 띄워 둔다.
      newFeetY =
        up < 0
          ? Math.floor(newFeetY) + 1
          : Math.floor(newFeetY + this.bodyHeight) - this.bodyHeight - 1e-4;
      // 맞춘 위치도 막혀 있으면(좁은 틈 등) 이번 프레임은 세로로 움직이지 않는다.
      if (this.collidesAt(x, newFeetY, z)) return;
    }
    this.position[1] = newFeetY + this.eyeHeight;
  }

  /**
   * @description 비행 모드를 켜고 끄는 함수
   *
   * 끌 때 velocityY를 0으로 두어, 비행 전에 쌓여 있던 낙하 속도로 갑자기 떨어지지 않게 한다.
   */
  private toggleFlying() {
    this.flying = !this.flying;
    this.velocityY = 0;
    this.onGround = false;
  }

  attachEvents(canvas: HTMLCanvasElement) {
    canvas.addEventListener('click', () => {
      canvas.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.keys.clear();
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch = clamp(
        this.pitch - e.movementY * this.sensitivity,
        -Math.PI / 2 + 0.01,
        Math.PI / 2 - 0.01,
      );
    });

    document.addEventListener('keydown', (e) => {
      this.keys.add(e.code);

      // 키를 누르고 있으면 keydown이 반복해서 들어온다 (e.repeat = true).
      // 반복분을 탭으로 세면 꾹 누르는 것만으로 더블탭이 되므로 첫 입력만 받는다.
      if (e.code === 'Space' && this.locked && !e.repeat) {
        if (e.timeStamp - this.lastSpaceTime < this.doubleTapMs) {
          this.toggleFlying();
          // 판정에 쓴 탭을 소비한다. 그대로 두면 세 번째 탭이 두 번째와 짝지어 다시 토글된다.
          this.lastSpaceTime = -Infinity;
        } else {
          this.lastSpaceTime = e.timeStamp;
        }
      }

      if (e.code.startsWith('Digit') && this.locked) {
        const n = Number(e.code.slice(5));
        const block = HOTBAR[n - 1];
        if (block === undefined) return;
        this.selectedBlock = block;
      }
    });

    document.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
  }

  private collidesAt(x: number, feetY: number, z: number): boolean {
    const minX = x - this.halfWidth;
    const maxX = x + this.halfWidth;
    const minY = feetY;
    const maxY = feetY + this.bodyHeight;
    const minZ = z - this.halfWidth;
    const maxZ = z + this.halfWidth;

    for (let bx = Math.floor(minX); bx <= Math.floor(maxX); bx++)
      for (let by = Math.floor(minY); by <= Math.floor(maxY); by++)
        for (let bz = Math.floor(minZ); bz <= Math.floor(maxZ); bz++)
          if (this.isSolidAt(bx, by, bz)) return true;
    return false;
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
}
