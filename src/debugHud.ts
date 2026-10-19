import { CHUNK_SIZE } from './chunk';
import type { Vec3 } from './math';
import type { StatsReport } from './stats';

export interface HudContext {
  position: Vec3;
  renderDistance: number;
  loadedChunks: number;
  cachedMeshes: number;
  gpuTimingSupported: boolean;
}

function ms(v: number): string {
  return v.toFixed(1);
}

function count(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
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
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const { gen, mesh } = report;

    let gpu: string;
    if (!ctx.gpuTimingSupported) gpu = 'GPU   n/a (timestamp-query 미지원)';
    else if (report.gpuMs === null) gpu = 'GPU   -';
    else gpu = `GPU   ${ms(report.gpuMs)} ms`;

    // 생성·메싱은 구간(0.5초) 동안의 합계다. 한 번에 몰리면 max가 끊김의 원인을 가리킨다.
    this.el.textContent = [
      `FPS   ${report.fps.toFixed(0)}`,
      `frame ${ms(report.frameAvgMs)} ms  (max ${ms(report.frameMaxMs)})`,
      `CPU   ${ms(report.cpuAvgMs)} ms  (max ${ms(report.cpuMaxMs)})`,
      gpu,
      '',
      `gen   ${gen.count} chunks  ${ms(gen.totalMs)} ms  (max ${ms(gen.maxMs)}/chunk)`,
      `mesh  ${mesh.count} chunks  ${ms(mesh.totalMs)} ms  (max ${ms(mesh.maxMs)}/chunk)`,
      `draw  ${report.drawCalls} calls  ${report.chunksDrawn} chunks  ${count(report.vertices)} verts`,
      `mem   ${ctx.loadedChunks} chunks loaded  ${ctx.cachedMeshes} meshes`,
      '',
      `render distance ${ctx.renderDistance}  ([ / ])`,
      `XYZ   ${x.toFixed(1)} / ${y.toFixed(1)} / ${z.toFixed(1)}`,
      `chunk ${cx}, ${cz}`,
    ].join('\n');
  }
}
