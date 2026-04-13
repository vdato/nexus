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
    <div class="log-popover-body log-popover-xterm" ref="xtermContainerRef"></div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'

const props = defineProps({
  visible: { type: Boolean, default: false },
  name: { type: String, default: '' },
  logs: { type: Array, default: () => [] },
  style: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['cancel-hide', 'schedule-hide', 'clear'])

const popoverRef = ref(null)
const xtermContainerRef = ref(null)

let term = null
let fitAddon = null
let resizeObserver = null
let writtenLogsCount = 0

const WIDE_COLS = 200

function fitTerminal() {
  if (!fitAddon || !term || !term.element) return
  const dims = fitAddon.proposeDimensions()
  if (dims && dims.rows > 0) {
    // Force a wide terminal to trigger horizontal scrollbars in the container
    term.resize(WIDE_COLS, dims.rows)
  }
}

function initTerminal() {
  if (term || !xtermContainerRef.value) return

  term = new Terminal({
    cursorBlink: false,
    fontSize: 13,
    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', 'Menlo', monospace",
    theme: {
      background: '#0f1117',
      foreground: '#e1e4ed',
      cursor: '#60a5fa',
      selectionBackground: 'rgba(96, 165, 250, 0.3)',
      black: '#1a1d27',
      red: '#f87171',
      green: '#34d399',
      yellow: '#fbbf24',
      blue: '#60a5fa',
      magenta: '#a78bfa',
      cyan: '#22d3ee',
      white: '#e1e4ed',
      brightBlack: '#8b8fa3',
      brightRed: '#fca5a5',
      brightGreen: '#6ee7b7',
      brightYellow: '#fde68a',
      brightBlue: '#93c5fd',
      brightMagenta: '#c4b5fd',
      brightCyan: '#67e8f9',
      brightWhite: '#f8fafc',
    },
    disableStdin: true,
    convertEol: true,
    scrollback: 1000,
    allowProposedApi: true,
  })

  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  
  term.open(xtermContainerRef.value)

  resizeObserver = new ResizeObserver(() => {
    fitTerminal()
  })
  resizeObserver.observe(xtermContainerRef.value)
}

function destroyTerminal() {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (term) {
    term.dispose()
    term = null
    fitAddon = null
  }
}

function writeLogs(logs) {
  if (!term) return

  // If logs array is shorter, it means it was cleared or reset
  if (logs.length < writtenLogsCount) {
    term.clear()
    writtenLogsCount = 0
  }

  const toWrite = logs.slice(writtenLogsCount)
  for (const entry of toWrite) {
    let text = entry.text
    // Auto-color stderr if not already ANSI formatted
    if (entry.source === 'stderr' && !text.includes('\x1b[')) {
      text = `\x1b[31m${text}\x1b[0m`
    }
    term.writeln(text)
  }
  writtenLogsCount = logs.length
}

watch(() => props.visible, async (isVisible) => {
  if (isVisible) {
    await nextTick()
    initTerminal()
    // When becoming visible, sync all current logs
    term.clear()
    writtenLogsCount = 0
    writeLogs(props.logs)
    // Defer fit until after the browser has laid out the popover with its final dimensions
    requestAnimationFrame(() => {
      fitTerminal()
      // Second pass in case the first frame was still mid-layout
      requestAnimationFrame(() => fitTerminal())
    })
  }
})

watch(() => props.logs, (newLogs) => {
  if (props.visible && term) {
    writeLogs(newLogs)
  }
}, { deep: true })

watch(() => props.name, () => {
  if (term) {
    term.clear()
    writtenLogsCount = 0
  }
})

onMounted(() => {
  if (props.visible) {
    initTerminal()
    writeLogs(props.logs)
  }
})

onUnmounted(() => {
  destroyTerminal()
})

defineExpose({ popoverRef })
</script>

<style scoped>
.log-popover-xterm {
  display: flex;
  flex-direction: column;
  padding: 4px;
  overflow-x: auto;
  overflow-y: hidden;
  background: #0f1117;
}
.log-popover-xterm :deep(.xterm) {
  flex: 1;
  min-height: 0;
}
.log-popover-xterm :deep(.xterm-viewport) {
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
  overflow-y: auto !important;
}
</style>
