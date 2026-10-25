<script setup lang="ts">
const emit = defineEmits<{ submit: [text: string] }>()

interface Drop {
  id: number
  w: number
  h: number
}

const MAX_HEIGHT = 144
// Starts at rest, ends at DROP_END_SLOPE times the average speed: (1 - 0.4) / (1 - 0.8)
const DROP_EASING = 'cubic-bezier(0.4, 0, 0.8, 0.4)'
const DROP_END_SLOPE = 3
const DROP_MIN_MS = 200
const DROP_MAX_MS = 450
const RECOIL_RATIO = 0.9
const PLACEHOLDER = 'Qu\'avez-vous en tête ?'
// Pill horizontal padding (pl-4 + pr-4), border and a rounding margin, around the placeholder at rest
const REST_CHROME = 16 + 16 + 2 + 2

const text = ref('')
const restWidth = ref(240)
const focused = ref(false)
const drops = ref<Drop[]>([])
const pill = useTemplateRef<HTMLElement>('pill')
const goo = useTemplateRef<HTMLElement>('goo')
const shape = useTemplateRef<HTMLElement>('shape')
const area = useTemplateRef<HTMLTextAreaElement>('area')
const probe = useTemplateRef<HTMLElement>('probe')

const dropEls = new Map<number, HTMLElement>()
const tailEls = new Map<number, HTMLElement>()
let dropId = 0

const expanded = computed(() => focused.value || text.value.length > 0)

function resize() {
  const el = area.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
}

function send() {
  const value = text.value.trim()
  if (!value) return
  emit('submit', value)
  text.value = ''
  nextTick(resize)
  area.value?.focus()
}

function setEl(els: Map<number, HTMLElement>, id: number, el: unknown) {
  if (el instanceof HTMLElement) els.set(id, el)
  else els.delete(id)
}

function recoil(ms: number) {
  const keyframes = [
    { transform: 'scaleY(0.97)' },
    { transform: 'scaleY(1.01)', offset: 0.4 },
    { transform: 'scaleY(1)' }
  ]
  for (const el of [pill.value, shape.value]) {
    el?.animate(keyframes, { duration: ms * RECOIL_RATIO, easing: 'ease-out' })
  }
}

// One drop leaves the pill; resolves with its rect at handoff, once it is removed
// velPx is the bubble's launch velocity: the drop ends along that direction, at that speed
async function detach(size: { w: number, h: number }, velPx: { x: number, y: number }): Promise<DOMRect> {
  const pillEl = pill.value
  const layer = goo.value
  if (!pillEl || !layer) return new DOMRect()
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return pillEl.getBoundingClientRect()

  const drop: Drop = { id: ++dropId, ...size }
  drops.value.push(drop)
  await nextTick()
  const el = dropEls.get(drop.id)
  if (!el) return pillEl.getBoundingClientRect()

  // Layout metrics, so a recoil in progress does not skew the geometry
  // Horizontal centring is left: 50% on the drop, so it follows the pill if its width transitions mid-drop
  const top = layer.offsetHeight - pillEl.offsetHeight
  const from = top + 12
  let to = top - 40 - size.h / 2
  const at = (y: number, scale: string, x = 0) => `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale})`

  // Straight line along the launch direction; the vertical travel is unchanged, so L = D / |dir.y|
  const speed = Math.hypot(velPx.x, velPx.y)
  const dirX = speed ? velPx.x / speed : 0
  const dirY = speed ? velPx.y / speed : -1
  const lean = Math.abs(dirY) > 1e-3 ? dirX / Math.abs(dirY) : 0
  const length = (from - to) * Math.hypot(1, lean)
  const raw = speed ? DROP_END_SLOPE * length / speed * 1000 : DROP_MAX_MS
  const ms = Math.min(DROP_MAX_MS, Math.max(DROP_MIN_MS, raw))
  // Too fast for the shortest duration (large screens): travel further instead, so the end speed still matches
  if (raw < DROP_MIN_MS) to = from - (from - to) * DROP_MIN_MS / raw
  const along = (k: number, scale: string) => at(from + (to - from) * k, scale, (from - to) * lean * k)

  const anim = el.animate([
    { transform: along(0, '0.35, 0.45') },
    { transform: along(0.55, '0.62, 1.1'), offset: 0.55 },
    { transform: along(0.85, '0.9, 1.04'), offset: 0.85 },
    { transform: along(1, '1') }
  ], { duration: ms, easing: DROP_EASING, fill: 'forwards' })
  // A small blob trailing between pill and drop: the goo filter turns it into a tapering neck that snaps
  // It leans along the same direction
  const tail = (y: number, scale: string) => at(top + y, scale, (6 - y) * lean)
  tailEls.get(drop.id)?.animate([
    { transform: tail(6, '1') },
    { transform: tail(-14, '0.85'), offset: 0.6 },
    { transform: tail(-22, '0') }
  ], { duration: ms, easing: 'ease-in', fill: 'forwards' })
  await anim.finished

  const rect = el.getBoundingClientRect()
  drops.value = drops.value.filter(d => d.id !== drop.id)
  recoil(ms)
  return rect
}

