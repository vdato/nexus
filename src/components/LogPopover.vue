<template>
  <div
    ref="popoverRef"
    class="log-popover"
    :class="{ visible }"
    :style="style"
    @mouseenter="$emit('cancel-hide')"
    @mouseleave="$emit('schedule-hide')"
  >
    <div class="log-popover-title">Logs — {{ name }}</div>
    <div class="log-popover-body">
      <template v-if="logs.length">
        <div
          v-for="(entry, i) in logs"
          :key="i"
          class="log-line"
          :class="entry.source"
        >{{ entry.text }}</div>
      </template>
      <div v-else class="log-popover-empty">No logs yet.</div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  name: { type: String, default: '' },
  logs: { type: Array, default: () => [] },
  style: { type: Object, default: () => ({}) },
})

defineEmits(['cancel-hide', 'schedule-hide'])

const popoverRef = ref(null)

defineExpose({ popoverRef })
</script>
