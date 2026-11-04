// 디버그 HUD가 한 번에 보여 줄 구간 길이. 매 프레임 숫자를 바꾸면 읽을 수 없어서 이만큼 모아 보여 준다.
const REPORT_INTERVAL_MS = 500;

export interface StatsReport {
  frameAvgMs: number;
  frameMaxMs: number;
  cpuAvgMs: number;
  cpuMaxMs: number;
  gpuMs: number | null;
}

/**
 * @description 디버그 HUD에 띄울 성능 수치를 모으는 클래스
 *
 * 측정 지점이 main(프레임, CPU)과 renderer(GPU)에 흩어져 있다.
 * 매번 인자로 넘기면 측정 코드 때문에 함수 시그니처가 바뀌므로, 모듈 하나(stats)를 공유한다.
 *
 * 평균만 보면 끊김이 가려진다 — 60fps 평균이어도 50ms 프레임이 가끔 끼면 화면이 멈칫한다.
 * 그래서 프레임 시간과 CPU 시간은 구간 내 최댓값을 함께 모은다.
 */
class FrameStats {
  // 구간 동안 누적하는 값
  // FPS 대신 평균 프레임 시간(ms)을 보여 준다 — CPU·GPU와 단위가 같아야 위아래로 비교할 수 있다.
  // (FPS = 1000 / 평균 프레임 시간이라 정보는 같다)
  private frames = 0;
  private frameTotalMs = 0;
  private frameMaxMs = 0;
  private cpuTotalMs = 0;
  private cpuMaxMs = 0;
  private windowStart = performance.now();

  // GPU 시간은 몇 프레임 늦게 비동기로 도착한다. 도착한 마지막 값을 들고 있는다.
  // null이면 아직 도착한 값이 없다 (timestamp-query 미지원 기기에서는 계속 null).
  gpuMs: number | null = null;

  /**
   * @param frameMs 이전 프레임 시작부터 이번 프레임 시작까지 — 브라우저가 화면을 갱신하는 간격(FPS)
   * @param cpuMs 이번 프레임에 우리 JS가 실제로 일한 시간 — 갱신, 생성, 메싱, 그리기 명령 기록
   */
  endFrame(frameMs: number, cpuMs: number) {
    this.frames++;
    this.frameTotalMs += frameMs;
    this.frameMaxMs = Math.max(this.frameMaxMs, frameMs);
    this.cpuTotalMs += cpuMs;
    this.cpuMaxMs = Math.max(this.cpuMaxMs, cpuMs);
  }

  /**
   * @description 구간이 지났으면 모은 값을 돌려주고 구간을 새로 시작한다. 아직이면 null.
   */
  takeReport(now: number): StatsReport | null {
    const elapsed = now - this.windowStart;
    if (elapsed < REPORT_INTERVAL_MS || this.frames === 0) return null;

    const report: StatsReport = {
      frameAvgMs: this.frameTotalMs / this.frames,
      frameMaxMs: this.frameMaxMs,
      cpuAvgMs: this.cpuTotalMs / this.frames,
      cpuMaxMs: this.cpuMaxMs,
      gpuMs: this.gpuMs,
    };

    this.frames = 0;
    this.frameTotalMs = 0;
    this.frameMaxMs = 0;
    this.cpuTotalMs = 0;
    this.cpuMaxMs = 0;
    this.windowStart = now;
    return report;
  }
}

export const stats = new FrameStats();
