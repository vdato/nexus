<template>
  <div
    ref="popoverRef"
    class="log-popover"
    :class="{ visible }"
    :style="style"
    @mouseenter="$emit('cancel-hide')"
    @mouseleave="$emit('schedule-hide')"
  >
    <div class="log-popover-title">
      <span>Logs — {{ name }}</span>
      <button class="btn-popover-clear" @click.stop="$emit('clear')">Clear</button>
    </div>
    <div class="log-popover-body">
      <template v-if="logs.length">
        <div
          v-for="(entry, i) in logs"
          :key="i"
          class="log-line"
          :class="entry.source"
          v-html="formatAnsi(entry.text)"
        ></div>
      </template>
      <div v-else class="log-popover-empty">No logs yet.</div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { AnsiUp } from 'ansi_up'

const ansiUp = new AnsiUp()
function formatAnsi(text) {
  if (!text) return ''
  return ansiUp.ansi_to_html(text)
}

const props = defineProps({
  visible: { type: Boolean, default: false },
  name: { type: String, default: '' },
  logs: { type: Array, default: () => [] },
  style: { type: Object, default: () => ({}) },
})

defineEmits(['cancel-hide', 'schedule-hide', 'clear'])

const popoverRef = ref(null)

defineExpose({ popoverRef })
</script>
