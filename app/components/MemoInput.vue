<script setup lang="ts">
const emit = defineEmits<{ submit: [text: string, rect: DOMRect] }>()

const MAX_HEIGHT = 144

const text = ref('')
const focused = ref(false)
const pill = useTemplateRef<HTMLElement>('pill')
const area = useTemplateRef<HTMLTextAreaElement>('area')

const expanded = computed(() => focused.value || text.value.length > 0)

function resize() {
  const el = area.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
}

function send() {
  const value = text.value.trim()
  if (!value || !pill.value) return
  emit('submit', value, pill.value.getBoundingClientRect())
  text.value = ''
  nextTick(resize)
  area.value?.focus()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    send()
  } else if (e.key === 'Escape') {
    area.value?.blur()
  }
}

watch(text, () => nextTick(resize))
onMounted(resize)
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-4 z-2000 flex justify-center px-4">
    <div
      ref="pill"
      class="pointer-events-auto flex max-w-full items-end gap-2 rounded-3xl border border-default bg-elevated p-2 pl-4 transition-[width] duration-300 ease-out"
      :class="expanded ? 'w-144' : 'w-80'"
    >
      <textarea
        ref="area"
        v-model="text"
        rows="1"
        placeholder="Une idée, une chose à faire…"
        aria-label="Nouveau mémo"
        class="min-w-0 flex-1 resize-none bg-transparent py-1.5 text-sm leading-6 text-highlighted outline-none placeholder:text-muted"
        @focus="focused = true"
        @blur="focused = false"
        @keydown="onKeydown"
      />
      <UButton
        color="neutral"
        variant="solid"
        icon="i-lucide-arrow-up"
        aria-label="Lâcher"
        :label="expanded ? 'Lâcher' : undefined"
        class="shrink-0 rounded-full"
        @mousedown.prevent
        @click="send"
      />
    </div>
  </div>
</template>
