<template>
  <div
    class="xterm-panel"
    :class="{ hidden: !nodeName, dragging }"
    :style="{ height: panelHeight + 'px' }"
  >
    <div
      class="log-resize-handle"
      @mousedown.prevent="startDrag"
      @touchstart.prevent="startDragTouch"
    ></div>
    <div class="log-header">
      <span>Terminal — {{ nodeName }}</span>
      <button class="btn-ghost" @click="$emit('close')" style="margin-left: auto">Close</button>
    </div>
    <div
      ref="termContainerRef"
      class="xterm-container"
      tabindex="0"
      @click="focusTerminal"
    ></div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'

const props = defineProps({
  nodeName: { type: String, default: null },
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
  if (term) {
    if (termContainerRef.value && !term.element) {
      term.open(termContainerRef.value)
      setupResizeObserver()
      fitWide()
    }
    return
  }
  if (!termContainerRef.value) return

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

  // ALWAYS open before anything else
  term.open(termContainerRef.value)
  setupResizeObserver()

  // Send terminal size changes to server
  term.onResize(({ cols, rows }) => {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'resize', cols, rows }))
    }
  })

  // Send keyboard input to server
  term.onData((data) => {
    // Filter out automatic terminal identification responses that can cause loops
    // especially with processes that echo stdin or are not in raw mode.
    if (data === '\x1b[?1;2c' || data === '\x1b[?62;c' || data === '\x1b[?6c') {
      return
    }
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'input', data }))
    }
  })

  fitWide()
}

function setupResizeObserver() {
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
  if (!termContainerRef.value) return
  resizeObserver = new ResizeObserver(() => {
    fitWide()
  })
  resizeObserver.observe(termContainerRef.value)
}

function focusTerminal() {
  if (term) {
    term.focus()
  }
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
  const localWs = new WebSocket(url)
  ws = localWs

  localWs.onopen = () => {
    // If we have an open socket and a term, ensure dimensions are sent
    if (term) fitWide()
  }

  localWs.onmessage = (ev) => {
    if (ws === localWs && term) term.write(ev.data)
  }

  localWs.onclose = () => {
    if (ws !== localWs) return
    ws = null
    if (props.nodeName === name) {
      wsRetryTimer = setTimeout(() => connectWs(name), 1500)
    }
  }
  localWs.onerror = () => {}
}

function disconnectWs() {
  if (wsRetryTimer) { clearTimeout(wsRetryTimer); wsRetryTimer = null }
  if (ws) { ws.close(); ws = null }
}

// When nodeName changes, reconnect
watch(() => props.nodeName, async (name, oldName) => {
  if (name && name !== oldName) {
    if (!term) createTerminal()
    else { term.clear(); fitWide() }
    connectWs(name)
    await nextTick()
    focusTerminal()
  } else if (!name) {
    disconnectWs()
  }
}, { immediate: false })

const WIDE_COLS = 200

function fitWide() {
  if (!fitAddon || !term || !term.element) return
  const dims = fitAddon.proposeDimensions()
  if (dims && dims.cols > 0 && dims.rows > 0) {
    term.resize(WIDE_COLS, dims.rows)
  } else {
    // Retry once if zero dimensions (often means container not yet visible)
    setTimeout(() => {
      if (!fitAddon || !term) return
      const d2 = fitAddon.proposeDimensions()
      if (d2 && d2.cols > 0 && d2.rows > 0) term.resize(WIDE_COLS, d2.rows)
    }, 50)
  }
}

// Refit when panel height changes
watch(() => props.panelHeight, () => {
  nextTick(() => fitWide())
})

onMounted(async () => {
  if (props.nodeName) {
    await nextTick()
    createTerminal()
    connectWs(props.nodeName)
    await nextTick()
    focusTerminal()
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
