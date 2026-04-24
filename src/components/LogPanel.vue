<template>
  <div
    class="log-panel"
    :class="{ hidden: !selectedNode, dragging }"
    :style="{ height: panelHeight + 'px' }"
  >
    <div
      class="log-resize-handle"
      @mousedown.prevent="startDrag"
      @touchstart.prevent="startDragTouch"
    ></div>
    <div class="log-header">
      <div class="card-name" style="border: none; background: transparent; padding: 0;">
        <i :class="[typeIcon, 'node-type-icon', node?.status]" :title="node?.type" style="margin-right: 8px;"></i>
        <span>Logs — {{ node?.name }}</span>
      </div>
      <span style="font-size: 11px; color: var(--text-dim); margin-left: auto; margin-right: 12px">
        {{ lastRefresh }}
      </span>
      <CardActions
        v-if="node"
        style="margin-right: 12px; gap: 8px;"
        :node="node"
        :workspace-open="workspaceOpen"
        :terminal-open="true"
        :show-edit="true"
        @start="$emit('start', $event)"
        @stop="$emit('stop', $event)"
        @restart="$emit('restart', $event)"
        @open-workspace="$emit('open-workspace', $event)"
        @edit="$emit('edit', $event)"
      />
      <button class="btn-ghost btn-icon" @click="$emit('clear')" style="margin-right: 4px" title="Clear Logs">
        <i class="fa-solid fa-eraser"></i>
      </button>
      <button class="btn-ghost btn-icon" @click="$emit('close')" title="Close Panel">
        <i class="fa-solid fa-xmark"></i>
      </button>
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
        placeholder="Send input to node…"
        @keydown.enter="sendStdin"
      />
      <button class="btn-stdin-send" @click="sendStdin">Send</button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, computed } from 'vue'
import { AnsiUp } from 'ansi_up'
import CardActions from './CardActions.vue'

const ansiUp = new AnsiUp()
function formatAnsi(text) {
  if (!text) return ''
  return ansiUp.ansi_to_html(text)
}

const TYPE_ICONS = {
  service: 'fa-solid fa-server',
  agent: 'fa-solid fa-robot',
  desk: 'fa-solid fa-desktop',
  script: 'fa-solid fa-scroll',
}

const props = defineProps({
  node: { type: Object, default: null },
  selectedNode: { type: String, default: null },
  logs: { type: Array, default: () => [] },
  lastRefresh: { type: String, default: '' },
  panelHeight: { type: Number, default: 300 },
  workspaceOpen: { type: Boolean, default: false },
})

const typeIcon = computed(() => {
  if (!props.node) return 'fa-solid fa-circle'
  if (props.node.type === 'script' && props.node.status === 'running') return 'fa-solid fa-spinner script-running-spinner'
  return TYPE_ICONS[props.node.type] || 'fa-solid fa-circle'
})

const emit = defineEmits(['close', 'resize', 'clear', 'send-stdin', 'open-workspace', 'start', 'stop', 'restart', 'edit'])

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
