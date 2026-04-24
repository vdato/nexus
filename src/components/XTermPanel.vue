<template>
  <div
    class="xterm-panel"
    :class="{ hidden: !nodeName, dragging, 'drag-over': dragOverTerminal }"
    :style="{ height: panelHeight + 'px' }"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div
      class="log-resize-handle"
      @mousedown.prevent="startDrag"
      @touchstart.prevent="startDragTouch"
    ></div>
    <div class="log-header">
      <div class="card-name" style="border: none; background: transparent; padding: 0;">
        <i :class="[typeIcon, 'node-type-icon', node?.status]" :title="node?.type" style="margin-right: 8px;"></i>
        <span>{{ nodeName }}</span>
      </div>
      <CardActions
        v-if="node"
        ref="cardActionsRef"
        data-terminal-actions
        style="margin-left: auto; margin-right: 12px; gap: 8px;"
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
      <button class="btn-ghost btn-icon" @click="$emit('close')" title="Close Terminal">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
    <div
      ref="termContainerRef"
      class="xterm-container"
      tabindex="0"
      @click="focusTerminal"
    ></div>
    
    <div
      v-if="dragOverTerminal"
      class="terminal-drop-overlay"
      @dragenter.stop.prevent
      @dragover.stop.prevent
      @dragleave.stop.prevent
      @drop.stop.prevent="onDrop"
    >
      <i class="fa-solid fa-file-export"></i>
      <span>Drop to insert path</span>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { api } from '../composables/useApi'
import { useNotifications } from '../composables/useNotifications'
import CardActions from './CardActions.vue'

const props = defineProps({
  node: { type: Object, default: null },
  panelHeight: { type: Number, default: 400 },
  workspaceOpen: { type: Boolean, default: false },
  terminalWidth: { type: Number, default: 200 },
})

const { addNotification, removeNotification } = useNotifications()

const nodeName = computed(() => props.node?.name)
const nodeGuid = computed(() => props.node?.guid)
const emit = defineEmits(['close', 'resize', 'start', 'stop', 'restart', 'open-workspace', 'edit'])

const TYPE_ICONS = {
  service: 'fa-solid fa-server',
  agent: 'fa-solid fa-robot',
  desk: 'fa-solid fa-desktop',
  script: 'fa-solid fa-scroll',
}

const typeIcon = computed(() => {
  if (!props.node) return 'fa-solid fa-circle'
  if (props.node.type === 'script' && props.node.status === 'running') return 'fa-solid fa-spinner script-running-spinner'
  return TYPE_ICONS[props.node.type] || 'fa-solid fa-circle'
})

const termContainerRef = ref(null)
const dragging = ref(false)
const dragOverTerminal = ref(false)
const cardActionsRef = ref(null)
let dragCounter = 0

function applyInitialFocus() {
  const isAgent = props.node?.type === 'agent'
  const isRunning = props.node?.status === 'running'

  if (isAgent && isRunning) {
    // For running agents, focus the terminal
    let attempts = 0
    const tryFocusTerm = () => {
      if (term) {
        term.focus()
      } else if (attempts < 20) {
        attempts++
        requestAnimationFrame(tryFocusTerm)
      }
    }
    tryFocusTerm()
  } else {
    // For non-running agents, or any other node type, focus the main action button
    focusMainAction()
  }
}

function focusMainAction() {
  let attempts = 0
  const tryFocus = () => {
    if (cardActionsRef.value?.focusMain()) {
      // success
    } else if (attempts < 20) {
      attempts++
      requestAnimationFrame(tryFocus)
    }
  }
  tryFocus()
}

// Focus logic when node opens or status changes
watch(() => props.node, (newVal, oldVal) => {
  if (newVal?.name) {
    // Only trigger if node changed or status changed
    if (newVal.name !== oldVal?.name || newVal.status !== oldVal?.status) {
      if (!oldVal) {
        // First mount - wait a bit for animation
        setTimeout(applyInitialFocus, 100)
      } else {
        applyInitialFocus()
      }
    }
  }
}, { immediate: true, deep: true })

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

function connectWs(id) {
  disconnectWs()
  if (!id) return

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = `${proto}//${location.host}/ws/terminal?id=${encodeURIComponent(id)}`
  const localWs = new WebSocket(url)
  ws = localWs

  localWs.onopen = () => {
    if (term) {
      fitWide()
      // Only auto-focus terminal if it's an agent that's ALREADY running
      if (props.node?.type === 'agent' && props.node?.status === 'running') {
        nextTick(() => term.focus())
      }
    }
  }

  localWs.onmessage = (ev) => {
    if (ws === localWs && term) term.write(ev.data)
  }

  localWs.onclose = () => {
    if (ws !== localWs) return
    ws = null
    if (nodeGuid.value === id) {
      wsRetryTimer = setTimeout(() => connectWs(id), 1500)
    }
  }
  localWs.onerror = () => {}
}

