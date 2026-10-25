<script setup lang="ts">
import type { DriftParams } from '~/utils/drift'

const props = defineProps<{ memos: Memo[] }>()
const emit = defineEmits<{
  toggle: [id: string]
  remove: [id: string]
}>()

interface Flight {
  x: number
  y: number
  startedAt: number | null
}

interface Pop {
  startedAt: number | null
  emitted: boolean
}

interface Item {
  el: HTMLElement | null
  params: DriftParams
  bornAt: number | null
  flight: Flight | null
  doneBlend: number | null
  focusBlend: number
  pop: Pop | null
}

const FLIGHT_MS = 1400
const FADE_MS = 900
const POP_MS = 450
const POP_SCALE = 0.25
const DONE_TAU = 0.3
const DONE_DEPTH = 0.3
const FOCUS_TAU = 0.1

const items = new Map<string, Item>()
let raf = 0
let width = 0
let height = 0
let t0 = 0
let last = 0
let reducedMotion = false
let media: MediaQueryList | null = null

function getItem(id: string, zRange?: readonly [number, number]): Item {
  let item = items.get(id)
  if (!item) {
    item = { el: null, params: createDrift(id, zRange), bornAt: null, flight: null, doneBlend: null, focusBlend: 0, pop: null }
    items.set(id, item)
  }
  return item
}

function setEl(id: string, el: unknown) {
  if (el instanceof HTMLElement) getItem(id).el = el
  else {
    const item = items.get(id)
    if (item) item.el = null
  }
}

function launch(id: string, rect: DOMRect) {
  if (reducedMotion) return
  const item = getItem(id, [0.25, 0.55])
  item.flight = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, startedAt: null }
}

defineExpose({ launch })

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
const easeOutCubic = (k: number) => 1 - (1 - k) ** 3

function measure() {
  width = window.innerWidth
  height = window.innerHeight
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
    if (!item?.el) continue

    const target = memo.done ? 1 : 0
    item.doneBlend ??= target
    item.doneBlend = reducedMotion ? target : target + (item.doneBlend - target) * Math.exp(-dt / DONE_TAU)

    const pos = driftAt(item.params, t)
    pos.z = Math.min(1, Math.max(0, pos.z + DONE_DEPTH * item.doneBlend))
    const p = project(pos, width, height)
    let { x, y, scale, opacity, blur, zIndex } = p

    const flight = item.flight
    if (flight) {
      flight.startedAt ??= now
      const k = Math.min(1, (now - flight.startedAt) / FLIGHT_MS)
      const e = easeOutCubic(k)
      x = lerp(flight.x, p.x, e)
      y = lerp(flight.y, p.y, e) - Math.sin(Math.PI * k) * Math.min(90, height * 0.12)
      scale = lerp(1, p.scale, e)
      opacity = lerp(1, p.opacity, e)
      blur = lerp(0, p.blur, e)
      zIndex = 1001
      if (k >= 1) item.flight = null
    } else {
      item.bornAt ??= now
      opacity *= Math.min(1, (now - item.bornAt) / FADE_MS)
    }

    // Hovered or focused bubbles come forward to a readable size so their actions stay easy to hit
    // (frozen while popping, so a deleted bubble bursts from where it is)
    if (!item.pop) {
      const active = !flight && item.el.matches(':hover, :focus-within') ? 1 : 0
      item.focusBlend = reducedMotion ? active : active + (item.focusBlend - active) * Math.exp(-dt / FOCUS_TAU)
    }
    if (item.focusBlend > 0.001) {
      scale = lerp(scale, Math.max(scale, 1), item.focusBlend)
      zIndex = 1500
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

[data-bubble][data-popping] {
  opacity: var(--o, 0);
  pointer-events: none;
  transition: none;
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
}
</style>
