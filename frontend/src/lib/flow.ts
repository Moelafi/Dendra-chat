/**
 * "Flow field": thousands of particles drift on a meandering current, like plankton in a
 * river, and bend around the middle of the screen the way water flows around a stone.
 * Slow particles are earthy blue, fast ones phosphor green; each leaves a fading trail.
 * WebGL2, no dependencies. Particles move on the CPU; the GPU draws and fades the trails.
 */

const BLUE = [43, 110, 158]
const MOSS = [47, 143, 138]
const GREEN = [125, 255, 176]

/** Per frame at 60 fps, in CSS pixels. */
const SPEED = 1.4
/** One particle per this many square pixels, capped. */
const DENSITY = 300
const MAX_PARTICLES = 4500
/** Trail fade per frame: multiply, then subtract a floor so trails fully clear. */
const FADE = 0.055
const FADE_FLOOR = 1.5 / 255
const ALPHA = 0.32
/** Radius (fraction of the shorter side) of the calm area the current flows around. */
const STONE = 0.24

const VERT = `#version 300 es
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec4 a_color;
uniform vec2 u_size;
out vec4 v_color;
void main() {
  vec2 p = a_pos / u_size * 2.0 - 1.0;
  gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
  v_color = a_color;
}`

const FRAG = `#version 300 es
precision mediump float;
in vec4 v_color;
out vec4 o;
void main() { o = v_color; }`

const QUAD_VERT = `#version 300 es
layout(location = 0) in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`

const QUAD_FRAG = `#version 300 es
precision mediump float;
uniform vec4 u_color;
out vec4 o;
void main() { o = u_color; }`

function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ] as const) {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader error')
    gl.attachShader(p, s)
  }
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link error')
  return p
}

