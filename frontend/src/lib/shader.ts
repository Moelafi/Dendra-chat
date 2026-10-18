/**
 * Runs a fragment shader over a whole canvas (WebGL2). The shader gets `u_res` (pixels)
 * and `u_time` (seconds) and writes premultiplied `o`. Shared GLSL helpers live in `GLSL_LIB`.
 */

export const GLSL_LIB = `
const vec3 BLUE = vec3(0.122, 0.310, 0.470);
const vec3 DEEP = vec3(0.169, 0.498, 0.584);
const vec3 MOSS = vec3(0.247, 0.749, 0.525);
const vec3 GREEN = vec3(0.490, 1.000, 0.690);

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
`

const VERT = `#version 300 es
void main() {
  // One triangle that covers the screen.
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`

export interface ShaderOptions {
  /** Render resolution relative to the device pixel ratio (e.g. 0.5 for soft backgrounds). */
  scale?: number
  /** Show one still frame at this time instead of animating. */
  stillAt?: number
}

/** Start `frag` on `canvas`. Returns a function that stops it. Does nothing without WebGL2. */
export function startShader(canvas: HTMLCanvasElement, frag: string, opts: ShaderOptions = {}): () => void {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false })
  if (!gl) return () => {}

  const prog = gl.createProgram()!
  for (const [type, src] of [
    [gl.VERTEX_SHADER, VERT],
    [gl.FRAGMENT_SHADER, frag],
  ] as const) {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader error')
    gl.attachShader(prog, s)
  }
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link error')
  gl.useProgram(prog)
  gl.bindVertexArray(gl.createVertexArray())
  const uRes = gl.getUniformLocation(prog, 'u_res')
  const uTime = gl.getUniformLocation(prog, 'u_time')

  let frame = 0
  const start = performance.now()

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * (opts.scale ?? 1)
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr))
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr))
    gl!.viewport(0, 0, canvas.width, canvas.height)
  }

  function draw(time: number) {
    gl!.uniform2f(uRes, canvas.width, canvas.height)
    gl!.uniform1f(uTime, time)
    gl!.drawArrays(gl!.TRIANGLES, 0, 3)
  }

  function tick(now: number) {
    frame = requestAnimationFrame(tick)
    draw((now - start) / 1000)
  }

  resize()
  const observer = new ResizeObserver(() => {
    resize()
    if (opts.stillAt !== undefined) draw(opts.stillAt)
  })
  observer.observe(canvas)
  if (opts.stillAt !== undefined) draw(opts.stillAt)
  else frame = requestAnimationFrame(tick)

  return () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
  }
}
