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
      <button class="btn-ghost" @click="$emit('clear')" style="margin-right: 4px">Clear</button>
      <button class="btn-ghost" @click="$emit('close')">Close</button>
    </div>
    <div ref="logBodyRef" class="log-body">
      <div
        v-for="(log, i) in logs"
        :key="i"
        class="log-line"
        :class="log.source"
        v-html="formatAnsi(log.text)"
      ></div>
      <div v-if="!logs.length" class="log-line system">No logs available.</div>
    </div>
    <div class="stdin-input-row">
      <input
        v-model="stdinInput"
        type="text"
        class="stdin-input"
        placeholder="Send input to process…"
        @keydown.enter="sendStdin"
      />
      <button class="btn-stdin-send" @click="sendStdin">Send</button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { AnsiUp } from 'ansi_up'

const ansiUp = new AnsiUp()
function formatAnsi(text) {
  if (!text) return ''
  return ansiUp.ansi_to_html(text)
}

const props = defineProps({
  selectedProcess: { type: String, default: null },
  logs: { type: Array, required: true },
  lastRefresh: { type: String, default: '' },
  panelHeight: { type: Number, default: 300 },
})

const emit = defineEmits(['close', 'resize', 'clear', 'send-stdin'])

const logBodyRef = ref(null)
const dragging = ref(false)
const stdinInput = ref('')

defineExpose({ logBodyRef })

watch(() => props.logs, () => {
  nextTick(() => {
    if (logBodyRef.value) {
      logBodyRef.value.scrollTop = logBodyRef.value.scrollHeight
    }
  })
}, { deep: true })

function sendStdin() {
  const text = stdinInput.value || ''
  stdinInput.value = ''
  emit('send-stdin', text)
}

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
