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

export function project(pos: Vec3, width: number, height: number): Projected {
  const scale = 1 / (1 + pos.z * 1.3)
  // Mild perspective on position so far bubbles still use the whole screen
  const spread = 0.88 * (1 - 0.35 * (1 - scale))
  return {
    x: width / 2 + pos.x * (width / 2) * spread,
    y: height / 2 + pos.y * (height / 2) * spread,
    scale,
    opacity: 1 - pos.z * 0.6,
    blur: Math.round(pos.z * 2.5 * 2) / 2,
    zIndex: Math.round((1 - pos.z) * 1000)
  }
}
