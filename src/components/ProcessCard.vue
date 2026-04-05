<template>
  <div
    class="card"
    :class="{ selected: isSelected }"
    :style="{ borderColor }"
    @click="$emit('select', process.name)"
    @mouseenter="$emit('hover-enter', process.name, $event.currentTarget)"
    @mouseleave="$emit('hover-leave')"
  >
    <div class="card-header">
      <div class="card-name">
        <span class="status-dot" :class="process.status"></span>
        {{ process.name }}
      </div>
      <div class="card-actions">
        <template v-if="process.status === 'running'">
          <button class="btn-stop" @click.stop="$emit('stop', process.name)">Stop</button>
          <button class="btn-restart" @click.stop="$emit('restart', process.name)">Restart</button>
        </template>
        <template v-else>
          <button class="btn-start" @click.stop="$emit('start', process.name)">Start</button>
        </template>
        <button class="btn-gear" @click.stop="$emit('edit', process.name)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="card-meta">
      <span>PID: {{ process.pid || '-' }}</span>
      <span>Uptime: {{ uptime }}</span>
      <span v-if="process.branch" class="branch-tag">{{ process.branch }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  process: { type: Object, required: true },
  borderColor: { type: String, default: '#2e3144' },
  isSelected: { type: Boolean, default: false },
})

defineEmits(['select', 'start', 'stop', 'restart', 'edit', 'hover-enter', 'hover-leave'])

function formatUptime(ms) {
  if (!ms) return '-'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

const uptime = computed(() => {
  if (props.process.status === 'running' && props.process.startedAt) {
    return formatUptime(Date.now() - props.process.startedAt)
  }
  return '-'
})
</script>
