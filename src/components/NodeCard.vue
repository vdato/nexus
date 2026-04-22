<template>
  <div
    ref="cardRef"
    class="card"
    :class="{ selected: isSelected, expanded }"
    :style="{ borderColor, '--card-color': borderColor }"
    @click="$emit('select', node.name)"
    @mouseenter="$emit('hover-enter', node.name, $event.currentTarget, expanded, node.command)"
    @mouseleave="!expanded && $emit('hover-leave', node.name)"
  >
    <div class="card-header">
      <div class="card-name">
        <i :class="[typeIcon, 'node-type-icon', node.status]" :title="node.type"></i>
        {{ node.name }}
        <i v-if="node.needsInput" class="fa-solid fa-keyboard fa-fade" style="margin-left: 8px; color: #fbbf24;" title="Waiting for input..."></i>
      </div>
      <div
        class="card-actions"
        @mouseenter="$emit('hover-cancel', node.name)"
        @mouseleave="$emit('hover-enter', node.name, cardRef, expanded, node.command)"
      >
        <template v-if="node.status === 'running'">
          <button class="btn-stop btn-icon" @click.stop="$emit('stop', node.name)" title="Stop"><i class="fa-solid fa-stop"></i></button>
          <button class="btn-restart btn-icon" @click.stop="$emit('restart', node.name)" title="Restart"><i class="fa-solid fa-rotate-right"></i></button>
        </template>
        <template v-else>
          <button class="btn-start btn-icon" @click.stop="$emit('start', node.name)" title="Start"><i class="fa-solid fa-play"></i></button>
          <div v-if="node.type === 'agent' && isGemini" class="session-dropdown-container">
            <button class="btn-sessions btn-icon" @click.stop="toggleSessions" title="Resume Session">
              <i class="fa-solid fa-history"></i>
            </button>
            <div v-if="showSessions" class="session-dropdown" @click.stop>
              <div class="session-dropdown-header">
                Recent Sessions
                <button class="btn-close-sessions" @click="showSessions = false">&times;</button>
              </div>
              <div v-if="loadingSessions" class="session-loading">Loading...</div>
              <div v-else-if="sessions.length === 0" class="session-empty">No sessions found.</div>
              <div v-else class="session-list">
                <div v-for="s in sessions" :key="s.id" class="session-item" @click="resumeSession(s.id)">
                  <div class="session-title">{{ s.title }}</div>
                  <div class="session-time">{{ s.time }}</div>
                </div>
              </div>
            </div>
          </div>
        </template>
        <button v-if="node.cwd" class="btn-icon btn-workspace" @click.stop="$emit('open-workspace', node)" title="Open Workspace">
          <i class="fa-solid fa-folder-open"></i>
        </button>
        <button class="btn-gear" @click.stop="$emit('edit', node.name)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="card-meta">
      <div v-if="node.branch" class="branch-tag-group" @click.stop>
        <span class="branch-tag" @click.stop="$emit('branch-click', node.name)">{{ node.branch }}</span>
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
        <span title="PID"><i class="fa-solid fa-hashtag mr-1"></i>{{ node.pid || '-' }}</span>
        <span title="Uptime"><i class="fa-regular fa-clock mr-1"></i>{{ uptime }}</span>
      </div>
    </div>

    <!-- Bottom Expand Button -->
    <button
      class="card-expand-indicator"
      :class="{ active: expanded }"
      :style="{ borderColor, color: expanded ? borderColor : '' }"
      @click.stop="toggleExpand"
      :title="expanded ? 'Collapse' : 'Expand'"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline :points="expanded ? '18 15 12 9 6 15' : '6 9 12 15 18 9'"/>
      </svg>
    </button>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { api } from '../composables/useApi.js'
import { useAlert } from '../composables/useAlert.js'

const props = defineProps({
  node: { type: Object, required: true },
  borderColor: { type: String, default: '#2e3144' },
  isSelected: { type: Boolean, default: false },
})

const emit = defineEmits(['select', 'start', 'stop', 'restart', 'edit', 'hover-enter', 'hover-leave', 'hover-cancel', 'branch-click', 'open-workspace', 'pull-git'])

const { showAlert } = useAlert()

const cardRef = ref(null)
const expanded = ref(false)
const gitRemoteStatus = ref(null)

const showSessions = ref(false)
const loadingSessions = ref(false)
const sessions = ref([])

async function toggleSessions() {
  showSessions.value = !showSessions.value
  if (showSessions.value) {
    loadingSessions.value = true
    try {
      sessions.value = await api(`/api/processes/${encodeURIComponent(props.node.name)}/sessions`)
    } catch (err) {
      console.error('Failed to fetch sessions:', err)
      showAlert('Error', 'Failed to fetch sessions.')
    } finally {
      loadingSessions.value = false
    }
  }
}

async function resumeSession(sessionId) {
  try {
    const result = await api(`/api/processes/${encodeURIComponent(props.node.name)}/resume/${sessionId}`, 'POST')
    if (result && result.staleSession) {
      try {
        sessions.value = await api(`/api/processes/${encodeURIComponent(props.node.name)}/sessions`)
      } catch {}
      showAlert('Session unavailable', result.error)
      return
    }
    if (result && result.error) {
      showAlert('Error', `Failed to resume session: ${result.error}`)
      return
    }
    showSessions.value = false
    emit('start', props.node.name)
  } catch (err) {
    console.error('Failed to resume session:', err)
    showAlert('Error', `Failed to resume session: ${err.message}`)
  }
}

function formatUptime(ms) {
  if (!ms) return '-'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

const TYPE_ICONS = {
  service: 'fa-solid fa-server',
  agent: 'fa-solid fa-robot',
  desk: 'fa-solid fa-desktop',
  script: 'fa-solid fa-scroll',
}

const typeIcon = computed(() => TYPE_ICONS[props.node.type] || 'fa-solid fa-circle')

const isGemini = computed(() => {
  const cmd = String(props.node.command || '').toLowerCase()
  return cmd.includes('gemini')
})

const uptime = computed(() => {
  if (props.node.status === 'running' && props.node.startedAt) {
    return formatUptime(Date.now() - props.node.startedAt)
  }
  return '-'
})

// ── Expand / Collapse ──────────────────────
function toggleExpand() {
  expanded.value = !expanded.value
  if (expanded.value) {
    // Show popover immediately when expanded
    emit('hover-enter', props.node.name, cardRef.value, true)
  } else {
    // Hide popover immediately when collapsed
    emit('hover-leave', props.node.name, true)
  }
}

async function checkGitStatus() {
  gitRemoteStatus.value = 'checking'
  try {
    const res = await api(`/api/processes/${encodeURIComponent(props.node.name)}/git/remote-status`, 'POST')
    gitRemoteStatus.value = res.status
  } catch (err) {
    console.error('Failed to check git status:', err)
    gitRemoteStatus.value = 'error'
  }
}

async function pullGitChanges() {
  gitRemoteStatus.value = 'checking'
  emit('pull-git', props.node.name, (success) => {
    if (success) {
      checkGitStatus()
    } else {
      gitRemoteStatus.value = 'behind'
    }
  })
}

onUnmounted(() => {
})
</script>
