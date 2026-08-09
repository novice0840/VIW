import { mat4, type Vec3 } from './math';
import BLOCK_WGSL from './shaders/block.wgsl';
import SKY_WGSL from './shaders/sky.wgsl';
import HIGHLIGHT_WGSL from './shaders/highlight.wgsl';
import { Camera } from './camera';
import { CHUNK_SIZE, chunkKey } from './chunk';
import { World } from './world';

const GLOBAL_UNIFORM_SIZE = 128; // viewProj(64) + cameraPos(12+4) + sunDir(12+4) + fogColor(12+4) + fogDensity(4+12pad)

// 단위 큐브의 12개 모서리를 선분으로 표현한 것 (line-list라 모서리당 정점 2개 = 24개).
// 원점 기준 0~1 좌표라, 그릴 때 블록 좌표만 더하면 그 블록의 외곽선이 된다.
const CUBE_EDGES = new Float32Array([
  // 아랫면 4개
  0, 0, 0, 1, 0, 0,
  1, 0, 0, 1, 0, 1,
  1, 0, 1, 0, 0, 1,
  0, 0, 1, 0, 0, 0,
  // 윗면 4개
  0, 1, 0, 1, 1, 0,
  1, 1, 0, 1, 1, 1,
  1, 1, 1, 0, 1, 1,
  0, 1, 1, 0, 1, 0,
  // 위아래를 잇는 기둥 4개
  0, 0, 0, 0, 1, 0,
  1, 0, 0, 1, 1, 0,
  1, 0, 1, 1, 1, 1,
  0, 0, 1, 0, 1, 1,
]);

// 외곽선이 블록 표면과 정확히 겹치면 z-fighting으로 선이 깜빡인다.
// 큐브를 아주 살짝 부풀려 표면보다 앞에 오게 한다.
const HIGHLIGHT_EXPAND = 0.002;

/**
 * @description 청크(chunk) 하나를 화면에 그리는 데 필요한 GPU 정보를 묶은 구조
 *
 * buffer
 *
 * 청크의 정점 데이터(vertex data)가 저장된 GPU 메모리 덩어리
 *
 * vertexCount
 *
 * 이 버퍼에 정점이 몇 개 들어있는지
 * GPU는 버퍼만 봐서는 정점이 몇 개 인지 알 수 없기 때문에
 * pass.draw(mesh.vertexCount) 로 개수를 알려줘야 한다.
 */
interface ChunkMesh {
  buffer: GPUBuffer;
  vertexCount: number;
}

export class Renderer {
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private format!: GPUTextureFormat;
  private depthTexture!: GPUTexture;
  private aspect = 1;

  private blockPipeline!: GPURenderPipeline;
  private skyPipeline!: GPURenderPipeline;
  private highlightPipeline!: GPURenderPipeline;

  // 하이라이트는 매 프레임 위치가 바뀌므로 버퍼를 재생성하지 않고 하나를 계속 덮어쓴다.
  private highlightBuffer!: GPUBuffer;
  private highlightVertices = new Float32Array(CUBE_EDGES.length);

  private globalUniformBuffer!: GPUBuffer;
  private globalBindGroup!: GPUBindGroup;
  private highlightBindGroup!: GPUBindGroup;

  private chunkMeshes = new Map<string, ChunkMesh>();
  world!: World;

