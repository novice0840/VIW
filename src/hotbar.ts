import { BLOCK_COLORS, BLOCK_NAMES, HOTBAR, type BlockType } from './block';

// 블록 색은 0~1 실수인데 CSS rgb()는 0~255 정수를 쓴다.
function toCssColor([r, g, b]: [number, number, number]): string {
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

/**
 * 화면 하단 핫바. HOTBAR 배열을 그대로 슬롯으로 펼치므로
 * 배열 순서가 곧 화면 순서이자 숫자키 번호가 된다.
 */
export class Hotbar {
  private readonly slots: HTMLElement[] = [];
  private readonly nameEl: HTMLElement;
  // 마지막으로 화면에 반영한 블록. 매 프레임 DOM을 건드리지 않으려고 들고 있는다.
  private shownBlock: BlockType | null = null;
  private nameTimer = 0;

  constructor(container: HTMLElement, nameEl: HTMLElement) {
    this.nameEl = nameEl;

    HOTBAR.forEach((block, i) => {
      const slot = document.createElement('div');
      slot.className = 'slot';

      const color = document.createElement('div');
      color.className = 'slot-color';
      color.style.background = toCssColor(BLOCK_COLORS[block].top);
      slot.appendChild(color);

      const key = document.createElement('div');
      key.className = 'slot-key';
      key.textContent = String(i + 1);
      slot.appendChild(key);

      container.appendChild(slot);
      this.slots.push(slot);
    });
  }

  /** 매 프레임 호출되지만 선택이 바뀐 프레임에만 DOM을 만진다. */
  update(selected: BlockType) {
    if (selected === this.shownBlock) return;
    this.shownBlock = selected;

    const index = HOTBAR.indexOf(selected);
    this.slots.forEach((slot, i) => {
      slot.classList.toggle('selected', i === index);
    });

    // 마크처럼 블록 이름을 잠깐 띄웠다가 사라지게 한다
    this.nameEl.textContent = BLOCK_NAMES[selected] ?? '';
    this.nameEl.classList.add('show');
    clearTimeout(this.nameTimer);
    this.nameTimer = setTimeout(() => this.nameEl.classList.remove('show'), 1200);
  }
}
