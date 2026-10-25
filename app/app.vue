<script setup lang="ts">
useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'fr'
  }
})

useSeoMeta({
  title: 'Memory',
  description: 'Un bloc-notes local : tapez une idée, elle s\'envole et flotte avec les autres.'
})
</script>

<template>
  <UApp>
    <NuxtPage />
  </UApp>
</template>
