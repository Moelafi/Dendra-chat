/**
 * "Growing delta": one glowing thread enters at the left edge and grows across to the right,
 * splitting as it goes like a river delta fanning out. Colour runs from earthy blue (left) to
 * phosphor green (right), and the growing tips glow. When growth ends the pattern holds,
 * dissolves and regrows. Plain 2D canvas, no dependencies.
 */

const BLUE = [43, 110, 158]
const MOSS = [47, 143, 138]
const GREEN = [125, 255, 176]

/** Speeds and sizes are per frame at 60 fps, in CSS pixels. */
const SPEED = 2
const ROOT_WIDTH = 2.6
const MIN_WIDTH = 0.8
const MAX_DEPTH = 5
const MAX_TIPS = 32
const HOLD_MS = 2200
const FADE_MS = 1800

interface Tip {
  x: number
  y: number
  angle: number
  /** Direction this branch tends towards; splits fan these out, so the delta spreads evenly. */
  heading: number
  /** Current turning rate; drifts slowly, so paths curve smoothly instead of jittering. */
  turn: number
  /** Thickness from branching alone; lines also taper with height on screen. */
  width: number
  depth: number
  /** Distance grown since the last split. */
  dist: number
  splitAt: number
}

/** Height 0 (bottom) to 1 (top) → blue, moss, phosphor green. */
function colorAt(t: number, brightness = 1): string {
  const [a, b, k] = t < 0.5 ? [BLUE, MOSS, t / 0.5] : [MOSS, GREEN, (t - 0.5) / 0.5]
  return a.map((v, i) => Math.round((v + (b[i] - v) * k) * brightness)).join(',')
}

const rand = (min: number, max: number) => min + Math.random() * (max - min)

/** Start the animation on `canvas`. Returns a function that stops it. */
export function startDelta(canvas: HTMLCanvasElement, opts: { reducedMotion?: boolean } = {}): () => void {
  const ctx = canvas.getContext('2d')!
  // Finished segments accumulate here; the visible canvas adds the glowing tips on top.
  const trail = document.createElement('canvas')
  const tctx = trail.getContext('2d')!
  let w = 0
  let h = 0
  let tips: Tip[] = []
  let phase: 'grow' | 'hold' | 'fade' = 'grow'
  let phaseStart = 0
  let frame = 0
  let last = 0

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    w = canvas.clientWidth
    h = canvas.clientHeight
    for (const c of [canvas, trail]) {
      c.width = Math.round(w * dpr)
      c.height = Math.round(h * dpr)
    }
    // Resizing a canvas resets its state.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    tctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    tctx.lineCap = 'round'
    // Solid, pre-dimmed colours combined with "lighten": overlapping segment joints stay the
    // same colour (no dotted look), and where branches cross the brighter one wins.
    tctx.globalCompositeOperation = 'lighten'
    seed()
  }

  function seed() {
    tctx.clearRect(0, 0, w, h)
    tips = [
      {
        x: -4,
        y: h * rand(0.35, 0.65),
        angle: rand(-0.15, 0.15),
        heading: 0,
        turn: 0,
        width: ROOT_WIDTH,
        depth: 0,
        dist: 0,
        splitAt: rand(90, 170),
      },
    ]
    phase = 'grow'
  }

  function grow(dt: number) {
    const step = SPEED * dt
    const next: Tip[] = []
    for (const t of tips) {
      // Meander smoothly, with a pull back towards the branch's heading.
      t.turn = (t.turn + rand(-0.005, 0.005) * dt) * 0.96
      t.angle += t.turn * dt + (t.heading - t.angle) * 0.012 * dt
      const nx = t.x + Math.cos(t.angle) * step
      const ny = t.y + Math.sin(t.angle) * step
      // Thin branches further right get brighter so the green tips still read.
      const progress = Math.min(1, Math.max(0, nx / w))
      tctx.strokeStyle = `rgb(${colorAt(Math.min(1, progress * 1.3), 0.5 + 0.4 * progress)})`
      // Taper towards the right, so every branch thins out as it reaches the edge.
      tctx.lineWidth = Math.max(MIN_WIDTH, t.width * (1 - 0.7 * progress))
      tctx.beginPath()
      tctx.moveTo(t.x, t.y)
      tctx.lineTo(nx, ny)
      tctx.stroke()
      t.x = nx
      t.y = ny
      t.dist += step
      // Branches only end by leaving the screen, so growth always reaches the edge.
      if (nx > w + 10 || nx < -10 || ny < -10 || ny > h + 10) continue
      if (t.dist >= t.splitAt && t.depth < MAX_DEPTH && tips.length + next.length < MAX_TIPS) {
        const spread = rand(0.22, 0.45)
        for (const side of [-1, 1]) {
          // Fan out, but never point backwards or straight up or down.
          const heading = Math.max(-0.9, Math.min(0.9, t.heading + side * spread * 0.6))
          next.push({
            ...t,
            angle: t.angle + side * spread,
            heading,
            turn: side * 0.004,
            width: t.width * 0.8,
            depth: t.depth + 1,
            dist: 0,
            splitAt: rand(90, 180),
          })
        }
      } else next.push(t)
    }
    tips = next
  }

  function draw() {
    ctx.clearRect(0, 0, w, h)
    ctx.globalAlpha = phase === 'fade' ? Math.max(0, 1 - (performance.now() - phaseStart) / FADE_MS) : 1
    ctx.drawImage(trail, 0, 0, w, h)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'lighter'
    for (const t of tips) {
      const rgb = colorAt(Math.min(1, Math.max(0, t.x / w)) * 0.5 + 0.5)
      const r = 3 + t.width * 3
      const glow = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, r)
      glow.addColorStop(0, `rgba(${rgb},0.9)`)
      glow.addColorStop(1, `rgba(${rgb},0)`)
      ctx.fillStyle = glow
      ctx.fillRect(t.x - r, t.y - r, r * 2, r * 2)
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  function tick(now: number) {
    frame = requestAnimationFrame(tick)
    const dt = Math.min((now - (last || now)) / (1000 / 60), 3)
    last = now
    if (phase === 'grow') {
      grow(dt)
      if (!tips.length) {
        phase = 'hold'
        phaseStart = now
      }
    } else if (phase === 'hold' && now - phaseStart > HOLD_MS) {
      phase = 'fade'
      phaseStart = now
    } else if (phase === 'fade' && now - phaseStart > FADE_MS) {
      seed()
    }
    draw()
  }

  resize()
  const observer = new ResizeObserver(() => {
    if (canvas.clientWidth !== w || canvas.clientHeight !== h) {
      resize()
      if (opts.reducedMotion) still()
    }
  })
  observer.observe(canvas)

  // Reduced motion: grow one full pattern instantly and show it still.
  function still() {
    while (tips.length) grow(1)
    draw()
  }

  if (opts.reducedMotion) still()
  else frame = requestAnimationFrame(tick)

  return () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
  }
}
