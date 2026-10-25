<script setup lang="ts">
import type { DriftParams, Kick, Vec3 } from '~/utils/drift'

const props = defineProps<{ memos: Memo[] }>()
const emit = defineEmits<{
  toggle: [id: string]
  remove: [id: string]
}>()

interface Pop {
  startedAt: number | null
  emitted: boolean
}

interface Item {
  el: HTMLElement | null
  params: DriftParams
  bornAt: number | null
  kick: Kick | null
  w: number
  h: number
  doneBlend: number | null
  focusBlend: number
  pop: Pop | null
  held: boolean
}

const FADE_MS = 900
const KICK_MAX_DT = 0.05
// Bottom wall = top of the input area, as a distance from the viewport bottom
const FLOOR_MARGIN = 96
const POP_MS = 450
const POP_SCALE = 0.25
const DONE_TAU = 0.3
const DONE_DEPTH = 0.3
const FOCUS_TAU = 0.1
const LAUNCH_Z_INDEX = 1000

const items = new Map<string, Item>()
let raf = 0
let width = 0
let height = 0
let floorY = 0
let t0 = 0
let last = 0
let reducedMotion = false
let media: MediaQueryList | null = null

function getItem(id: string): Item {
  let item = items.get(id)
  if (!item) {
    item = { el: null, params: createDrift(id), bornAt: null, kick: null, w: 0, h: 0, doneBlend: null, focusBlend: 0, pop: null, held: false }
    items.set(id, item)
  }
  return item
}

function measureItem(item: Item) {
  if (!item.el) return
  item.w = item.el.offsetWidth
  item.h = item.el.offsetHeight
}

function setEl(id: string, el: unknown) {
  if (el instanceof HTMLElement) {
    const item = getItem(id)
    item.el = el
    measureItem(item)
    if (item.held) el.setAttribute('data-held', '')
    // A launched bubble starts fully visible: no fade-in, no opacity transition from 0
    if (item.kick) el.style.setProperty('--o', '1')
  } else {
    const item = items.get(id)
    if (item) item.el = null
  }
}

// Mounted but invisible and ignored by the frame loop until launch(); still measured
function hold(id: string) {
  const item = getItem(id)
  item.held = true
  item.el?.setAttribute('data-held', '')
}

function size(id: string) {
  const item = items.get(id)
  return item?.w ? { w: item.w, h: item.h } : null
}

function release(item: Item, rect: DOMRect | null) {
  item.held = false
  const el = item.el
  if (!el) return
  if (!rect) {
    el.removeAttribute('data-held')
    return
  }
  // Shown at once where the drop was: no opacity transition, no frame at the wrong place
  el.style.transition = 'none'
  el.style.setProperty('--o', '1')
  el.style.zIndex = String(LAUNCH_Z_INDEX)
  el.style.transform = `translate3d(${(rect.left + rect.width / 2).toFixed(2)}px, ${(rect.top + rect.height / 2).toFixed(2)}px, 0) translate(-50%, -50%)`
  el.removeAttribute('data-held')
  el.getBoundingClientRect()
  el.style.transition = ''

  const p = el.querySelector('p')
  p?.setAttribute('data-reveal', '')
  p?.addEventListener('animationend', () => p.removeAttribute('data-reveal'), { once: true })
}

function launch(id: string, rect: DOMRect, vel: Vec3 = launchVelocity()) {
  const item = getItem(id)
  release(item, reducedMotion ? null : rect)
  if (reducedMotion) return
  const start = unproject(rect.left + rect.width / 2, rect.top + rect.height / 2, 0, width, height)
  const drift = driftAt(item.params, (performance.now() - t0) / 1000)
  item.bornAt = Number.NEGATIVE_INFINITY
  item.kick = {
    offset: { x: start.x - drift.x, y: start.y - drift.y, z: -drift.z },
    vel
  }
}

defineExpose({ hold, size, launch })

function onToggle(id: string) {
  if (items.get(id)?.pop) return
  emit('toggle', id)
}

function onRemove(id: string) {
  const item = items.get(id)
  if (!item || item.pop) return
  item.pop = { startedAt: null, emitted: reducedMotion }
  item.el?.setAttribute('data-popping', '')
  if (reducedMotion) emit('remove', id)
}

function onKeydown(e: KeyboardEvent, id: string) {
  if (e.target !== e.currentTarget) return
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    onRemove(id)
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    onToggle(id)
  }
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const easeOutCubic = (k: number) => 1 - (1 - k) ** 3

function measure() {
  width = window.innerWidth
  height = window.innerHeight
  floorY = height - FLOOR_MARGIN
  for (const item of items.values()) measureItem(item)
}

// Edge past a wall while moving into it: reflect (damped) and return the pixel correction
function bounce(vel: Kick['vel'], axis: 'x' | 'y', lo: number, hi: number, min: number, max: number): number {
  if (lo < min && vel[axis] < 0) {
    vel[axis] *= -RESTITUTION
    return min - lo
  }
  if (hi > max && vel[axis] > 0) {
    vel[axis] *= -RESTITUTION
    return max - hi
  }
  return 0
}