function disconnectWs() {
  if (wsRetryTimer) { clearTimeout(wsRetryTimer); wsRetryTimer = null }
  if (ws) { ws.close(); ws = null }
}

// When node status changes to running, attempt to reconnect immediately.
// If the PTY isn't ready yet, the onclose retry loop will keep trying every 1500ms.
watch(() => props.node?.status, (status, oldStatus) => {
  if (status === 'running' && oldStatus !== 'running' && nodeGuid.value) {
    connectWs(nodeGuid.value)
  }
})

// When nodeGuid changes, reconnect
watch(nodeGuid, async (guid, oldGuid) => {
  if (guid && guid !== oldGuid) {
    if (!term) createTerminal()
    else { term.clear(); fitWide() }
    connectWs(guid)
    await nextTick()
    applyInitialFocus()
  } else if (!guid) {
    disconnectWs()
  }
}, { immediate: false })

function fitWide() {
  if (!fitAddon || !term || !term.element) return
  const dims = fitAddon.proposeDimensions()
  if (dims && dims.cols > 0 && dims.rows > 0) {
    term.resize(props.terminalWidth, dims.rows)
  } else {
    // Retry once if zero dimensions (often means container not yet visible)
    setTimeout(() => {
      if (!fitAddon || !term) return
      const d2 = fitAddon.proposeDimensions()
      if (d2 && d2.cols > 0 && d2.rows > 0) term.resize(props.terminalWidth, d2.rows)
    }, 50)
  }
}

// Refit when panel height changes
watch(() => props.panelHeight, () => {
  nextTick(() => fitWide())
})

onMounted(() => {
  if (nodeGuid.value) {
    createTerminal()
    connectWs(nodeGuid.value)
    nextTick(() => {
      fitWide()
    })
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

// File Drag & Drop
function onDragEnter(ev) {
  ev.preventDefault()
  dragCounter++
  console.log('[xpm] DragEnter', dragCounter)
  dragOverTerminal.value = true
}

function onDragOver(ev) {
  ev.preventDefault()
  if (ev.dataTransfer) {
    ev.dataTransfer.dropEffect = 'copy'
  }
}

function onDragLeave(ev) {
  ev.preventDefault()
  dragCounter--
  console.log('[xpm] DragLeave', dragCounter)
  if (dragCounter <= 0) {
    dragCounter = 0
    dragOverTerminal.value = false
  }
}

async function onDrop(ev) {
  try {
    ev.preventDefault()
    console.log('[xpm] Drop event triggered', ev)
    dragCounter = 0
    dragOverTerminal.value = false
    
    const files = ev.dataTransfer?.files
    if (!files || !files.length) {
      console.log('[xpm] No files found in drop')
      return
    }
    if (!nodeGuid.value) {
      console.log('[xpm] No active node guid for upload')
      return
    }

    for (const file of files) {
      console.log(`[xpm] Processing dropped file: ${file.name}`)
      try {
        // Resolve path on server instead of uploading
        const result = await api(`/api/processes/${encodeURIComponent(nodeGuid.value)}/file-path`, 'POST', {
          path: file.name
        })
        console.log('[xpm] Path resolution response:', result)

        if (result.fullPath) {
          const quotedPath = result.fullPath.includes(' ') ? `"${result.fullPath}"` : result.fullPath
          
          // Copy to clipboard
          try {
            await navigator.clipboard.writeText(quotedPath)
            console.log('[xpm] Path copied to clipboard')
          } catch (clipErr) {
            console.error('[xpm] Clipboard copy failed:', clipErr)
          }

          // Try to push to terminal
          if (ws && ws.readyState === 1) {
            console.log('[xpm] Pushing path to terminal via WS')
            ws.send(JSON.stringify({ type: 'input', data: `${quotedPath} ` }))
          } else {
            console.warn('[xpm] Terminal WebSocket not ready')
            if (term) term.write(`\x1b[33m[xpm] Terminal not active. Path copied to clipboard.\x1b[0m\r\n`)
          }
          
          addNotification(`Reference to "${file.name}" inserted.`, 'success')
        }
      } catch (err) {
        console.error('[xpm] Path resolution error:', err)
        addNotification(`Failed to resolve path for ${file.name}: ${err.message}`, 'error')
      }
    }
  } catch (globalErr) {
    console.error('[xpm] Global drop handler error:', globalErr)
    dragOverTerminal.value = false
    dragCounter = 0
  }
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Failed to read binary file'))
    reader.readAsDataURL(file)
  })
}
</script>
