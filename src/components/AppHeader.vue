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
      <button
        class="btn-ghost btn-compact-toggle"
        :class="{ active: compact }"
        @click="$emit('toggle-compact')"
        title="Toggle compact mode"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>
      <button class="btn-ghost" @click="$emit('add-process')">+ Add Process</button>
      <button class="btn-start btn-icon" @click="$emit('start-all')" title="Start All">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <polygon points="5,3 19,12 5,21"/>
        </svg>
      </button>
      <button class="btn-stop btn-icon" @click="$emit('stop-all')" title="Stop All">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <rect x="4" y="4" width="16" height="16" rx="2"/>
        </svg>
      </button>
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
  compact: { type: Boolean, default: false },
})

defineEmits(['add-process', 'start-all', 'stop-all', 'open-settings', 'toggle-compact'])
</script>