function frame(now: number) {
  raf = requestAnimationFrame(frame)
  const t = reducedMotion ? 0 : (now - t0) / 1000
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now

  if (items.size > props.memos.length) {
    const alive = new Set(props.memos.map(m => m.id))
    for (const id of items.keys()) if (!alive.has(id)) items.delete(id)
  }

  for (const memo of props.memos) {
    const item = items.get(memo.id)
    if (!item?.el || item.held) continue

    const target = memo.done ? 1 : 0
    item.doneBlend ??= target
    item.doneBlend = reducedMotion ? target : target + (item.doneBlend - target) * Math.exp(-dt / DONE_TAU)

    const pos = driftAt(item.params, t)
    const kick = item.kick
    if (kick) {
      stepKick(kick, Math.min(dt, KICK_MAX_DT))
      pos.x += kick.offset.x
      pos.y += kick.offset.y
      pos.z += kick.offset.z
      // Depth bounces on the combined position, before the "done" recoil
      if ((pos.z < 0 && kick.vel.z < 0) || (pos.z > 1 && kick.vel.z > 0)) {
        const wall = pos.z < 0 ? 0 : 1
        kick.vel.z *= -RESTITUTION
        kick.offset.z += wall - pos.z
        pos.z = wall
      }
    }
    pos.z = clamp01(pos.z + DONE_DEPTH * item.doneBlend)
    const p = project(pos, width, height)
    const { blur } = p
    let { x, y, scale, opacity, zIndex } = p

    if (kick) {
      const hw = item.w * scale / 2
      const hh = item.h * scale / 2
      const dx = bounce(kick.vel, 'x', x - hw, x + hw, 0, width)
      const dy = bounce(kick.vel, 'y', y - hh, y + hh, 0, floorY)
      if (dx || dy) {
        const n = pixelsToNorm(dx, dy, pos.z, width, height)
        kick.offset.x += n.x
        kick.offset.y += n.y
        x += dx
        y += dy
      }
      if (kickAtRest(kick)) item.kick = null
    }

    item.bornAt ??= now
    opacity *= Math.min(1, (now - item.bornAt) / FADE_MS)

    // Hovered or focused bubbles come forward to a readable size so their actions stay easy to hit
    // (frozen while popping, so a deleted bubble bursts from where it is)
    let hovered = false
    let focused = false
    if (!item.pop) {
      hovered = item.el.matches(':hover')
      focused = !hovered && item.el.matches(':focus-within')
      const active = hovered || focused ? 1 : 0
      item.focusBlend = reducedMotion ? active : active + (item.focusBlend - active) * Math.exp(-dt / FOCUS_TAU)
    }
    if (item.focusBlend > 0.001) {
      scale = lerp(scale, Math.max(scale, 1), item.focusBlend)
      // The hovered bubble always wins, then a focused one, then those shrinking back
      zIndex = hovered ? 1700 : focused ? 1600 : 1500 + Math.round(item.focusBlend * 99)
    }

    const pop = item.pop
    if (pop) {
      pop.startedAt ??= now
      const k = reducedMotion ? 1 : Math.min(1, (now - pop.startedAt) / POP_MS)
      const e = easeOutCubic(k)
      scale *= 1 + POP_SCALE * e
      opacity *= 1 - e
      if (k >= 1 && !pop.emitted) {
        pop.emitted = true
        emit('remove', memo.id)
      }
    }

    const style = item.el.style
    style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) translate(-50%, -50%) scale(${scale.toFixed(4)})`
    style.zIndex = String(zIndex)
    style.setProperty('--o', opacity.toFixed(3))
    style.setProperty('--blur', `${blur}px`)
  }
}

function onMotionChange(e: MediaQueryListEvent) {
  reducedMotion = e.matches
}

onMounted(() => {
  measure()
  t0 = performance.now()
  last = t0
  media = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotion = media.matches
  media.addEventListener('change', onMotionChange)
  window.addEventListener('resize', measure)
  raf = requestAnimationFrame(frame)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', measure)
  media?.removeEventListener('change', onMotionChange)
})
</script>

<template>
  <div class="pointer-events-none fixed inset-0 overflow-hidden">
    <div
      v-for="memo in memos"
      :key="memo.id"
      :ref="(el: unknown) => setEl(memo.id, el)"
      data-bubble
      tabindex="0"
      class="squircle pointer-events-auto absolute top-0 left-0 max-w-72 border border-default bg-elevated px-4 py-3 text-sm will-change-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inverted"
      @keydown="onKeydown($event, memo.id)"
    >
      <p
        class="line-clamp-4 break-words whitespace-pre-wrap"
        :class="memo.done ? 'text-muted line-through' : 'text-highlighted'"
      >
        {{ memo.text }}
      </p>
      <div
        data-actions
        class="absolute top-full right-0 pt-1"
      >
        <div class="flex rounded-lg border border-default bg-default">
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            :icon="memo.done ? 'i-lucide-undo-2' : 'i-lucide-check'"
            :aria-label="memo.done ? 'Rétablir' : 'Marquer comme faite'"
            @click="onToggle(memo.id)"
          />
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            aria-label="Supprimer"
            @click="onRemove(memo.id)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
[data-bubble] {
  opacity: var(--o, 0);
  filter: blur(var(--blur, 0px));
  transition: opacity 0.3s, filter 0.3s;
}

[data-bubble]:hover,
[data-bubble]:focus-within {
  opacity: 1;
  filter: none;
}

[data-bubble][data-held] {
  opacity: 0;
  pointer-events: none;
  transition: none;
}

[data-bubble][data-popping] {
  opacity: var(--o, 0);
  pointer-events: none;
  transition: none;
}

[data-reveal] {
  animation: reveal 0.14s ease-out;
}

@keyframes reveal {
  from {
    opacity: 0;
  }
}

[data-actions] {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
}

[data-bubble]:hover [data-actions],
[data-bubble]:focus-within [data-actions] {
  opacity: 1;
  pointer-events: auto;
}

@media (prefers-reduced-motion: reduce) {
  [data-bubble],
  [data-actions] {
    transition: none;
  }

  [data-reveal] {
    animation: none;
  }
}
</style>
