<template>
  <div
    class="xterm-panel"
    :class="{ hidden: !processName, dragging }"
    :style="{ height: panelHeight + 'px' }"
  >
    <div
      class="log-resize-handle"
      @mousedown.prevent="startDrag"
      @touchstart.prevent="startDragTouch"
    ></div>
    <div class="log-header">
      <span>Terminal — {{ processName }}</span>
      <button class="btn-ghost" @click="$emit('close')" style="margin-left: auto">Close</button>
    </div>
    <div ref="termContainerRef" class="xterm-container"></div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'

const props = defineProps({
  processName: { type: String, default: null },
  panelHeight: { type: Number, default: 400 },
})

const emit = defineEmits(['close', 'resize'])

const termContainerRef = ref(null)
const dragging = ref(false)

let term = null
let fitAddon = null
let ws = null
let resizeObserver = null

function createTerminal() {
  if (term) return
  term = new Terminal({
    cursorBlink: true,
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
    allowProposedApi: true,
  })

  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.loadAddon(new WebLinksAddon())

  term.open(termContainerRef.value)
  fitWide()

  // Watch for container size changes
  resizeObserver = new ResizeObserver(() => {
    fitWide()
  })
  resizeObserver.observe(termContainerRef.value)

  // Send terminal size changes to server
  term.onResize(({ cols, rows }) => {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'resize', cols, rows }))
    }
  })

  // Send keyboard input to server
  term.onData((data) => {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'input', data }))
    }
  })
}

function destroyTerminal() {
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null }
  if (term) { term.dispose(); term = null; fitAddon = null }
}

let wsRetryTimer = null

function connectWs(name) {
  disconnectWs()
  if (!name) return

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = `${proto}//${location.host}/ws/terminal?name=${encodeURIComponent(name)}`
  ws = new WebSocket(url)

  ws.onmessage = (ev) => {
    if (term) term.write(ev.data)
  }

  ws.onclose = () => {
    ws = null
    // Retry if panel is still open (process may not be ready yet)
    if (props.processName) {
      wsRetryTimer = setTimeout(() => connectWs(name), 1500)
    }
  }
  ws.onerror = () => {}
}

function disconnectWs() {
  if (wsRetryTimer) { clearTimeout(wsRetryTimer); wsRetryTimer = null }
  if (ws) { ws.close(); ws = null }
}

// When processName changes, reconnect
watch(() => props.processName, async (name, oldName) => {
  if (name && name !== oldName) {
    await nextTick()
    if (!term) createTerminal()
    else { term.clear(); fitAddon.fit() }
    connectWs(name)
  } else if (!name) {
    disconnectWs()
  }
}, { immediate: true })

const WIDE_COLS = 200

function fitWide() {
  if (!fitAddon || !term) return
  const dims = fitAddon.proposeDimensions()
  if (dims) {
    term.resize(WIDE_COLS, dims.rows)
  }
}

// Refit when panel height changes
watch(() => props.panelHeight, () => {
  nextTick(() => fitWide())
})

onMounted(() => {
  if (props.processName) {
    createTerminal()
    connectWs(props.processName)
  }
})

onUnmounted(() => {
  disconnectWs()
  destroyTerminal()
})

// Drag resize (same pattern as LogPanel)
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
