import { mat4 } from './math';
import { BLOCK_WGSL, SKY_WGSL } from './shaders';
import { Camera } from './camera';
import { World, CHUNK_SIZE } from './world';

const GLOBAL_UNIFORM_SIZE = 128; // viewProj(64) + cameraPos(12+4) + sunDir(12+4) + fogColor(12+4) + fogDensity(4+12pad)

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

  private globalUniformBuffer!: GPUBuffer;
  private globalBindGroup!: GPUBindGroup;

  private chunkMeshes = new Map<string, ChunkMesh>();
  world!: World;

  async init(canvas: HTMLCanvasElement) {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
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
  }

  private getOrCreateChunkMesh(key: string, cx: number, cz: number): ChunkMesh | null {
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

  render(camera: Camera, _time: number) {
    const view = camera.getViewMatrix();
    const proj = camera.getProjectionMatrix(this.aspect);
    const viewProj = mat4.multiply(proj, view);

    // Sun direction (slightly angled)
    const sunDir = [0.4, 0.8, 0.3];
    const sunLen = Math.sqrt(sunDir[0] ** 2 + sunDir[1] ** 2 + sunDir[2] ** 2);
    sunDir[0] /= sunLen; sunDir[1] /= sunLen; sunDir[2] /= sunLen;

    // Fog color matches sky bottom
    const fogColor = [0.70, 0.82, 0.95];

    // Write global uniforms
    const globalData = new Float32Array(GLOBAL_UNIFORM_SIZE / 4);
    globalData.set(viewProj, 0);          // 0-15: viewProj
    globalData.set(camera.position, 16);  // 16-18: cameraPos
    // 19: pad
    globalData.set(sunDir, 20);           // 20-22: sunDir
    // 23: pad
    globalData.set(fogColor, 24);         // 24-26: fogColor
    globalData[27] = 0.008;              // fogDensity
    this.device.queue.writeBuffer(this.globalUniformBuffer, 0, globalData);

    // Generate chunks around camera
    const renderDistance = 4;
    this.world.generateAround(camera.position[0], camera.position[2], renderDistance);

    // Begin render pass
    const encoder = this.device.createCommandEncoder();
    const textureView = this.context.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.70, g: 0.82, b: 0.95, a: 1 },
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
        const key = `${cx},${cz}`;
        const mesh = this.getOrCreateChunkMesh(key, cx, cz);
        if (mesh) {
          pass.setVertexBuffer(0, mesh.buffer);
          pass.draw(mesh.vertexCount);
        }
      }
    }

    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }
}
