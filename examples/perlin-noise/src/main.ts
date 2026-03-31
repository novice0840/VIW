import {
  fadeOriginal, fadeImproved,
  noise1d, noise2d, fbm,
  getGradientDir, grad2d,
} from './noise';

// ─────────────────────────────────────────────
// 1. Gradient Grid & Dot Product 시각화
// ─────────────────────────────────────────────
function drawGradientGrid(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  const gridSize = 4; // 4x4 격자
  const cellW = w / gridSize;
  const cellH = h / gridSize;

  ctx.fillStyle = '#0a0a23';
  ctx.fillRect(0, 0, w, h);

  // 각 픽셀의 noise 값을 배경으로 그리기
  const imageData = ctx.createImageData(w, h);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const nx = (px / w) * gridSize;
      const ny = (py / h) * gridSize;
      const val = noise2d(nx, ny);
      const bright = Math.floor((val + 1) * 0.5 * 255);
      const idx = (py * w + px) * 4;
      imageData.data[idx] = bright;
      imageData.data[idx + 1] = bright;
      imageData.data[idx + 2] = bright;
      imageData.data[idx + 3] = 100;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  // 격자선 그리기
  ctx.strokeStyle = 'rgba(233, 69, 96, 0.3)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridSize; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cellW, 0);
    ctx.lineTo(i * cellW, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cellH);
    ctx.lineTo(w, i * cellH);
    ctx.stroke();
  }

  // 각 격자점에 gradient 화살표 그리기
  for (let gy = 0; gy <= gridSize; gy++) {
    for (let gx = 0; gx <= gridSize; gx++) {
      const cx = gx * cellW;
      const cy = gy * cellH;
      const [dx, dy] = getGradientDir(gx, gy);
      const arrowLen = cellW * 0.35;

      // 격자점 표시
      ctx.fillStyle = '#e94560';
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();

      // 화살표
      ctx.strokeStyle = '#e94560';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      const ex = cx + dx * arrowLen;
      const ey = cy + dy * arrowLen;
      ctx.lineTo(ex, ey);
      ctx.stroke();

      // 화살촉
      const angle = Math.atan2(dy, dx);
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - 8 * Math.cos(angle - 0.4), ey - 8 * Math.sin(angle - 0.4));
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - 8 * Math.cos(angle + 0.4), ey - 8 * Math.sin(angle + 0.4));
      ctx.stroke();
    }
  }

  // 예시 점과 dot product 연결선 표시
  const sampleX = 1.3;
  const sampleY = 1.7;
  const sx = (sampleX / gridSize) * w;
  const sy = (sampleY / gridSize) * h;

  ctx.fillStyle = '#00ff88';
  ctx.beginPath();
  ctx.arc(sx, sy, 6, 0, Math.PI * 2);
  ctx.fill();

  // 4개 꼭짓점으로 점선 연결
  const cellX = Math.floor(sampleX);
  const cellY = Math.floor(sampleY);
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(0, 255, 136, 0.5)';
  ctx.lineWidth = 1;
  for (const [ox, oy] of [[0,0],[1,0],[0,1],[1,1]]) {
    const cornerX = (cellX + ox) * cellW;
    const cornerY = (cellY + oy) * cellH;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(cornerX, cornerY);
    ctx.stroke();

    // dot product 값 표시
    const fracX = sampleX - (cellX + ox);
    const fracY = sampleY - (cellY + oy);
    const hash = 0; // 시각적 표현만
    const dot = grad2d(hash, fracX, fracY);
    const labelX = (sx + cornerX) / 2;
    const labelY = (sy + cornerY) / 2;
    ctx.fillStyle = '#00ff88';
    ctx.font = '11px Courier New';
    ctx.fillText(`dot`, labelX + 4, labelY - 4);
  }
  ctx.setLineDash([]);

  // 범례
  ctx.fillStyle = '#e94560';
  ctx.font = '12px Courier New';
  ctx.fillText('● gradient 벡터', 10, h - 30);
  ctx.fillStyle = '#00ff88';
  ctx.fillText('● 샘플 점 → 4개 꼭짓점과 dot product', 10, h - 12);
}

