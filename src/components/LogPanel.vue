<template>
  <div
    class="log-panel"
    :class="{ hidden: !selectedProcess, dragging }"
    :style="{ height: panelHeight + 'px' }"
  >
    <div
      class="log-resize-handle"
      @mousedown.prevent="startDrag"
      @touchstart.prevent="startDragTouch"
    ></div>
    <div class="log-header">
      <span>Logs — {{ selectedProcess }}</span>
      <span style="font-size: 11px; color: var(--text-dim); margin-left: auto; margin-right: 12px">
        {{ lastRefresh }}
      </span>
      <button class="btn-ghost" @click="$emit('close')">Close</button>
    </div>
    <div ref="logBodyRef" class="log-body">
      <div
        v-for="(entry, i) in logs"
        :key="i"
        class="log-line"
        :class="entry.source"
      >{{ entry.text }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  selectedProcess: { type: String, default: null },
  logs: { type: Array, required: true },
  lastRefresh: { type: String, default: '' },
  panelHeight: { type: Number, default: 300 },
})

const emit = defineEmits(['close', 'resize'])

const logBodyRef = ref(null)
const dragging = ref(false)

defineExpose({ logBodyRef })

function startDrag() {
  dragging.value = true
  const onMove = (ev) => emit('resize', window.innerHeight - ev.clientY)
  const onUp = () => {
    dragging.value = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function startDragTouch() {
  dragging.value = true
  const onMove = (ev) => emit('resize', window.innerHeight - ev.touches[0].clientY)
  const onEnd = () => {
    dragging.value = false
    document.removeEventListener('touchmove', onMove)
    document.removeEventListener('touchend', onEnd)
  }
  document.addEventListener('touchmove', onMove)
  document.addEventListener('touchend', onEnd)
}
</script>
