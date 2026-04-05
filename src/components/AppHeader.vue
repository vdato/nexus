<template>
  <header>
    <div style="display: flex; align-items: center; gap: 16px">
      <h1>xprocessmanager</h1>
      <div class="summary-bar">
        <span>Total: <span class="count">{{ total }}</span></span>
        <span>Running: <span class="count running-count">{{ counts.running }}</span></span>
        <span>Stopped: <span class="count stopped-count">{{ counts.stopped + counts.stopping }}</span></span>
        <span v-if="counts.errored">Errored: <span class="count errored-count">{{ counts.errored }}</span></span>
      </div>
    </div>
    <div class="header-actions">
      <button class="btn-ghost" @click="$emit('add-process')">+ Add Process</button>
      <button class="btn-start" @click="$emit('start-all')">Start All</button>
      <button class="btn-stop" @click="$emit('stop-all')">Stop All</button>
      <button
        type="button"
        class="btn-ghost btn-settings-icon"
        title="Settings — import, groups, environment"
        aria-label="Settings"
        @click="$emit('open-settings')"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </div>
  </header>
</template>

<script setup>
defineProps({
  counts: { type: Object, required: true },
  total: { type: Number, required: true },
})

defineEmits(['add-process', 'start-all', 'stop-all', 'open-settings'])
</script>