// ─────────────────────────────────────────────
// 2. Fade 함수 비교
// ─────────────────────────────────────────────
function drawFadeFunctions(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  const pad = 50;

  ctx.fillStyle = '#0a0a23';
  ctx.fillRect(0, 0, w, h);

  // 축 그리기
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, pad);
  ctx.lineTo(pad, h - pad);
  ctx.lineTo(w - pad, h - pad);
  ctx.stroke();

  // 축 레이블
  ctx.fillStyle = '#888';
  ctx.font = '12px Courier New';
  ctx.fillText('0', pad - 15, h - pad + 15);
  ctx.fillText('1', w - pad, h - pad + 15);
  ctx.fillText('1', pad - 15, pad + 5);
  ctx.fillText('t →', w / 2, h - pad + 30);

  const plotW = w - 2 * pad;
  const plotH = h - 2 * pad;

  function plotCurve(fn: (t: number) => number, color: string, label: string, yOffset: number) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let px = 0; px <= plotW; px++) {
      const t = px / plotW;
      const val = fn(t);
      const x = pad + px;
      const y = h - pad - val * plotH;
      if (px === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = '13px Courier New';
    ctx.fillText(label, pad + 10, pad + yOffset);
  }

  // 직선 (선형보간)
  plotCurve((t) => t, '#555', '── 선형: t', 20);

  // 원래 Perlin
  plotCurve(fadeOriginal, '#e94560', '── 원래: 3t²−2t³', 42);

  // Improved Perlin
  plotCurve(fadeImproved, '#00ff88', '── 개선: 6t⁵−15t⁴+10t³', 64);

  // 2차 도함수 비교
  ctx.fillStyle = '#666';
  ctx.font = '11px Courier New';
  ctx.fillText('개선 버전은 t=0, t=1에서', pad + 10, h - pad - 20);
  ctx.fillText('2차 도함수도 0 → 더 부드러운 경계', pad + 10, h - pad - 5);
}

