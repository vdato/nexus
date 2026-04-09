<template>
  <div
    class="card"
    :class="{ selected: isSelected, expanded }"
    :style="{ borderColor, '--card-color': borderColor }"
    @click="toggleExpand"
    @mouseenter="!expanded && $emit('hover-enter', process.name, $event.currentTarget)"
    @mouseleave="!expanded && $emit('hover-leave')"
  >
    <div class="card-header">
      <div class="card-name">
        <span class="status-dot" :class="process.status"></span>
        {{ process.name }}
      </div>
      <div class="card-actions">
        <template v-if="process.status === 'running'">
          <button class="btn-stop btn-icon" @click.stop="$emit('stop', process.name)" title="Stop"><i class="fa-solid fa-stop"></i></button>
          <button class="btn-restart btn-icon" @click.stop="$emit('restart', process.name)" title="Restart"><i class="fa-solid fa-rotate-right"></i></button>
        </template>
        <template v-else>
          <button class="btn-start btn-icon" @click.stop="$emit('start', process.name)" title="Start"><i class="fa-solid fa-play"></i></button>
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
      <div v-if="process.branch" class="branch-tag-group" @click.stop>
        <span class="branch-tag" @click.stop="$emit('branch-click', process.name)">{{ process.branch }}</span>
        <button
          class="btn-git-action btn-refresh"
          :class="{ spinning: gitRemoteStatus === 'checking' }"
          @click.stop="checkGitStatus"
          title="Check for remote updates"
        >
          <i class="fa-solid fa-arrows-rotate"></i>
        </button>
        <button
          v-if="gitRemoteStatus === 'behind'"
          class="btn-git-action btn-pull"
          @click.stop="pullGitChanges"
          title="Pull updates"
        >
          <i class="fa-solid fa-cloud-arrow-down"></i>
        </button>
      </div>
      <div class="card-meta-info">
        <span title="PID"><i class="fa-solid fa-hashtag mr-1"></i>{{ process.pid || '-' }}</span>
        <span title="Uptime"><i class="fa-regular fa-clock mr-1"></i>{{ uptime }}</span>
      </div>
    </div>

    <!-- Inline Log Tray -->
    <div v-if="expanded" class="card-log-tray" @click.stop>
      <!-- xterm.js for PTY processes -->
      <div v-if="process.usePty" ref="xtermContainerRef" class="card-xterm-container"></div>

      <!-- HTML logs for non-PTY processes -->
      <div v-if="!process.usePty" ref="logTrayBody" class="card-log-body">
        <div
          v-for="(entry, i) in cardLogs"
          :key="i"
          class="log-line"
          :class="entry.source"
          v-html="formatAnsi(entry.text)"
        ></div>
        <div v-if="!cardLogs.length" class="card-log-empty">No logs yet.</div>
      </div>

    </div>

    <!-- Bottom Expand Indicator -->
    <div
      class="card-expand-indicator"
      :class="{ active: expanded }"
      :style="{ borderColor, color: expanded ? borderColor : '' }"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline :points="expanded ? '18 15 12 9 6 15' : '6 9 12 15 18 9'"/>
      </svg>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import { AnsiUp } from 'ansi_up'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { api } from '../composables/useApi.js'
import { useAlert } from '../composables/useAlert.js'

const ansiUp = new AnsiUp()
function formatAnsi(text) {
  if (!text) return ''
  return ansiUp.ansi_to_html(text)
}

const props = defineProps({
  process: { type: Object, required: true },
  borderColor: { type: String, default: '#2e3144' },
  isSelected: { type: Boolean, default: false },
})

const emit = defineEmits(['select', 'start', 'stop', 'restart', 'edit', 'hover-enter', 'hover-leave', 'branch-click'])

const { showAlert } = useAlert()

const expanded = ref(false)
const gitRemoteStatus = ref(null)
const cardLogs = ref([])
const logTrayBody = ref(null)
const xtermContainerRef = ref(null)
let logSince = 0
let pollTimer = null

