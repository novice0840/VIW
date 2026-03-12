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
  private lastX = 0;
  private lastY = 0;

  getEye(): Vec3 {
    return [
      this.radius * Math.sin(this.phi) * Math.sin(this.theta),
      this.radius * Math.cos(this.phi),
      this.radius * Math.sin(this.phi) * Math.cos(this.theta),
    ];
  }

  getViewMatrix() {
    return mat4.lookAt(this.getEye(), [0, 0, 0], [0, 1, 0]);
  }

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