/** 0 (slow) to 1 (fast) → blue, moss, phosphor green, as 0..1 floats. */
function colorAt(t: number): [number, number, number] {
  const [a, b, k] = t < 0.5 ? [BLUE, MOSS, t / 0.5] : [MOSS, GREEN, (t - 0.5) / 0.5]
  return [0, 1, 2].map((i) => (a[i] + (b[i] - a[i]) * k) / 255) as [number, number, number]
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Start the animation on `canvas`. Returns a function that stops it. Does nothing without WebGL2. */
export function startFlow(canvas: HTMLCanvasElement, opts: { reducedMotion?: boolean } = {}): () => void {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: true, preserveDrawingBuffer: true })
  if (!gl) return () => {}

  const lines = program(gl, VERT, FRAG)
  const quad = program(gl, QUAD_VERT, QUAD_FRAG)
  const uSize = gl.getUniformLocation(lines, 'u_size')
  const uColor = gl.getUniformLocation(quad, 'u_color')

  const quadVao = gl.createVertexArray()
  gl.bindVertexArray(quadVao)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

  const lineVao = gl.createVertexArray()
  const lineBuf = gl.createBuffer()
  gl.bindVertexArray(lineVao)
  gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0)
  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 24, 8)
  gl.enable(gl.BLEND)

  let w = 0
  let h = 0
  let count = 0
  // Per particle: x, y, age, lifespan (seconds).
  let px = new Float32Array(0)
  let py = new Float32Array(0)
  let age = new Float32Array(0)
  let life = new Float32Array(0)
  let verts = new Float32Array(0)
  let time = 0
  let frame = 0
  let last = 0

  function spawn(i: number, anywhere: boolean) {
    const fromEdge = !anywhere && Math.random() < 0.6
    px[i] = fromEdge ? -5 : Math.random() * w
    py[i] = Math.random() * h
    age[i] = 0
    life[i] = 3 + Math.random() * 5
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    w = canvas.clientWidth
    h = canvas.clientHeight
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    gl!.viewport(0, 0, canvas.width, canvas.height)
    gl!.clearColor(0, 0, 0, 1)
    gl!.clear(gl!.COLOR_BUFFER_BIT)
    count = Math.min(MAX_PARTICLES, Math.round((w * h) / DENSITY))
    px = new Float32Array(count)
    py = new Float32Array(count)
    age = new Float32Array(count)
    life = new Float32Array(count)
    verts = new Float32Array(count * 12)
    for (let i = 0; i < count; i++) {
      spawn(i, true)
      age[i] = Math.random() * life[i]
    }
  }

  /** Direction (angle) and speed (0..1) of the current at a point. */
  function field(x: number, y: number): [number, number, number] {
    const t = time
    const n =
      Math.sin(x * 0.0035 + t * 0.08 + Math.sin(y * 0.006 - t * 0.11) * 1.6) +
      0.5 * Math.sin(y * 0.009 + x * 0.002 - t * 0.06 + Math.sin(x * 0.01 + t * 0.05) * 0.9)
    let angle = -0.1 + n * 0.75
    let dx = Math.cos(angle)
    let dy = Math.sin(angle)
    // Flow around the stone in the middle: turn along its edge, and push out if inside.
    const cx = x - w / 2
    const cy = y - h / 2
    const r = Math.hypot(cx, cy) || 1
    const R = Math.min(w, h) * STONE
    const k = smoothstep(R * 1.7, R, r)
    if (k > 0) {
      const sign = dx * -cy + dy * cx >= 0 ? 1 : -1
      const out = r < R ? 0.8 : 0.15
      dx += k * (((-cy / r) * sign + (cx / r) * out) * 1.4 - dx)
      dy += k * (((cx / r) * sign + (cy / r) * out) * 1.4 - dy)
      angle = Math.atan2(dy, dx)
      dx = Math.cos(angle)
      dy = Math.sin(angle)
    }
    // Faster along the stone's edge and in the current's swells.
    const swell = 0.5 + 0.5 * Math.sin(x * 0.005 - y * 0.004 + t * 0.2)
    const speed = Math.min(1, 0.25 + 0.5 * swell + 0.45 * k)
    return [dx, dy, speed]
  }

  function step(dt: number) {
    time += dt / 60
    for (let i = 0; i < count; i++) {
      const [dx, dy, speed] = field(px[i], py[i])
      const x0 = px[i]
      const y0 = py[i]
      const v = SPEED * (0.4 + 0.9 * speed) * dt
      px[i] += dx * v
      py[i] += dy * v
      age[i] += dt / 60
      // Fade in at birth and out at the end of life, so particles never pop.
      const a = ALPHA * Math.min(1, age[i] / 0.6, (life[i] - age[i]) / 0.8)
      const [r, g, b] = colorAt(speed)
      verts.set([x0, y0, r, g, b, a, px[i], py[i], r, g, b, a], i * 12)
      if (age[i] > life[i] || px[i] > w + 5 || px[i] < -10 || py[i] < -5 || py[i] > h + 5) spawn(i, false)
    }
  }

  function draw() {
    const g = gl!
    g.useProgram(quad)
    g.bindVertexArray(quadVao)
    g.blendEquation(g.FUNC_ADD)
    g.blendFunc(g.ZERO, g.ONE_MINUS_SRC_ALPHA)
    g.uniform4f(uColor, 0, 0, 0, FADE)
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4)
    g.blendEquation(g.FUNC_REVERSE_SUBTRACT)
    g.blendFunc(g.ONE, g.ONE)
    g.uniform4f(uColor, FADE_FLOOR, FADE_FLOOR, FADE_FLOOR, 0)
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4)

    g.useProgram(lines)
    g.bindVertexArray(lineVao)
    g.blendEquation(g.FUNC_ADD)
    g.blendFunc(g.SRC_ALPHA, g.ONE)
    g.uniform2f(uSize, w, h)
    g.bindBuffer(g.ARRAY_BUFFER, lineBuf)
    g.bufferData(g.ARRAY_BUFFER, verts, g.DYNAMIC_DRAW)
    g.drawArrays(g.LINES, 0, count * 2)
  }

  function tick(now: number) {
    frame = requestAnimationFrame(tick)
    const dt = Math.min((now - (last || now)) / (1000 / 60), 3)
    last = now
    step(dt)
    draw()
  }

  // Reduced motion: let the trails build up briefly, then hold that frame.
  function still() {
    for (let i = 0; i < 90; i++) {
      step(1)
      draw()
    }
  }

  resize()
  const observer = new ResizeObserver(() => {
    if (canvas.clientWidth !== w || canvas.clientHeight !== h) {
      resize()
      if (opts.reducedMotion) still()
    }
  })
  observer.observe(canvas)

  if (opts.reducedMotion) still()
  else frame = requestAnimationFrame(tick)

  return () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
  }
}
