import { mat4, type Mat4, type Vec3 } from './math';
import { SPHERE_WGSL, ORBIT_WGSL, RING_WGSL, STAR_WGSL } from './shaders';
import { generateSphere, generateRing, generateOrbitLine, generateStars } from './geometry';
import { Camera } from './camera';
import { SUN, PLANETS, STAR_COUNT, type PlanetDef } from './scene';

const GLOBAL_UNIFORM_SIZE = 128;
const OBJECT_UNIFORM_SIZE = 96;
const OBJECT_COUNT = 1 + PLANETS.length + 1; // sun + planets + saturn ring

export class Renderer {
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private format!: GPUTextureFormat;
  private depthTexture!: GPUTexture;
  private aspect = 1;

  // Pipelines
  private spherePipeline!: GPURenderPipeline;
  private orbitPipeline!: GPURenderPipeline;
  private ringPipeline!: GPURenderPipeline;
  private starPipeline!: GPURenderPipeline;

  // Buffers
  private globalUniformBuffer!: GPUBuffer;
  private objectUniformBuffers: GPUBuffer[] = [];
  private globalBindGroup!: GPUBindGroup;
  private objectBindGroups: GPUBindGroup[] = [];

  // Geometry
  private sphereVB!: GPUBuffer;
  private sphereIB!: GPUBuffer;
  private sphereIndexCount = 0;
  private orbitVBs: GPUBuffer[] = [];
  private orbitVertCounts: number[] = [];
  private ringVB!: GPUBuffer;
  private ringIB!: GPUBuffer;
  private ringIndexCount = 0;
  private starVB!: GPUBuffer;
  private starCount = 0;

