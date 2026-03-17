import { mat4, type Vec3 } from './math';

export class Camera {
  theta = 0.3; // 수평 회전각 (경도))
  phi = 1.0; // 수직 각도 (위도)
  radius = 80; // 태양으로부터의 거리

  private readonly minRadius = 10;
  private readonly maxRadius = 200;
  private readonly fov = Math.PI / 3;
  private readonly near = 0.1;
  private readonly far = 500;

  private dragging = false;
  // 마우스 드래그로 카메라를 회전할 때, 이전 프레임의 마우스 좌표를 저장하기 위해 사용
  private lastX = 0;
  private lastY = 0;

  getEye(): Vec3 {
    return [
      this.radius * Math.sin(this.phi) * Math.sin(this.theta),
      this.radius * Math.cos(this.phi),
      this.radius * Math.sin(this.phi) * Math.cos(this.theta),
    ];
  }

  /**
   * @description mat4.lootAt를 호출하여 view matrix를 생성하는 함수
   * @returns view matrix
   */
  getViewMatrix() {
    return mat4.lookAt(this.getEye(), [0, 0, 0], [0, 1, 0]);
  }

  /**
   * @description 투영 행렬을 생성하며, 3D 좌표를 2D 화면에 매핑할 때 원근감을 적용
   */
  getProjectionMatrix(aspect: number) {
    return mat4.perspective(this.fov, aspect, this.near, this.far);
  }

  attachEvents(canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.theta -= dx * 0.005;
      // phi가 0 ~ PI 범위를 벗어나면 안되기 때문에 클램핑 기능 추가
      this.phi = Math.max(0.05, Math.min(Math.PI - 0.05, this.phi + dy * 0.005));
    });

    canvas.addEventListener('pointerup', () => {
      this.dragging = false;
    });

    canvas.addEventListener(
      'wheel',
      (e) => {
        this.radius = Math.max(
          this.minRadius,
          Math.min(this.maxRadius, this.radius + e.deltaY * 0.05),
        );
      },
      { passive: true },
    );
  }
}
