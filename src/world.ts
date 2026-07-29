import { BlockType } from './block';
import { Chunk, CHUNK_SIZE, WORLD_HEIGHT } from './chunk';

/**
 * @descriotion 청크(Chunk)들의 컨네이너
 * 월드의 지형 데이터를 생성, 저장하고, 렌더링에 필요한 메시 데이터를 만들어주는 역할
 * 청크(Chunk): 블록 여러 개의 묶음 (CHUNK_SIZE X CHUNK_SIZE X WORLD_HEIGHT)
 */
export class World {
  chunks = new Map<string, Chunk>();

  getChunk(cx: number, cz: number): Chunk {
    const k = this.key(cx, cz);
    let chunk = this.chunks.get(k);
    if (!chunk) {
      chunk = new Chunk(cx, cz);
      this.chunks.set(k, chunk);
    }
    return chunk;
  }

  /**
   * @description 월드 좌표를 입력 받아 해당 블록의 타입을 반환하는 함수
   * @returns BlockType
   */
  getBlock(wx: number, wy: number, wz: number): BlockType {
    // world coordinate(실수) -> block index(정수)로 변환
    const bx = Math.floor(wx);
    const by = Math.floor(wy);
    const bz = Math.floor(wz);
    if (by < 0 || by >= WORLD_HEIGHT) return BlockType.Air;
    // chunk index 추출
    const cx = Math.floor(bx / CHUNK_SIZE);
    const cz = Math.floor(bz / CHUNK_SIZE);
    // lx, ly: local coordinate (청크 내부 지역 좌표)
    // (bx,by % CHUNK_SIZE) + CHUNK_SIZE): JavaScript의 % 연산자는 수학적인 modulo가 아니라 부호를 그대로 유지하는
    // remainer이기 때문에 음수를 0 ~ 15 로 변경하기 위한 작업
    const lx = ((bx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((bz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const k = this.key(cx, cz);
    const chunk = this.chunks.get(k);
    if (!chunk) return BlockType.Air;
    return chunk.getBlock(lx, by, lz);
  }

  /**
   * @description 월드 좌표의 블록을 다른 타입으로 바꾸는 함수 (파괴 = Air 설정)
   * 좌표 변환 방식은 getBlock과 동일하다
   */
  setBlock(wx: number, wy: number, wz: number, type: BlockType) {
    const bx = Math.floor(wx);
    const by = Math.floor(wy);
    const bz = Math.floor(wz);
    if (by < 0 || by >= WORLD_HEIGHT) return;
    const cx = Math.floor(bx / CHUNK_SIZE);
    const cz = Math.floor(bz / CHUNK_SIZE);
    const lx = ((bx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((bz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    this.getChunk(cx, cz).setBlock(lx, by, lz, type);
  }

  /**
   * @description centerX, centerZ 좌표 주위의 청크를 생성하는 함수
   *
   * (radius×2 + 1)²개의 chunk가 생성된다.
   */
  generateAround(centerX: number, centerZ: number, radius: number) {
    const ccx = Math.floor(centerX / CHUNK_SIZE);
    const ccz = Math.floor(centerZ / CHUNK_SIZE);

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        this.getChunk(ccx + dx, ccz + dz);
      }
    }
  }

  private key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }
}