  // Per-pipeline bind groups (created once at init, not per-frame)
  private orbitGlobalBG!: GPUBindGroup;
  private ringGlobalBG!: GPUBindGroup;
  private ringObjBG!: GPUBindGroup;
  private starGlobalBG!: GPUBindGroup;

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
    this.uploadGeometry();
  }

  onResize(w: number, h: number) {
    if (this.depthTexture) this.depthTexture.destroy();
    this.createDepthTexture(w, h);
    this.aspect = w / h;
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
    // Sphere pipeline
    const sphereModule = this.device.createShaderModule({ code: SPHERE_WGSL });
    this.spherePipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: sphereModule,
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: 32,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x3' },
              { shaderLocation: 2, offset: 24, format: 'float32x2' },
            ],
          },
        ],
      },
      fragment: {
        module: sphereModule,
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

    // Orbit pipeline
    const orbitModule = this.device.createShaderModule({ code: ORBIT_WGSL });
    this.orbitPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: orbitModule,
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: 12,
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
          },
        ],
      },
      fragment: {
        module: orbitModule,
        entryPoint: 'fs_main',
        targets: [
          {
            format: this.format,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          },
        ],
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: false,
        depthCompare: 'less',
      },
      primitive: { topology: 'line-strip' },
    });

    // Ring pipeline
    const ringModule = this.device.createShaderModule({ code: RING_WGSL });
    this.ringPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: ringModule,
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: 20, // pos(3) + uv(2) = 5 floats
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x2' },
            ],
          },
        ],
      },
      fragment: {
        module: ringModule,
        entryPoint: 'fs_main',
        targets: [
          {
            format: this.format,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          },
        ],
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: false,
        depthCompare: 'less',
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    });

    // Star pipeline
    const starModule = this.device.createShaderModule({ code: STAR_WGSL });
    this.starPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: starModule,
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: 28, // center(3) + color(3) + size(1) = 7 floats
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x3' },
              { shaderLocation: 2, offset: 24, format: 'float32' },
            ],
          },
        ],
      },
      fragment: {
        module: starModule,
        entryPoint: 'fs_main',
        targets: [
          {
            format: this.format,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            },
          },
        ],
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: false,
        depthCompare: 'less',
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  private createUniformBuffers() {
    this.globalUniformBuffer = this.device.createBuffer({
      size: GLOBAL_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    for (let i = 0; i < OBJECT_COUNT; i++) {
      this.objectUniformBuffers.push(
        this.device.createBuffer({
          size: OBJECT_UNIFORM_SIZE,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        }),
      );
    }

    // Global bind group for sphere pipeline
    this.globalBindGroup = this.device.createBindGroup({
      layout: this.spherePipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.globalUniformBuffer } }],
    });

    // Per-object bind groups
    for (const buf of this.objectUniformBuffers) {
      this.objectBindGroups.push(
        this.device.createBindGroup({
          layout: this.spherePipeline.getBindGroupLayout(1),
          entries: [{ binding: 0, resource: { buffer: buf } }],
        }),
      );
    }

    // Per-pipeline global bind groups
    this.orbitGlobalBG = this.device.createBindGroup({
      layout: this.orbitPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.globalUniformBuffer } }],
    });
    this.ringGlobalBG = this.device.createBindGroup({
      layout: this.ringPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.globalUniformBuffer } }],
    });
    this.ringObjBG = this.device.createBindGroup({
      layout: this.ringPipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: this.objectUniformBuffers[1 + PLANETS.length] } },
      ],
    });
    this.starGlobalBG = this.device.createBindGroup({
      layout: this.starPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.globalUniformBuffer } }],
    });
  }

  private createBuffer(data: ArrayBufferView, usage: number): GPUBuffer {
    const buf = this.device.createBuffer({
      size: data.byteLength,
      usage,
      mappedAtCreation: true,
    });
    if (data instanceof Float32Array) {
      new Float32Array(buf.getMappedRange()).set(data);
    } else {
      new Uint16Array(buf.getMappedRange()).set(data as Uint16Array);
    }
    buf.unmap();
    return buf;
  }

  private uploadGeometry() {
    // Sphere (shared by sun + all planets)
    const sphere = generateSphere(32, 32);
    this.sphereVB = this.createBuffer(sphere.vertices, GPUBufferUsage.VERTEX);
    this.sphereIB = this.createBuffer(sphere.indices, GPUBufferUsage.INDEX);
    this.sphereIndexCount = sphere.indices.length;

    // Orbit lines
    for (const planet of PLANETS) {
      const orbitVerts = generateOrbitLine(planet.orbitR, 128);
      this.orbitVBs.push(this.createBuffer(orbitVerts, GPUBufferUsage.VERTEX));
      this.orbitVertCounts.push(orbitVerts.length / 3);
    }

    // Saturn ring
    const saturn = PLANETS.find((p) => p.rings)!;
    const ring = generateRing(saturn.ringInner!, saturn.ringOuter!, 64);
    this.ringVB = this.createBuffer(ring.vertices, GPUBufferUsage.VERTEX);
    this.ringIB = this.createBuffer(ring.indices, GPUBufferUsage.INDEX);
    this.ringIndexCount = ring.indices.length;

    // Stars
    const stars = generateStars(STAR_COUNT);
    this.starVB = this.createBuffer(stars.instances, GPUBufferUsage.VERTEX);
    this.starCount = stars.count;
  }

  private writeObjectUniform(
    idx: number,
    model: Mat4,
    color: Vec3,
    emissive: number,
    glowColor: Vec3,
  ) {
    const data = new Float32Array(OBJECT_UNIFORM_SIZE / 4);
    data.set(model, 0); // offset 0: mat4x4 (16 floats)
    data.set(color, 16); // offset 64: color vec3
    data[19] = emissive; // offset 76: emissive
    data.set(glowColor, 20); // offset 80: glowColor vec3
    this.device.queue.writeBuffer(this.objectUniformBuffers[idx], 0, data);
  }

  render(camera: Camera, time: number) {
    const view = camera.getViewMatrix();
    const proj = camera.getProjectionMatrix(this.aspect);
    const viewProj = mat4.multiply(proj, view);
    const eye = camera.getEye();

    // Extract camera right and up vectors from view matrix
    const cameraRight: Vec3 = [view[0], view[4], view[8]];
    const cameraUp: Vec3 = [view[1], view[5], view[9]];

    // Write global uniforms
    const globalData = new Float32Array(GLOBAL_UNIFORM_SIZE / 4);
    globalData.set(viewProj, 0); // 0-15: viewProj
    globalData.set(eye, 16); // 16-18: cameraPos
    // 19: pad
    globalData.set(cameraRight, 20); // 20-22: cameraRight
    // 23: pad
    globalData.set(cameraUp, 24); // 24-26: cameraUp
    // 27: pad
    globalData[28] = time; // 28: time
    this.device.queue.writeBuffer(this.globalUniformBuffer, 0, globalData);

    // Sun model matrix
    const sunModel = mat4.scale(mat4.identity(), SUN.radius, SUN.radius, SUN.radius);
    this.writeObjectUniform(0, sunModel, SUN.color, 1.0, SUN.glowColor);

    // Planet model matrices
    for (let i = 0; i < PLANETS.length; i++) {
      const p = PLANETS[i];
      const angle = time * p.speed * 0.2;
      const ox = p.orbitR * Math.cos(angle);
      const oz = p.orbitR * Math.sin(angle);

      let m = mat4.identity();
      m = mat4.translate(m, ox, 0, oz);
      m = mat4.rotateZ(m, p.tilt);
      m = mat4.scale(m, p.radius, p.radius, p.radius);

      this.writeObjectUniform(1 + i, m, p.color, 0.0, [0, 0, 0]);
    }

    // Saturn ring model
    const saturn = PLANETS.find((p) => p.rings)!;
    const saturnAngle = time * saturn.speed * 0.2;
    const sx = saturn.orbitR * Math.cos(saturnAngle);
    const sz = saturn.orbitR * Math.sin(saturnAngle);
    let ringModel = mat4.identity();
    ringModel = mat4.translate(ringModel, sx, 0, sz);
    ringModel = mat4.rotateX(ringModel, saturn.tilt);
    this.writeObjectUniform(1 + PLANETS.length, ringModel, [0.7, 0, 0], 0.0, [0, 0, 0]);

    // Begin render pass
    const encoder = this.device.createCommandEncoder();
    const textureView = this.context.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.01, g: 0.01, b: 0.02, a: 1 },
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

    // --- Opaque pass: spheres ---
    pass.setPipeline(this.spherePipeline);
    pass.setBindGroup(0, this.globalBindGroup);
    pass.setVertexBuffer(0, this.sphereVB);
    pass.setIndexBuffer(this.sphereIB, 'uint16');

    // Sun
    pass.setBindGroup(1, this.objectBindGroups[0]);
    pass.drawIndexed(this.sphereIndexCount);

    // Planets
    for (let i = 0; i < PLANETS.length; i++) {
      pass.setBindGroup(1, this.objectBindGroups[1 + i]);
      pass.drawIndexed(this.sphereIndexCount);
    }

    // --- Transparent pass ---

    // Orbit lines
    pass.setPipeline(this.orbitPipeline);
    pass.setBindGroup(0, this.orbitGlobalBG);
    for (let i = 0; i < PLANETS.length; i++) {
      pass.setVertexBuffer(0, this.orbitVBs[i]);
      pass.draw(this.orbitVertCounts[i]);
    }

    // Saturn ring
    pass.setPipeline(this.ringPipeline);
    pass.setBindGroup(0, this.ringGlobalBG);
    pass.setBindGroup(1, this.ringObjBG);
    pass.setVertexBuffer(0, this.ringVB);
    pass.setIndexBuffer(this.ringIB, 'uint16');
    pass.drawIndexed(this.ringIndexCount);

    // Stars
    pass.setPipeline(this.starPipeline);
    pass.setBindGroup(0, this.starGlobalBG);
    pass.setVertexBuffer(0, this.starVB);
    pass.draw(6, this.starCount);

    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }
}
