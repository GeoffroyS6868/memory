<script setup lang="ts">
const { memos, add, toggleDone, remove } = useMemos()
const field = useTemplateRef('field')

function onSubmit(text: string, rect: DOMRect) {
  const memo = add(text)
  if (memo) field.value?.launch(memo.id, rect)
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
    <MemoInput @submit="onSubmit" />
  </main>
</template>
