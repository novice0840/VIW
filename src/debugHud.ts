import type { Vec3 } from './math';
import type { StatsReport } from './stats';

export interface HudContext {
  position: Vec3;
  gpuTimingSupported: boolean;
}

function ms(v: number): string {
  return v.toFixed(1);
}

/**
 * @description 성능 수치를 화면 구석에 띄우는 디버그 HUD (마크의 F3 화면 역할)
 *
 * 숨겨져 있어도 stats는 계속 모은다. 켜는 순간부터 숫자가 바로 보이게 하려는 것이고,
 * 모으는 비용은 performance.now() 몇 번이라 무시할 수 있다.
 */
export class DebugHud {
  private visible = false;

  constructor(private el: HTMLElement) {}

  toggle() {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? 'block' : 'none';
  }

  update(report: StatsReport, ctx: HudContext) {
    if (!this.visible) return;

    const [x, y, z] = ctx.position;

    let gpu: string;
    if (!ctx.gpuTimingSupported) gpu = 'GPU   n/a (timestamp-query 미지원)';
    else if (report.gpuMs === null) gpu = 'GPU   -';
    else gpu = `GPU   ${ms(report.gpuMs)} ms`;

    this.el.textContent = [
      `FPS   ${report.fps.toFixed(0)}  (max ${ms(report.frameMaxMs)} ms)`,
      `CPU   ${ms(report.cpuAvgMs)} ms  (max ${ms(report.cpuMaxMs)})`,
      gpu,
      '',
      `XYZ   ${x.toFixed(1)} / ${y.toFixed(1)} / ${z.toFixed(1)}`,
    ].join('\n');
  }
}
