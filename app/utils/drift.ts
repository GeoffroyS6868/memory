export interface Vec3 {
  x: number
  y: number
  z: number
}

interface Wave {
  amp: number
  freq: number
  phase: number
}

export interface DriftParams {
  home: Vec3
  x: Wave[]
  y: Wave[]
  z: Wave[]
}

export interface Projected {
  x: number
  y: number
  scale: number
  opacity: number
  blur: number
  zIndex: number
}

const BOUNDS = {
  x: [-1, 1],
  y: [-1, 0.55],
  z: [0, 1]
} as const

export function hashString(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function clamp(v: number, [min, max]: readonly [number, number]): number {
  return Math.min(max, Math.max(min, v))
}

function makeWaves(rand: () => number, total: number): Wave[] {
  const count = 2 + Math.floor(rand() * 2)
  return Array.from({ length: count }, () => ({
    amp: (total / count) * (0.7 + rand() * 0.6),
    freq: 0.008 + rand() * 0.022,
    phase: rand() * Math.PI * 2
  }))
}

export function createDrift(id: string, zRange: readonly [number, number] = [0.1, 0.9]): DriftParams {
  const rand = mulberry32(hashString(id))
  const home = {
    x: -0.8 + rand() * 1.6,
    y: -0.8 + rand() * 1.15,
    z: zRange[0] + rand() * (zRange[1] - zRange[0])
  }
  return {
    home,
    x: makeWaves(rand, 0.12),
    y: makeWaves(rand, 0.12),
    z: makeWaves(rand, 0.25)
  }
}

function sum(waves: Wave[], t: number): number {
  let s = 0
  for (const w of waves) s += w.amp * Math.sin(2 * Math.PI * w.freq * t + w.phase)
  return s
}

export function driftAt(params: DriftParams, t: number): Vec3 {
  return {
    x: clamp(params.home.x + sum(params.x, t), BOUNDS.x),
    y: clamp(params.home.y + sum(params.y, t), BOUNDS.y),
    z: clamp(params.home.z + sum(params.z, t), BOUNDS.z)
  }
}

export interface Kick {
  offset: Vec3
  vel: Vec3
}

const KICK_DRAG_TAU = 1.2
const KICK_SPRING = 0.15
const KICK_REST = 1e-3

export const RESTITUTION = 0.6

function depthScale(z: number): number {
  return 1 / (1 + z * 1.3)
}

// Mild perspective on position so far bubbles still use the whole screen
function spreadAt(z: number): number {
  return 0.88 * (1 - 0.35 * (1 - depthScale(z)))
}

/** Inverse of project() for x/y: screen pixels at depth z to normalized coordinates. */
export function unproject(px: number, py: number, z: number, width: number, height: number): { x: number, y: number } {
  const spread = spreadAt(z)
  return {
    x: (px - width / 2) / ((width / 2) * spread),
    y: (py - height / 2) / ((height / 2) * spread)
  }
}

/** A pixel displacement at depth z, expressed in normalized units. */
export function pixelsToNorm(dx: number, dy: number, z: number, width: number, height: number): { x: number, y: number } {
  const spread = spreadAt(z)
  return { x: dx / ((width / 2) * spread), y: dy / ((height / 2) * spread) }
}

/** A normalized x/y velocity at depth z = 0, in pixels per second. */
export function toPixelVelocity(vel: Vec3, width: number, height: number): { x: number, y: number } {
  const spread = spreadAt(0)
  return { x: vel.x * (width / 2) * spread, y: vel.y * (height / 2) * spread }
}

export function launchVelocity(rand: () => number = Math.random): Vec3 {
  return {
    x: -0.8 + rand() * 1.6,
    y: -2.6 + rand() * 1.2,
    z: 0.3 + rand() * 0.3
  }
}

/** Semi-implicit Euler: air drag, then a weak spring back to the drift, then position. */
export function stepKick(kick: Kick, dt: number): void {
  const drag = Math.exp(-dt / KICK_DRAG_TAU)
  for (const axis of ['x', 'y', 'z'] as const) {
    kick.vel[axis] = kick.vel[axis] * drag - KICK_SPRING * kick.offset[axis] * dt
    kick.offset[axis] += kick.vel[axis] * dt
  }
}

export function kickAtRest(kick: Kick): boolean {
  return Math.hypot(kick.vel.x, kick.vel.y, kick.vel.z) < KICK_REST
    && Math.hypot(kick.offset.x, kick.offset.y, kick.offset.z) < KICK_REST
}

export function project(pos: Vec3, width: number, height: number): Projected {
  const scale = depthScale(pos.z)
  const spread = spreadAt(pos.z)
  return {
    x: width / 2 + pos.x * (width / 2) * spread,
    y: height / 2 + pos.y * (height / 2) * spread,
    scale,
    opacity: 1 - pos.z * 0.6,
    blur: Math.round(pos.z * 2.5 * 2) / 2,
    zIndex: Math.round((1 - pos.z) * 1000)
  }
}
