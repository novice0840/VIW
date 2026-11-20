import { describe, expect, it } from 'vitest';
import { BlockType } from './block';
import { Chunk } from './chunk';
import type { ChunkSource } from './chunkSource';
import { World, type BlockChange } from './world';

/**
 * 테스트가 도착 시점을 직접 정하는 청크 출처. 요청을 쌓아 두었다가 arrive()를 부르면 도착시킨다.
 */
class ManualSource implements ChunkSource {
  loads = 0;
  private waiting: (() => void)[] = [];

  load(cx: number, cz: number): Promise<Chunk> {
    this.loads++;
    return new Promise((resolve) => {
      this.waiting.push(() => {
        const chunk = new Chunk(cx, cz);
        chunk.setBlock(0, 0, 0, BlockType.Stone);
        resolve(chunk);
      });
    });
  }

  arrive() {
    for (const fn of this.waiting) fn();
    this.waiting = [];
  }
}

describe('World 청크 로딩', () => {
  it('청크는 도착하기 전까지 없고, 그동안 블록은 Air로 읽힌다', async () => {
    const source = new ManualSource();
    const world = new World(source);

    const promise = world.requestChunk(0, 0);
    expect(world.getChunk(0, 0)).toBeUndefined();
    expect(world.getBlock(0, 0, 0)).toBe(BlockType.Air);

    source.arrive();
    await promise;
    expect(world.getChunk(0, 0)).toBeDefined();
    expect(world.getBlock(0, 0, 0)).toBe(BlockType.Stone);
  });

  // 렌더러는 매 프레임 주변 청크를 요청한다. 도착 전에 같은 청크를 또 불러오면 안 된다.
  it('불러오는 중인 청크를 다시 요청해도 한 번만 불러온다', async () => {
    const source = new ManualSource();
    const world = new World(source);

    world.requestAround(0, 0, 1);
    world.requestAround(0, 0, 1);
    expect(source.loads).toBe(9);

    source.arrive();
    await world.loadAround(0, 0, 1);
    world.requestAround(0, 0, 1);
    expect(source.loads).toBe(9);
  });
});

describe('World 블록 변경', () => {
  async function loadedWorld(): Promise<World> {
    const source = new ManualSource();
    const world = new World(source);
    const promise = world.requestChunk(0, 0);
    source.arrive();
    await promise;
    return world;
  }

  it('블록을 바꾸면 구독자에게 바뀐 위치와 청크를 알린다', async () => {
    const world = await loadedWorld();
    const changes: BlockChange[] = [];
    world.onBlockChange((c) => changes.push(c));

    expect(world.setBlock(3, 10, 5, BlockType.Dirt)).toBe(true);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ x: 3, y: 10, z: 5, type: BlockType.Dirt, cx: 0, cz: 0 });
  });

  // 같은 블록으로 "바꾸는" 것은 변경이 아니다. 알리면 메시 재생성과 저장이 헛돈다.
  it('이미 같은 블록이면 바꾸지 않고 알리지도 않는다', async () => {
    const world = await loadedWorld();
    let count = 0;
    world.onBlockChange(() => count++);

    expect(world.setBlock(0, 0, 0, BlockType.Stone)).toBe(false);
    expect(count).toBe(0);
  });

  it('아직 도착하지 않은 청크의 블록은 바꿀 수 없다', async () => {
    const world = await loadedWorld();
    expect(world.setBlock(100, 10, 100, BlockType.Dirt)).toBe(false);
  });

  it('구독을 해제하면 더는 알리지 않는다', async () => {
    const world = await loadedWorld();
    let count = 0;
    const unsubscribe = world.onBlockChange(() => count++);
    unsubscribe();
    world.setBlock(1, 1, 1, BlockType.Dirt);
    expect(count).toBe(0);
  });
});
