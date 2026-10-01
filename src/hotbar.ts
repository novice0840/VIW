import { ATLAS_GRID, ATLAS_URL, BLOCK_NAMES, BLOCK_TILES, HOTBAR, type BlockType } from './block';

/**
 * @description 아틀라스의 타일 하나만 보이도록 요소의 배경을 설정하는 함수 (CSS 스프라이트)
 *
 * 배경 이미지를 요소의 GRID배 크기로 늘리면 타일 하나가 요소에 딱 맞는다.
 * background-position의 %는 "이미지와 요소의 남는 폭" 기준이라,
 * col번째 타일은 col / (GRID - 1) * 100%로 맞춰진다.
 */
function setTileBackground(el: HTMLElement, tile: number) {
  const col = tile % ATLAS_GRID;
  const row = Math.floor(tile / ATLAS_GRID);
  const step = 100 / (ATLAS_GRID - 1);
  el.style.backgroundImage = `url(${ATLAS_URL})`;
  el.style.backgroundSize = `${ATLAS_GRID * 100}% ${ATLAS_GRID * 100}%`;
  el.style.backgroundPosition = `${col * step}% ${row * step}%`;
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

      // 옆면 타일을 쓴다 — 잔디처럼 윗면만으로는 다른 블록과 헷갈리는 경우가 있어서
      const icon = document.createElement('div');
      icon.className = 'slot-icon';
      setTileBackground(icon, BLOCK_TILES[block].side);
      slot.appendChild(icon);

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
