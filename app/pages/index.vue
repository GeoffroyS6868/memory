<script setup lang="ts">
const { memos, add, toggleDone, remove } = useMemos()
const field = useTemplateRef('field')
const input = useTemplateRef('input')

// Used if the bubble could not be measured
const FALLBACK_SIZE = { w: 192, h: 46 }

async function onSubmit(text: string) {
  const memo = add(text)
  if (!memo) return
  field.value?.hold(memo.id)
  await nextTick()
  const size = field.value?.size(memo.id) ?? FALLBACK_SIZE
  // Drawn before the drop: the drop and the bubble share direction and speed
  const vel = launchVelocity()
  const velPx = toPixelVelocity(vel, window.innerWidth, window.innerHeight)
  const rect = await input.value?.detach(size, velPx) ?? new DOMRect(window.innerWidth / 2, window.innerHeight - 48, 0, 0)
  field.value?.launch(memo.id, rect, vel)
}
</script>

<template>
  <main class="relative h-dvh overflow-hidden bg-default">
    <MemoField
      ref="field"
      :memos="memos"
      @toggle="toggleDone"
      @remove="remove"
    />
    <MemoInput
      ref="input"
      @submit="onSubmit"
    />
  </main>
</template>