  async init(canvas: HTMLCanvasElement) {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('No WebGPU adapter');
    this.device = await adapter.requestDevice();

    this.context = canvas.getContext('webgpu')!;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'opaque',
    });

    this.createDepthTexture(canvas.width, canvas.height);
    this.createPipelines();
    this.createUniformBuffers();

    this.world = new World();
  }

  onResize(w: number, h: number) {
    if (this.depthTexture) this.depthTexture.destroy();
    this.createDepthTexture(w, h);
  }

  /**
   * @param highlightBlock 조준 중인 블록 좌표. 조준 대상이 없으면 null이라 외곽선을 건너뛴다.
   */
  render(camera: Camera, _time: number, highlightBlock: Vec3 | null = null) {
    const view = camera.getViewMatrix();
    const proj = camera.getProjectionMatrix(this.aspect);
    const viewProj = mat4.multiply(proj, view);

    // Sun direction (slightly angled)
    const sunDir = [0.4, 0.8, 0.3];
    const sunLen = Math.sqrt(sunDir[0] ** 2 + sunDir[1] ** 2 + sunDir[2] ** 2);
    sunDir[0] /= sunLen;
    sunDir[1] /= sunLen;
    sunDir[2] /= sunLen;

    // Fog color matches sky bottom
    const fogColor = [0.7, 0.82, 0.95];

    // Write global uniforms
    const globalData = new Float32Array(GLOBAL_UNIFORM_SIZE / 4);
    globalData.set(viewProj, 0); // 0-15: viewProj
    globalData.set(camera.position, 16); // 16-18: cameraPos
    // 19: pad
    globalData.set(sunDir, 20); // 20-22: sunDir
    // 23: pad
    globalData.set(fogColor, 24); // 24-26: fogColor
    globalData[27] = 0.008; // fogDensity
    this.device.queue.writeBuffer(this.globalUniformBuffer, 0, globalData);

    // Generate chunks around camera
    const renderDistance = 8;
    this.world.generateAround(camera.position[0], camera.position[2], renderDistance);

    // Begin render pass
    const encoder = this.device.createCommandEncoder();
    const textureView = this.context.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.7, g: 0.82, b: 0.95, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: this.depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });

    // Sky
    pass.setPipeline(this.skyPipeline);
    pass.draw(3);

    // Blocks
    pass.setPipeline(this.blockPipeline);
    pass.setBindGroup(0, this.globalBindGroup);

    const ccx = Math.floor(camera.position[0] / CHUNK_SIZE);
    const ccz = Math.floor(camera.position[2] / CHUNK_SIZE);

    for (let dx = -renderDistance; dx <= renderDistance; dx++) {
      for (let dz = -renderDistance; dz <= renderDistance; dz++) {
        const cx = ccx + dx;
        const cz = ccz + dz;
        const mesh = this.getOrCreateChunkMesh(cx, cz);
        if (mesh) {
          pass.setVertexBuffer(0, mesh.buffer);
          pass.draw(mesh.vertexCount);
        }
      }
    }

    // Highlight (조준 블록 외곽선) — 블록 위에 덮어 그려야 하므로 마지막에
    if (highlightBlock) {
      this.drawHighlight(pass, highlightBlock);
    }

    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  /**
   * @description 단위 큐브 모서리를 블록 위치로 옮겨 외곽선을 그리는 함수
   *
   * 정점을 매 프레임 새로 계산하지만 24개뿐이라 부담이 없고,
   * 버퍼 하나를 계속 덮어쓰므로 GPU 메모리도 늘지 않는다.
   */
  private drawHighlight(pass: GPURenderPassEncoder, block: Vec3) {
    for (let i = 0; i < CUBE_EDGES.length; i += 3) {
      // 0 또는 1인 단위 좌표를 바깥쪽으로 밀어 살짝 부풀린다.
      // 0 → -EXPAND, 1 → 1 + EXPAND
      this.highlightVertices[i] =
        block[0] + CUBE_EDGES[i] + (CUBE_EDGES[i] === 0 ? -HIGHLIGHT_EXPAND : HIGHLIGHT_EXPAND);
      this.highlightVertices[i + 1] =
        block[1] +
        CUBE_EDGES[i + 1] +
        (CUBE_EDGES[i + 1] === 0 ? -HIGHLIGHT_EXPAND : HIGHLIGHT_EXPAND);
      this.highlightVertices[i + 2] =
        block[2] +
        CUBE_EDGES[i + 2] +
        (CUBE_EDGES[i + 2] === 0 ? -HIGHLIGHT_EXPAND : HIGHLIGHT_EXPAND);
    }

    this.device.queue.writeBuffer(this.highlightBuffer, 0, this.highlightVertices);

    pass.setPipeline(this.highlightPipeline);
    pass.setBindGroup(0, this.highlightBindGroup);
    pass.setVertexBuffer(0, this.highlightBuffer);
    pass.draw(CUBE_EDGES.length / 3);
  }

  /**
   * @description 블록이 바뀐 청크의 메시를 버리는 함수 — 다음 프레임에 lazy하게 재생성된다
   *
   * 수정된 청크 하나만 버리면 충분하다. buildMesh의 면 컬링은 청크 로컬 getBlock을
   * 쓰는데, 범위 밖(옆 청크)을 Air로 취급해 경계 면은 항상 그려지기 때문에
   * 경계 블록을 부숴도 옆 청크 메시는 이미 올바른 상태다.
   */
  invalidateChunkAt(wx: number, wz: number) {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const key = chunkKey(cx, cz);
    const mesh = this.chunkMeshes.get(key);
    if (mesh) {
      // GPU 메모리 반납과 캐시 제거는 별개의 작업이라 둘 다 필요하다.
      // destroy()만 하면 파괴된 버퍼가 캐시에 남아 다음 프레임에 그대로 쓰이고,
      // delete()만 하면 VRAM이 GC 타이밍에 맡겨진 채 쌓인다.
      mesh.buffer.destroy();
      this.chunkMeshes.delete(key);
    }
  }

  private createDepthTexture(w: number, h: number) {
    this.depthTexture = this.device.createTexture({
      size: [w, h],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.aspect = w / h;
  }

  private createPipelines() {
    // Block pipeline
    const blockModule = this.device.createShaderModule({ code: BLOCK_WGSL });
    this.blockPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: blockModule,
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: 36, // position(3) + normal(3) + color(3) = 9 floats * 4 bytes
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x3' },
              { shaderLocation: 2, offset: 24, format: 'float32x3' },
            ],
          },
        ],
      },
      fragment: {
        module: blockModule,
        entryPoint: 'fs_main',
        targets: [{ format: this.format }],
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
    });

    // Sky pipeline (full-screen quad, rendered behind everything)
    const skyModule = this.device.createShaderModule({ code: SKY_WGSL });
    this.skyPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: skyModule,
        entryPoint: 'vs_main',
        buffers: [],
      },
      fragment: {
        module: skyModule,
        entryPoint: 'fs_main',
        targets: [{ format: this.format }],
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: false,
        depthCompare: 'less-equal',
      },
      primitive: { topology: 'triangle-list' },
    });

    // Highlight pipeline (조준 블록 외곽선)
    const highlightModule = this.device.createShaderModule({ code: HIGHLIGHT_WGSL });
    this.highlightPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: highlightModule,
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: 12, // position(3) * 4 bytes
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
          },
        ],
      },
      fragment: {
        module: highlightModule,
        entryPoint: 'fs_main',
        targets: [{ format: this.format }],
      },
      depthStencil: {
        format: 'depth24plus',
        // 외곽선은 깊이를 남기지 않는다. 블록에 가려지는 판정만 필요하고,
        // 뒤에 그려질 것도 없어서 깊이 버퍼를 오염시킬 이유가 없다.
        depthWriteEnabled: false,
        depthCompare: 'less',
      },
      primitive: { topology: 'line-list' },
    });
  }

  private createUniformBuffers() {
    this.globalUniformBuffer = this.device.createBuffer({
      size: GLOBAL_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.globalBindGroup = this.device.createBindGroup({
      layout: this.blockPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.globalUniformBuffer } }],
    });

    // layout: 'auto'는 파이프라인마다 별도의 레이아웃을 만들기 때문에,
    // 같은 유니폼 버퍼를 쓰더라도 바인드 그룹은 파이프라인별로 따로 만들어야 한다.
    this.highlightBindGroup = this.device.createBindGroup({
      layout: this.highlightPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.globalUniformBuffer } }],
    });

    this.highlightBuffer = this.device.createBuffer({
      size: CUBE_EDGES.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  private getOrCreateChunkMesh(cx: number, cz: number): ChunkMesh | null {
    const key = chunkKey(cx, cz);
    let mesh = this.chunkMeshes.get(key);
    if (mesh) return mesh;

    const chunk = this.world.getChunk(cx, cz);
    const { vertices, vertexCount } = chunk.buildMesh();

    if (vertexCount === 0) return null;

    const buffer = this.device.createBuffer({
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX,
      mappedAtCreation: true,
    });
    new Float32Array(buffer.getMappedRange()).set(vertices);
    buffer.unmap();

    mesh = { buffer, vertexCount };
    this.chunkMeshes.set(key, mesh);
    return mesh;
  }
}