// ─────────────────────────────────────────────
// 3. 1D Perlin Noise 비교
// ─────────────────────────────────────────────
function draw1DNoise(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  const pad = 30;

  ctx.fillStyle = '#0a0a23';
  ctx.fillRect(0, 0, w, h);

  const plotW = w - 2 * pad;
  const plotH = h - 2 * pad;
  const midY = pad + plotH / 2;

  // 0 기준선
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, midY);
  ctx.lineTo(w - pad, midY);
  ctx.stroke();

  // 격자 경계 표시
  const noiseScale = 8;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  for (let i = 0; i <= noiseScale; i++) {
    const x = pad + (i / noiseScale) * plotW;
    ctx.beginPath();
    ctx.moveTo(x, pad);
    ctx.lineTo(x, h - pad);
    ctx.stroke();
  }

  function plot1d(fade: (t: number) => number, color: string) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let px = 0; px <= plotW; px++) {
      const t = (px / plotW) * noiseScale;
      const val = noise1d(t, fade);
      const x = pad + px;
      const y = midY - val * plotH * 0.45;
      if (px === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  plot1d(fadeOriginal, '#e94560');
  plot1d(fadeImproved, '#00ff88');

  ctx.fillStyle = '#e94560';
  ctx.font = '12px Courier New';
  ctx.fillText('── 원래 fade', pad, pad + 15);
  ctx.fillStyle = '#00ff88';
  ctx.fillText('── 개선 fade', pad, pad + 32);
  ctx.fillStyle = '#555';
  ctx.fillText('│ = 격자 경계', pad + 200, pad + 15);
}

// ─────────────────────────────────────────────
// 4. 2D Perlin Noise
// ─────────────────────────────────────────────
function draw2DNoise(canvas: HTMLCanvasElement, scale: number) {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.createImageData(w, h);

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const nx = (px / w) * scale;
      const ny = (py / h) * scale;
      const val = noise2d(nx, ny);
      const bright = Math.floor((val + 1) * 0.5 * 255);
      const idx = (py * w + px) * 4;
      imageData.data[idx] = bright;
      imageData.data[idx + 1] = bright;
      imageData.data[idx + 2] = bright;
      imageData.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

// ─────────────────────────────────────────────
// 5. fBm 시각화
// ─────────────────────────────────────────────
function drawFBM(canvas: HTMLCanvasElement, octaves: number, lacunarity: number, gain: number) {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.createImageData(w, h);
  const scale = 6;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const nx = (px / w) * scale;
      const ny = (py / h) * scale;
      const val = fbm(nx, ny, octaves, lacunarity, gain);
      const bright = Math.floor((val + 1) * 0.5 * 255);
      const idx = (py * w + px) * 4;
      imageData.data[idx] = bright;
      imageData.data[idx + 1] = bright;
      imageData.data[idx + 2] = bright;
      imageData.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

// ─────────────────────────────────────────────
// 6. 지형 생성
// ─────────────────────────────────────────────
function drawTerrain(canvas: HTMLCanvasElement, octaves: number, seaLevel: number) {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = '#87CEEB';
  ctx.fillRect(0, 0, w, h);

  const terrainHeight = h;
  const scale = 0.01;

  // 높이맵 계산
  const heights: number[] = [];
  for (let px = 0; px < w; px++) {
    const nx = px * scale;
    const val = fbm(nx, 0, octaves, 2.0, 0.5);
    const height = Math.floor(seaLevel + val * 40);
    heights.push(Math.max(1, Math.min(terrainHeight - 1, height)));
  }

  // 바다 수위선
  const seaY = h - seaLevel;

  // 하늘 그라데이션
  const skyGrad = ctx.createLinearGradient(0, 0, 0, seaY);
  skyGrad.addColorStop(0, '#1a1a4e');
  skyGrad.addColorStop(1, '#87CEEB');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, seaY);

  // 지형 칼럼별로 그리기
  for (let px = 0; px < w; px++) {
    const height = heights[px];

    for (let y = 0; y < height; y++) {
      const screenY = h - 1 - y;
      if (screenY < 0) continue;

      let color: string;
      if (y < 3) {
        color = '#808080'; // 기반암 (stone)
      } else if (y < height - 4) {
        color = '#696969'; // 돌 (stone)
      } else if (y < height - 1) {
        color = '#8B6914'; // 흙 (dirt)
      } else if (height > seaLevel + 30) {
        color = '#FFFFFF'; // 눈 (snow)
      } else if (height <= seaLevel + 1) {
        color = '#C2B280'; // 모래 (sand)
      } else {
        color = '#4CAF50'; // 잔디 (grass)
      }

      ctx.fillStyle = color;
      ctx.fillRect(px, screenY, 1, 1);
    }

    // 물 채우기
    if (height < seaLevel) {
      ctx.fillStyle = 'rgba(30, 100, 200, 0.6)';
      ctx.fillRect(px, h - seaLevel, 1, seaLevel - height);
    }
  }

  // 수위선 표시
  ctx.strokeStyle = 'rgba(30, 100, 200, 0.5)';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, h - seaLevel);
  ctx.lineTo(w, h - seaLevel);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(30, 100, 200, 0.8)';
  ctx.font = '11px Courier New';
  ctx.fillText(`sea level: ${seaLevel}`, 5, h - seaLevel - 5);
}

// ─────────────────────────────────────────────
// 초기화 & 이벤트 바인딩
// ─────────────────────────────────────────────
function main() {
  // 1. Gradient Grid
  drawGradientGrid(document.getElementById('canvas-grid') as HTMLCanvasElement);

  // 2. Fade 함수
  drawFadeFunctions(document.getElementById('canvas-fade') as HTMLCanvasElement);

  // 3. 1D Noise
  draw1DNoise(document.getElementById('canvas-1d') as HTMLCanvasElement);

  // 4. 2D Noise
  const canvas2d = document.getElementById('canvas-2d') as HTMLCanvasElement;
  const scale2dInput = document.getElementById('scale-2d') as HTMLInputElement;
  const scale2dVal = document.getElementById('scale-2d-val')!;

  draw2DNoise(canvas2d, 6);
  scale2dInput.addEventListener('input', () => {
    const v = Number(scale2dInput.value);
    scale2dVal.textContent = String(v);
    draw2DNoise(canvas2d, v);
  });

  // 5. fBm
  const canvasFbm = document.getElementById('canvas-fbm') as HTMLCanvasElement;
  const octavesInput = document.getElementById('octaves') as HTMLInputElement;
  const octavesVal = document.getElementById('octaves-val')!;
  const lacunarityInput = document.getElementById('lacunarity') as HTMLInputElement;
  const lacunarityVal = document.getElementById('lacunarity-val')!;
  const gainInput = document.getElementById('gain') as HTMLInputElement;
  const gainVal = document.getElementById('gain-val')!;

  function updateFbm() {
    const o = Number(octavesInput.value);
    const l = Number(lacunarityInput.value) / 10;
    const g = Number(gainInput.value) / 100;
    octavesVal.textContent = String(o);
    lacunarityVal.textContent = l.toFixed(1);
    gainVal.textContent = g.toFixed(2);
    drawFBM(canvasFbm, o, l, g);
  }
  updateFbm();
  octavesInput.addEventListener('input', updateFbm);
  lacunarityInput.addEventListener('input', updateFbm);
  gainInput.addEventListener('input', updateFbm);

  // 6. Terrain
  const canvasTerrain = document.getElementById('canvas-terrain') as HTMLCanvasElement;
  const terrainOctInput = document.getElementById('terrain-octaves') as HTMLInputElement;
  const terrainOctVal = document.getElementById('terrain-octaves-val')!;
  const seaLevelInput = document.getElementById('sea-level') as HTMLInputElement;
  const seaLevelVal = document.getElementById('sea-level-val')!;

  function updateTerrain() {
    const o = Number(terrainOctInput.value);
    const s = Number(seaLevelInput.value);
    terrainOctVal.textContent = String(o);
    seaLevelVal.textContent = String(s);
    drawTerrain(canvasTerrain, o, s);
  }
  updateTerrain();
  terrainOctInput.addEventListener('input', updateTerrain);
  seaLevelInput.addEventListener('input', updateTerrain);
}

main();