// xterm state
let term = null
let fitAddon = null
let ws = null
let resizeObserver = null

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

// ── xterm.js for PTY ───────────────────────
function createCardTerminal() {
  if (term || !xtermContainerRef.value) return
  term = new Terminal({
    cursorBlink: true,
    fontSize: 11,
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
  term.open(xtermContainerRef.value)
  fitWide()

  resizeObserver = new ResizeObserver(() => {
    fitWide()
  })
  resizeObserver.observe(xtermContainerRef.value)

  term.onResize(({ cols, rows }) => {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'resize', cols, rows }))
    }
  })

  term.onData((data) => {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'input', data }))
    }
  })
}

const WIDE_COLS = 200

function fitWide() {
  if (!fitAddon || !term) return
  const dims = fitAddon.proposeDimensions()
  if (dims) {
    term.resize(WIDE_COLS, dims.rows)
  }
}

function destroyCardTerminal() {
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null }
  if (term) { term.dispose(); term = null; fitAddon = null }
}

function connectWs(name) {
  disconnectWs()
  if (!name) return
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = `${proto}//${location.host}/ws/terminal?name=${encodeURIComponent(name)}`
  ws = new WebSocket(url)
  ws.onmessage = (ev) => { if (term) term.write(ev.data) }
  ws.onclose = () => { ws = null }
  ws.onerror = () => { ws = null }
}

function disconnectWs() {
  if (ws) { ws.close(); ws = null }
}

// ── HTML logs for non-PTY ──────────────────
async function fetchCardLogs() {
  const logs = await api(
    `/api/processes/${encodeURIComponent(props.process.name)}/logs?since=${logSince}`
  )
  if (!Array.isArray(logs)) return

  for (const entry of logs) {
    cardLogs.value.push(entry)
    logSince = Math.max(logSince, entry.ts)
  }

  if (cardLogs.value.length > 300) {
    cardLogs.value = cardLogs.value.slice(-300)
  }

  await nextTick()
  if (logTrayBody.value) {
    logTrayBody.value.scrollTop = logTrayBody.value.scrollHeight
  }
}

function startPolling() {
  stopPolling()
  fetchCardLogs()
  pollTimer = setInterval(fetchCardLogs, 800)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

// ── Expand / Collapse ──────────────────────
async function toggleExpand() {
  emit('select', props.process.name)
  emit('hover-leave')
  expanded.value = !expanded.value
  if (expanded.value) {
    if (props.process.usePty) {
      await nextTick()
      createCardTerminal()
      connectWs(props.process.name)
    } else {
      logSince = 0
      cardLogs.value = []
      startPolling()
    }
  } else {
    disconnectWs()
    destroyCardTerminal()
    stopPolling()
    cardLogs.value = []
  }
}

async function checkGitStatus() {
  gitRemoteStatus.value = 'checking'
  try {
    const res = await api(`/api/processes/${encodeURIComponent(props.process.name)}/git/remote-status`, 'POST')
    gitRemoteStatus.value = res.status
  } catch (err) {
    console.error('Failed to check git status:', err)
    gitRemoteStatus.value = 'error'
  }
}

async function pullGitChanges() {
  gitRemoteStatus.value = 'checking'
  try {
    const res = await api(`/api/processes/${encodeURIComponent(props.process.name)}/git/pull`, 'POST')
    if (res.ok) {
      await checkGitStatus()
    } else {
      showAlert('Pull Error', `Pull failed: ${res.error || 'Unknown error'}`)
      gitRemoteStatus.value = 'behind'
    }
  } catch (err) {
    console.error('Failed to pull changes:', err)
    gitRemoteStatus.value = 'behind'
  }
}

onUnmounted(() => {
  stopPolling()
  disconnectWs()
  destroyCardTerminal()
})
</script>
