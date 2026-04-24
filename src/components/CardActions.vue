<template>
  <div
    class="card-actions"
    @mouseenter="$emit('hover-cancel', node.guid)"
    @mouseleave="$emit('hover-enter', node.guid, cardRef, expanded, node.command)"
  >
    <template v-if="node.status === 'running' && !isSelected">
      <button 
        ref="mainActionBtn" 
        class="btn-stop btn-icon" 
        @click.stop="$emit('stop', node.guid)" 
        @keydown.enter.stop="$emit('stop', node.guid)"
        @keydown.space.stop.prevent="$emit('stop', node.guid)"
        title="Stop"
      >
        <i class="fa-solid fa-stop"></i>
      </button>
      <button class="btn-restart btn-icon" @click.stop="$emit('restart', node.guid)" title="Restart"><i class="fa-solid fa-rotate-right"></i></button>
    </template>
    <template v-else-if="!isSelected">
      <button 
        ref="mainActionBtn" 
        class="btn-start btn-icon" 
        @click.stop="$emit('start', node.guid)" 
        @keydown.enter.stop="$emit('start', node.guid)"
        @keydown.space.stop.prevent="$emit('start', node.guid)"
        title="Start"
      >
        <i class="fa-solid fa-play"></i>
      </button>
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
    <button v-if="node.cwd && (isSelected ? !terminalOpen : true)" class="btn-icon btn-workspace" :class="{ active: workspaceOpen }" @click.stop="$emit('open-workspace', node)" title="Toggle Workspace">
      <i :class="node.type === 'agent' ? 'fa-solid fa-laptop-code' : 'fa-solid fa-folder-open'"></i>
    </button>
    <div v-if="filteredTools.length > 0 && !isSelected" class="tools-dropdown-container">
      <button class="btn-icon btn-tools" @click.stop="toggleTools" title="Tools">
        <i class="fa-solid fa-screwdriver-wrench"></i>
      </button>
      <div v-if="showTools" class="tools-dropdown" @click.stop>
        <div class="tools-dropdown-header">Tools</div>
        <div class="tools-list">
          <div v-for="t in filteredTools" :key="t.label" class="tool-item" @click="runTool(t)">
            <i class="fa-solid fa-gear tool-icon"></i>
            <span>{{ t.label }}</span>
            <i v-if="t.isNodeSpecific" class="fa-solid fa-bookmark tool-node-specific-icon" title="Node-specific saved values"></i>
            <i v-else-if="(t.params && t.params.length > 0) || t.requiresParam" class="fa-solid fa-keyboard tool-param-icon" title="Requires parameters"></i>
          </div>
        </div>
      </div>

      <!-- Tool Parameter Modal -->
      <div v-if="toolParamConfig" class="tool-params-modal-overlay" @click.stop>
        <div class="tool-params-modal">
          <div class="tool-params-modal-header">
            Execute <strong>{{ toolParamConfig.tool.label }}</strong>
          </div>
          <div class="tool-params-modal-body">
            <div v-for="(p, i) in toolParamConfig.tool.params" :key="i" class="tool-param-field">
              <label>{{ p.label }}</label>
              <div class="tool-param-input-group">
                <input v-model="toolParamConfig.values[i]" type="text" :placeholder="'Enter ' + p.label" />
                <button v-if="p.type === 'file'" type="button" class="btn-ghost" @click="browseParam(i, 'file')">
                  <i class="fa-solid fa-file"></i>
                </button>
                <button v-if="p.type === 'folder'" type="button" class="btn-ghost" @click="browseParam(i, 'folder')">
                  <i class="fa-solid fa-folder-open"></i>
                </button>
              </div>
            </div>
            <div v-if="!toolParamConfig.tool.params?.length" class="tool-confirmation-msg">
              Are you sure you want to run this tool on <strong>{{ node.name }}</strong>?
              <div class="tool-path-hint">{{ toolParamConfig.tool.path }}</div>
            </div>
          </div>
          <div class="tool-params-modal-actions">
            <button class="btn-ghost" @click="toolParamConfig = null">Cancel</button>
            <button class="btn-start" @click="confirmRunTool">Execute</button>
          </div>
        </div>
      </div>
    </div>
    <button v-if="showEdit && (isSelected ? !terminalOpen : true)" class="btn-gear" @click.stop="$emit('edit', node.guid)">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    </button>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { api } from '../composables/useApi.js'
import { useAlert } from '../composables/useAlert.js'
import { useTasks } from '../composables/useTasks.js'