defineExpose({ detach })

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    send()
  } else if (e.key === 'Escape') {
    area.value?.blur()
  }
}

watch(text, () => nextTick(resize))
function measureRest() {
  if (probe.value) restWidth.value = Math.ceil(probe.value.getBoundingClientRect().width) + REST_CHROME
}

onMounted(() => {
  resize()
  measureRest()
  document.fonts?.ready.then(measureRest)
})
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-4 z-2000 flex justify-center px-4">
    <svg
      width="0"
      height="0"
      class="absolute"
      aria-hidden="true"
    >
      <filter
        id="memo-goo"
        x="-20%"
        y="-20%"
        width="140%"
        height="140%"
      >
        <feGaussianBlur
          in="SourceGraphic"
          stdDeviation="8"
          result="blur"
        />
        <feColorMatrix
          in="blur"
          mode="matrix"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9"
          result="goo"
        />
        <feComposite
          in="SourceGraphic"
          in2="goo"
          operator="atop"
        />
      </filter>
    </svg>
    <span
      ref="probe"
      aria-hidden="true"
      class="invisible absolute text-sm leading-6 whitespace-pre"
    >{{ PLACEHOLDER }}</span>
    <div
      class="relative max-w-full transition-[width] duration-300 ease-out"
      :style="{ width: expanded ? '26rem' : `${restWidth}px` }"
    >
      <div
        ref="goo"
        data-goo
        aria-hidden="true"
        class="pointer-events-none absolute inset-x-0 bottom-0"
        :style="drops.length ? { filter: 'url(#memo-goo)' } : undefined"
      >
        <div
          ref="shape"
          data-shape
          class="absolute inset-x-0 bottom-0 origin-bottom rounded-3xl bg-elevated"
        />
        <template
          v-for="drop in drops"
          :key="drop.id"
        >
          <div
            :ref="(el: unknown) => setEl(tailEls, drop.id, el)"
            class="absolute top-0 left-1/2 size-7 rounded-full bg-elevated"
          />
          <div
            :ref="(el: unknown) => setEl(dropEls, drop.id, el)"
            class="squircle absolute top-0 left-1/2 bg-elevated"
            :style="{ width: `${drop.w}px`, height: `${drop.h}px` }"
          />
        </template>
      </div>
      <div
        ref="pill"
        data-pill
        class="pointer-events-auto relative flex origin-bottom items-end gap-2 overflow-hidden rounded-3xl border border-default p-2 pl-4 transition-colors duration-100"
        :class="{ 'border-transparent!': drops.length, 'pr-4': !expanded }"
      >
        <textarea
          ref="area"
          v-model="text"
          rows="1"
          :placeholder="PLACEHOLDER"
          aria-label="Nouveau mémo"
          class="min-w-0 flex-1 resize-none bg-transparent py-1.5 text-sm leading-6 text-highlighted outline-none placeholder:text-muted"
          @focus="focused = true"
          @blur="focused = false"
          @keydown="onKeydown"
        />
        <!-- At rest the button sits just past the pill's edge, clipped by the pill (overflow-hidden); widening slides it in -->
        <div
          class="flex shrink-0 justify-start transition-[width,margin] duration-300 ease-out"
          :class="expanded ? 'w-8' : 'pointer-events-none -ml-2 w-0'"
          :inert="!expanded"
        >
          <UButton
            color="neutral"
            variant="solid"
            icon="i-lucide-arrow-up"
            aria-label="Lâcher"
            class="shrink-0 rounded-full transition-transform duration-300 ease-out"
            :class="expanded ? 'translate-x-0' : 'translate-x-5'"
            @mousedown.prevent
            @click="send"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Layer = pill + 14rem above it; the shape is exactly the pill-sized bottom part */
[data-goo] {
  top: -14rem;
}

[data-shape] {
  height: calc(100% - 14rem);
}
</style>
