<template>
  <div v-if="show" class="modal-overlay" @mousedown.self="overlayMouseDown = true" @click.self="handleOverlayClick">
    <div class="modal">
      <h2>{{ isEditing ? `Edit — ${editingName}` : 'Add Node' }}</h2>

      <div class="form-group">
        <label>Type</label>
        <div class="node-type-toggle">
          <button
            v-for="t in nodeTypes"
            :key="t.value"
            type="button"
            class="node-type-btn"
            :class="{ active: form.type === t.value }"
            @click="form.type = t.value"
          >
            <i :class="t.icon"></i>
            <span>{{ t.label }}</span>
          </button>
        </div>
      </div>
      
      <div class="modal-tabs">
        <button 
          class="modal-tab" 
          :class="{ active: activeTab === 'details' }"
          @click="activeTab = 'details'"
        >Details</button>
        <button 
          class="modal-tab" 
          :class="{ active: activeTab === 'tools' }"
          @click="activeTab = 'tools'"
        >Tools</button>
      </div>

      <div v-if="activeTab === 'details'">
        <div class="form-group">
          <label>Name</label>
          <div style="display: flex; gap: 6px; position: relative">
            <input v-model="form.name" type="text" placeholder="my-service" style="flex: 1" />
            <button
              v-if="form.type === 'script'"
              type="button"
              class="btn-ghost cmd-template-btn"
              @click.stop="toolTemplateMenuOpen = !toolTemplateMenuOpen"
              title="Fill from tool"
              style="white-space: nowrap; flex-shrink: 0;"
            >
              <i class="fa-solid fa-toolbox" style="margin-right: 5px"></i>Tools
            </button>
            <div v-if="toolTemplateMenuOpen" class="cmd-template-menu" @click.stop>
              <div
                v-for="tool in globalTools"
                :key="tool.label"
                class="cmd-template-item"
                @click="applyToolAsTemplate(tool)"
              >
                <i class="fa-solid fa-gear cmd-template-icon"></i>
                <div>
                  <div class="cmd-template-name">{{ tool.label }}</div>
                  <div class="cmd-template-desc">{{ tool.path }}</div>
                </div>
              </div>
              <div v-if="!globalTools.length" class="cmd-template-item hint">
                No tools configured.
              </div>
            </div>
          </div>
        </div>
        <template v-if="form.type !== 'desk'">
          <div class="form-group">
            <label>Command</label>
            <div style="display: flex; gap: 6px; position: relative">
              <input v-model="form.command" type="text" placeholder="pwsh, node, docker, npm..." style="flex: 1" />
              <button
                v-if="form.type === 'agent'"
                type="button"
                class="btn-ghost cmd-template-btn"
                @click.stop="toggleTemplateMenu"
                title="Fill from template"
                style="white-space: nowrap; flex-shrink: 0;"
              >
                <i class="fa-solid fa-wand-magic-sparkles" style="margin-right: 5px"></i>Template
              </button>
              <div v-if="templateMenuOpen" class="cmd-template-menu" @click.stop>
                <div
                  v-for="tpl in commandTemplates"
                  :key="tpl.label"
                  class="cmd-template-item"
                  @click="applyTemplate(tpl)"
                >
                  <i :class="tpl.icon" class="cmd-template-icon"></i>
                  <div>
                    <div class="cmd-template-name">{{ tpl.label }}</div>
                    <div class="cmd-template-desc">{{ tpl.description }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="form-group">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
              <label style="margin-bottom: 0">Arguments</label>
              <button 
                type="button" 
                class="btn-ghost" 
                @click="toggleArgsMode" 
                style="font-size: 11px; padding: 2px 6px;"
                :title="form.argsMode === 'raw' ? 'Switch to List Mode' : 'Switch to Text Mode'"
              >
                <i :class="form.argsMode === 'raw' ? 'fa-solid fa-list' : 'fa-solid fa-font'" style="margin-right: 4px"></i>
                {{ form.argsMode === 'raw' ? 'List' : 'Text' }}
              </button>
            </div>
            
            <div v-if="form.argsMode === 'raw'">
              <input v-model="form.argsRaw" type="text" placeholder="start_server.ps1  (space-separated)" />
              <div class="hint">Space-separated. Quote paths with spaces: "path/with spaces/file.sh". Supports {ENV_KEY} templates</div>
            </div>
            <div v-else class="args-list-container">
              <div class="on-success-chips" style="margin-bottom: 8px">
                <span v-for="(arg, idx) in form.argsList" :key="idx" class="on-success-chip">
                  <span style="font-family: 'SF Mono', 'Fira Code', monospace">{{ arg }}</span>
                  <button type="button" class="chip-remove" @click="removeArg(idx)" aria-label="Remove">×</button>
                </span>
                <span v-if="!form.argsList.length" class="hint" style="padding: 4px 0">No arguments added.</span>
              </div>
              <div style="display: flex; gap: 6px;">
                <input 
                  v-model="newArg" 
                  type="text" 
                  placeholder="Add argument..." 
                  @keydown.enter.prevent="addArg"
                  style="flex: 1"
                />
                <button type="button" class="btn-ghost" @click="addArg" style="white-space: nowrap">Add</button>
              </div>
            </div>
          </div>
        </template>
        <div class="form-group">
          <label>Working Directory</label>
          <div style="display: flex; gap: 6px;">
            <input v-model="form.cwd" type="text" placeholder="{BASE_DIR}/my-project  (optional)" style="flex: 1" />
            <button class="btn-ghost" @click="browseDirectory" :disabled="browsing" style="white-space: nowrap; flex-shrink: 0;">
              {{ browsing ? 'Picking...' : 'Browse' }}
            </button>
          </div>
          <div class="hint">Use {ENV_KEY} to reference environment variables, e.g. {BASE_DIR}/src</div>
          <div
            v-if="resolvedCwd && form.cwd && resolvedCwd !== form.cwd"
            class="hint"
            style="color: var(--purple); margin-top: 4px; font-family: 'SF Mono', 'Fira Code', monospace"
          >
            Resolved: {{ resolvedCwd }}
          </div>
        </div>
        <div class="form-group">
          <label>Group</label>
          <select v-model="form.group">
            <option v-for="g in groupNames" :key="g" :value="g">{{ g }}</option>
          </select>
        </div>

        <div v-if="form.type === 'script'" class="form-group">
          <label>On Success — Trigger Nodes</label>
          <div class="on-success-chips">
            <span v-for="n in form.onSuccess" :key="n" class="on-success-chip">
              <span class="group-dot" :style="{ background: nodeColor(n) }"></span>
              <span>{{ n }}</span>
              <button type="button" class="chip-remove" @click="removeTrigger(n)" aria-label="Remove">×</button>
            </span>
            <span v-if="!form.onSuccess.length" class="hint" style="padding: 4px 0">None — exits won't chain.</span>
          </div>
          <div class="trigger-select" @click.stop>
            <button
              type="button"
              class="trigger-select-btn"
              :disabled="!onSuccessOptions.length"
              @click="toggleTriggerMenu"
            >
              <span>{{ onSuccessOptions.length ? '+ Add trigger…' : 'No nodes available' }}</span>
              <i class="fa-solid fa-chevron-down" style="font-size: 10px; opacity: 0.6"></i>
            </button>
            <div v-if="triggerMenuOpen" class="trigger-select-menu">
              <div
                v-for="opt in onSuccessOptions"
                :key="opt.name"
                class="trigger-select-item"
                @click="selectTrigger(opt.name)"
              >
                <span class="group-dot" :style="{ background: opt.color }"></span>
                <span>{{ opt.name }}</span>
                <span v-if="opt.group" class="trigger-select-group">({{ opt.group }})</span>
              </div>
            </div>
          </div>
          <div class="hint">On clean exit (code 0), all selected nodes are triggered in order.</div>
        </div>
      </div>

      <div v-if="activeTab === 'tools'">
        <!-- Node-specific Tools -->
        <div class="form-group">
          <label>Node Tools (Toolbox)</label>
          <div class="node-tools-list">
            <div v-for="(tool, ti) in form.tools" :key="ti" class="node-tool-item">
              <div class="node-tool-header">
                <span class="node-tool-label">
                  <i class="fa-solid fa-gear"></i>
                  {{ tool.label }}
                </span>
                <button type="button" class="btn-remove-row" @click="removeNodeTool(ti)">&times;</button>
              </div>
              <div class="node-tool-params" v-if="getGlobalTool(tool.label)?.params?.length">
                <div v-for="(p, pi) in getGlobalTool(tool.label).params" :key="pi" class="node-tool-param-field">
                  <label>{{ p.label }}</label>
                  <div class="tool-param-input-group">
                    <input v-model="tool.values[pi]" type="text" :placeholder="'Enter ' + p.label" />
                    <button 
                      v-if="p.type === 'file'" 
                      type="button" 
                      class="btn-ghost" 
                      style="padding: 0 8px; flex-shrink: 0;"
                      @click="browseNodeToolParam(ti, pi, 'file')"
                      title="Select File"
                    >
                      <i class="fa-solid fa-file"></i>
                    </button>
                    <button 
                      v-if="p.type === 'folder'" 
                      type="button" 
                      class="btn-ghost" 
                      style="padding: 0 8px; flex-shrink: 0;"
                      @click="browseNodeToolParam(ti, pi, 'folder')"
                      title="Select Folder"
                    >
                      <i class="fa-solid fa-folder-open"></i>
                    </button>
                  </div>
                </div>              </div>
            </div>
            <div v-if="!form.tools.length" class="hint" style="padding: 4px 0">No node-specific tools defined.</div>
          </div>
          <div class="trigger-select" @click.stop>
            <button
              type="button"
              class="trigger-select-btn"
              :disabled="!availableGlobalTools.length"
              @click="toolMenuOpen = !toolMenuOpen"
            >
              <span>{{ availableGlobalTools.length ? '+ Add tool to node…' : 'All tools already added' }}</span>
              <i class="fa-solid fa-chevron-down" style="font-size: 10px; opacity: 0.6"></i>
            </button>
            <div v-if="toolMenuOpen" class="trigger-select-menu">
              <div
                v-for="gt in availableGlobalTools"
                :key="gt.label"
                class="trigger-select-item"
                @click="addNodeTool(gt)"
              >
                <i class="fa-solid fa-gear" style="font-size: 12px; color: var(--text-dim)"></i>
                <span>{{ gt.label }}</span>
              </div>
            </div>
          </div>
          <div class="hint">Starred tools are always available. Use this to add specific tools and save their parameter values for this node.</div>
        </div>
      </div>

      <div class="modal-actions" style="justify-content: space-between">
        <div v-if="isEditing" style="display: flex; gap: 8px;">
          <button class="btn-delete" @click="handleRemove">Remove Node</button>
          <button class="btn-ghost" @click="handleClone" style="color: var(--purple)">
            <i class="fa-solid fa-clone" style="margin-right: 6px"></i>Clone
          </button>
        </div>
        <div style="display: flex; gap: 8px; margin-left: auto">
          <button class="btn-ghost" @click="$emit('close')">Cancel</button>
          <button class="btn-start" @click="handleSubmit">{{ isEditing ? 'Save' : 'Add' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch, computed, onMounted, onUnmounted } from 'vue'
import { api } from '../composables/useApi.js'

const props = defineProps({
  show: { type: Boolean, default: false },
  editingGuid: { type: String, default: null },
  groupNames: { type: Array, default: () => ['other'] },
  colorMap: { type: Object, default: () => ({}) },
  nodes: { type: Array, default: () => [] },
  cloneData: { type: Object, default: null },
})

const emit = defineEmits(['close', 'submit', 'remove', 'clone'])

const activeTab = ref('details')
const overlayMouseDown = ref(false)
function handleOverlayClick() {
  if (overlayMouseDown.value) emit('close')
  overlayMouseDown.value = false
}

const isEditing = computed(() => !!props.editingGuid)

const editingName = computed(() => {
  if (!props.editingGuid) return null
  return props.nodes.find(n => n.guid === props.editingGuid)?.name || props.editingGuid
})

const nodeTypes = [
  { value: 'service', label: 'Service', icon: 'fa-solid fa-server' },
  { value: 'agent', label: 'Agent', icon: 'fa-solid fa-robot' },
  { value: 'desk', label: 'Desk', icon: 'fa-solid fa-desktop' },
  { value: 'script', label: 'Script', icon: 'fa-solid fa-scroll' },
]

const form = reactive({
  name: '',
  command: '',
  argsRaw: '',
  argsList: [],
  argsMode: 'raw',
  cwd: '',
  type: 'service',
  group: 'other',
  usePty: false,
  onSuccess: [],
  tools: [],
})

const globalTools = ref([])
const toolMenuOpen = ref(false)
const toolTemplateMenuOpen = ref(false)
const newArg = ref('')

function toggleArgsMode() {
  if (form.argsMode === 'raw') {
    form.argsList = parseArgs(form.argsRaw.trim())
    form.argsMode = 'list'
  } else {
    form.argsRaw = form.argsList.join(' ')
    form.argsMode = 'raw'
  }
}

function addArg() {
  const val = newArg.value.trim()
  if (!val) return
  form.argsList.push(val)
  newArg.value = ''
}

function removeArg(index) {
  form.argsList.splice(index, 1)
}

async function fetchGlobalTools() {
  try {
    globalTools.value = await api('/api/tools')
  } catch (err) {
    console.error('Failed to fetch global tools:', err)
  }
}

const availableGlobalTools = computed(() => {
  return globalTools.value.filter(gt => !form.tools.some(t => t.label === gt.label))
})

function applyToolAsTemplate(tool) {
  form.name = tool.label
  
  let command = ''
  let argsRaw = ''
  const p = tool.path
  const isAbs = p.startsWith('/') || p.includes(':\\')
  
  // Heuristic: if absolute path with spaces and no obvious args (no " -" or "{param")
  // treat the whole thing as the command.
  if (isAbs && p.includes(' ') && !p.startsWith('"') && !p.includes(' -') && !p.includes('{param')) {
    command = p
    argsRaw = ''
  } else {
    const parts = parseArgs(p)
    if (parts.length > 0) {
      command = parts[0]
      argsRaw = parts.slice(1).join(' ')
    } else {
      command = p
    }
  }

  // Append parameter placeholders if they aren't already in the command/args
  if (tool.params && tool.params.length > 0 && !p.includes('{param')) {
    const paramPlaceholders = tool.params.map((_, i) => `{param${i}}`).join(' ')
    argsRaw = argsRaw ? `${argsRaw} ${paramPlaceholders}` : paramPlaceholders
  }
  
  form.command = command
  form.argsRaw = argsRaw
  form.argsList = parseArgs(argsRaw)
  form.argsMode = 'list'
  form.type = 'script'
  toolTemplateMenuOpen.value = false
}

function addNodeTool(tool) {
  form.tools.push({
    label: tool.label,
    values: (tool.params || []).map(() => '')
  })
  toolMenuOpen.value = false
}

function removeNodeTool(index) {
  form.tools.splice(index, 1)
}

function getGlobalTool(label) {
  return globalTools.value.find(t => t.label === label)
}

async function browseNodeToolParam(toolIndex, paramIndex, type) {
  try {
    const endpoint = type === 'folder' ? '/api/browse-folder' : '/api/browse-file'
    const result = await api(endpoint, 'POST', { startDir: form.cwd || undefined })
    if (result.path) {
      form.tools[toolIndex].values[paramIndex] = result.path
    }
  } catch (err) {
    console.error('Failed to browse parameter:', err)
  }
}

function nodeGroup(name) {
  const n = (props.nodes || []).find((x) => x.name === name)
  return n?.group || ''
}
function nodeColor(name) {
  const g = nodeGroup(name)
  return (props.colorMap && props.colorMap[g]) || 'var(--muted, #888)'
}

const onSuccessOptions = computed(() =>
  (props.nodes || [])
    .filter((n) => n.name && n.name !== form.name && !form.onSuccess.includes(n.name))
    .map((n) => ({ name: n.name, group: n.group, color: nodeColor(n.name) }))
)

function addTrigger(name) {
  if (!name) return
  if (!form.onSuccess.includes(name)) form.onSuccess.push(name)
}
function removeTrigger(name) {
  form.onSuccess = form.onSuccess.filter((n) => n !== name)
}

const triggerMenuOpen = ref(false)
function toggleTriggerMenu() {
  triggerMenuOpen.value = !triggerMenuOpen.value
}
function selectTrigger(name) {
  addTrigger(name)
  triggerMenuOpen.value = false
}
function closeTriggerMenu() {
  triggerMenuOpen.value = false
}

watch(() => form.type, (type) => {
  form.usePty = type === 'agent'
  if (type !== 'agent') templateMenuOpen.value = false
  if (type !== 'script') form.onSuccess = []
})

const resolvedCwd = ref(null)
const browsing = ref(false)

// ── Command Templates ───────────────────────
const templateMenuOpen = ref(false)

const commandTemplates = [
  {
    label: 'Cursor',
    description: 'Cursor CLI Agent',
    icon: 'fa-solid fa-robot',
    command: 'agent',
    argsRaw: '',
    type: 'agent',
    usePty: true,
  },
  {
    label: 'Claude',
    description: "Anthropic's Claude CLI Agent",
    icon: 'fa-solid fa-robot',
    command: 'claude',
    argsRaw: '',
    type: 'agent',
    usePty: true,
  },
  {
    label: 'Gemini',
    description: "Google's Gemini CLI Agent",
    icon: 'fa-solid fa-gem',
    command: '/opt/homebrew/bin/node',
    argsRaw: '/opt/homebrew/bin/gemini',
    type: 'agent',
    usePty: true,
  },
]

function toggleTemplateMenu() {
  templateMenuOpen.value = !templateMenuOpen.value
}

function applyTemplate(tpl) {
  form.command = tpl.command
  form.argsRaw = tpl.argsRaw
  form.type = tpl.type
  form.usePty = tpl.usePty
  templateMenuOpen.value = false
}

function closeTemplateMenu(e) {
  templateMenuOpen.value = false
}

function closeAllMenus() {
  closeTemplateMenu()
  closeTriggerMenu()
  toolMenuOpen.value = false
  toolTemplateMenuOpen.value = false
}
onMounted(() => document.addEventListener('click', closeAllMenus))
onUnmounted(() => document.removeEventListener('click', closeAllMenus))

async function browseDirectory() {
  browsing.value = true
  try {
    const result = await api('/api/browse-directory', 'POST', { startDir: form.cwd || undefined })
    if (result.path) {
      form.cwd = result.path
    }
  } catch {}
  browsing.value = false
}

watch(() => props.show, async (val) => {
  if (!val) return
  activeTab.value = 'details'
  resolvedCwd.value = null
  fetchGlobalTools()

  if (props.editingName) {
    const [config, procs] = await Promise.all([
      api(`/api/config/${encodeURIComponent(props.editingName)}`),
      api('/api/processes'),
    ])
    if (config.error) { alert(config.error); return }
    const proc = procs.find((p) => p.name === props.editingName)

    form.name = config.name
    form.command = config.command || ''
    form.argsRaw = (config.args || []).join(' ')
    form.argsList = [...(config.args || [])]
    form.argsMode = config.argsMode || 'raw'
    form.cwd = config.cwd || ''
    form.type = config.type || 'service'
    form.group = config.group || props.groupNames[0] || 'other'
    form.usePty = config.type === 'agent' ? true : !!config.usePty
    form.onSuccess = Array.isArray(config.onSuccess)
      ? [...config.onSuccess]
      : (config.onSuccess ? [config.onSuccess] : [])
    form.tools = Array.isArray(config.tools) ? JSON.parse(JSON.stringify(config.tools)) : []
    resolvedCwd.value = proc?.resolvedCwd || null
  } else if (props.cloneData) {
    form.name = props.cloneData.name
    form.command = props.cloneData.command || ''
    form.argsRaw = props.cloneData.argsRaw || ''
    form.argsList = parseArgs(props.cloneData.argsRaw)
    form.argsMode = props.cloneData.argsMode || 'raw'
    form.cwd = props.cloneData.cwd || ''
    form.type = props.cloneData.type || 'service'
    form.group = props.cloneData.group || props.groupNames[0] || 'other'
    form.usePty = !!props.cloneData.usePty
    form.onSuccess = Array.isArray(props.cloneData.onSuccess)
      ? [...props.cloneData.onSuccess]
      : (props.cloneData.onSuccess ? [props.cloneData.onSuccess] : [])
    form.tools = Array.isArray(props.cloneData.tools) ? JSON.parse(JSON.stringify(props.cloneData.tools)) : []
  } else {
    form.name = ''
    form.command = ''
    form.argsRaw = ''
    form.argsList = []
    form.argsMode = 'raw'
    form.cwd = ''
    form.type = 'service'
    form.group = props.groupNames[0] || 'other'
    form.usePty = false
    form.onSuccess = []
    form.tools = []
  }
})

function parseArgs(raw) {
  if (!raw) return []
  const matches = raw.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)
  return matches ? matches.map((a) => a.replace(/^["']|["']$/g, '')) : []
}

function handleSubmit() {
  const name = form.name.trim()
  const command = form.command.trim()
  if (!name) return alert('Name is required.')
  if (!['desk'].includes(form.type) && !command) return alert('Command is required.')

  const args = form.argsMode === 'list' ? [...form.argsList] : parseArgs(form.argsRaw.trim())

  const data = {
    name,
    command: command || undefined,
    args,
    argsMode: form.argsMode,
    cwd: form.cwd.trim() || undefined,
    type: form.type,
    group: form.group,
    usePty: form.usePty,
    onSuccess: form.type === 'script' && form.onSuccess.length > 0 ? [...form.onSuccess] : undefined,
    tools: form.tools.length > 0 ? form.tools : undefined,
  }
  emit('submit', { data, isEditing: isEditing.value, editingName: props.editingName })
}

function handleRemove() {
  emit('remove', props.editingName)
}

function handleClone() {
  emit('clone', {
    name: form.name + '-copy',
    command: form.command,
    argsRaw: form.argsRaw,
    argsMode: form.argsMode,
    cwd: form.cwd,
    type: form.type,
    group: form.group,
    usePty: form.usePty,
    onSuccess: [...form.onSuccess],
    tools: JSON.parse(JSON.stringify(form.tools)),
  })
}
</script>

<style scoped>
.on-success-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
  min-height: 28px;
}
.on-success-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px 3px 8px;
  background: var(--surface-2, #2a2a2a);
  border: 1px solid var(--border, #3a3a3a);
  border-radius: 14px;
  font-size: 12px;
}
.group-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}
.chip-remove {
  background: transparent;
  border: 0;
  color: var(--muted, #888);
  cursor: pointer;
  padding: 0 4px;
  font-size: 16px;
  line-height: 1;
}
.chip-remove:hover {
  color: var(--danger, #e66);
}
.trigger-select {
  position: relative;
}
.trigger-select-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--surface-2, #2a2a2a);
  border: 1px solid var(--border, #3a3a3a);
  border-radius: 6px;
  color: var(--text, #ddd);
  cursor: pointer;
  font-size: 13px;
  text-align: left;
}
.trigger-select-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.trigger-select-btn:not(:disabled):hover {
  border-color: var(--border-strong, #555);
}
.trigger-select-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 220px;
  overflow-y: auto;
  background: var(--surface-2, #2a2a2a);
  border: 1px solid var(--border, #3a3a3a);
  border-radius: 6px;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
.trigger-select-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 13px;
}
.trigger-select-item:hover {
  background: var(--surface-3, #333);
}
.trigger-select-group {
  color: var(--muted, #888);
  font-size: 12px;
}
.args-list-container {
  background: var(--surface-1, #1e1e1e);
  border: 1px solid var(--border, #3a3a3a);
  border-radius: 6px;
  padding: 8px;
}
</style>