const props = defineProps({
  node: { type: Object, required: true },
  isSelected: { type: Boolean, default: false },
  terminalOpen: { type: Boolean, default: false },
  workspaceOpen: { type: Boolean, default: false },
  cardRef: { type: Object, default: null },
  expanded: { type: Boolean, default: false },
  showEdit: { type: Boolean, default: true },
})

const emit = defineEmits(['start', 'stop', 'restart', 'edit', 'open-workspace', 'hover-cancel', 'hover-enter'])

const { showAlert } = useAlert()
const { executeTool } = useTasks()

const mainActionBtn = ref(null)
function focusMain() {
  if (mainActionBtn.value) {
    mainActionBtn.value.focus()
    return true
  }
  return false
}
defineExpose({ mainActionBtn, focusMain })

const isGemini = computed(() => {
  const cmd = String(props.node.command || '').toLowerCase()
  return cmd.includes('gemini')
})

const showSessions = ref(false)
const loadingSessions = ref(false)
const sessions = ref([])

const showTools = ref(false)
const tools = ref([])
const toolParamConfig = ref(null)

const filteredTools = computed(() => {
  // 1. Get node specific tools
  const nodeSpecific = (props.node.tools || []).map(nt => {
    const globalT = tools.value.find(gt => gt.label === nt.label)
    if (!globalT) return null
    return {
      ...globalT,
      label: nt.label,
      savedValues: nt.values,
      isNodeSpecific: true
    }
  }).filter(Boolean)
  
  // 2. Get global starred tools
  const starred = tools.value.filter(t => !!t.isBuiltIn)
  
  // Merge: nodeSpecific overrides starred if same label
  const merged = [...nodeSpecific]
  starred.forEach(st => {
    if (!merged.some(m => m.label === st.label)) {
      merged.push(st)
    }
  })
  
  return merged
})

async function fetchTools() {
  try {
    tools.value = await api('/api/tools')
  } catch (err) {
    console.error('Failed to fetch tools:', err)
  }
}

onMounted(() => {
  fetchTools()
  document.addEventListener('click', closeDropdowns)
})

onUnmounted(() => {
  document.removeEventListener('click', closeDropdowns)
})

function closeDropdowns() {
  showSessions.value = false
  showTools.value = false
  // Don't close toolParamConfig on document click to avoid frustration
}

function toggleTools() {
  const current = showTools.value
  closeDropdowns()
  showTools.value = !current
}

async function runTool(tool) {
  // Use modal if confirmation is required OR there are parameters
  if (tool.requireConfirmation || (tool.params && tool.params.length > 0)) {
    toolParamConfig.value = {
      tool,
      values: tool.isNodeSpecific && tool.savedValues 
        ? [...tool.savedValues] 
        : (tool.params || []).map(() => '')
    }
    showTools.value = false
    return
  }

  let param = ''
  if (tool.requiresParam) {
    param = prompt(`Enter parameter for ${tool.label}:`)
    if (param === null) return // cancelled
  }
  showTools.value = false
  await executeTool(props.node.guid, tool, param)
}

async function browseParam(index, type) {
  try {
    const endpoint = type === 'folder' ? '/api/browse-folder' : '/api/browse-file'
    const result = await api(endpoint, 'POST', { startDir: props.node.cwd || undefined })
    if (result.path) {
      toolParamConfig.value.values[index] = result.path
    }
  } catch (err) {
    console.error('Failed to browse:', err)
  }
}

async function confirmRunTool() {
  const { tool, values } = toolParamConfig.value
  toolParamConfig.value = null
  await executeTool(props.node.guid, tool, null, values)
}

async function toggleSessions() {
  const current = showSessions.value
  closeDropdowns()
  showSessions.value = !current
  if (showSessions.value) {
    loadingSessions.value = true
    try {
      sessions.value = await api(`/api/processes/${encodeURIComponent(props.node.guid)}/sessions`)
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
    const result = await api(`/api/processes/${encodeURIComponent(props.node.guid)}/resume/${sessionId}`, 'POST')
    if (result && result.staleSession) {
      try {
        sessions.value = await api(`/api/processes/${encodeURIComponent(props.node.guid)}/sessions`)
      } catch {}
      showAlert('Session unavailable', result.error)
      return
    }
    if (result && result.error) {
      showAlert('Error', `Failed to resume session: ${result.error}`)
      return
    }
    showSessions.value = false
    emit('start', props.node.guid)
  } catch (err) {
    console.error('Failed to resume session:', err)
    showAlert('Error', `Failed to resume session: ${err.message}`)
  }
}
</script>
