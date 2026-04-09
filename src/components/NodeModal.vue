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
      <div class="form-group">
        <label>Name</label>
        <input v-model="form.name" type="text" placeholder="my-service" />
      </div>
      <template v-if="form.type !== 'desk'">
        <div class="form-group">
          <label>Command</label>
          <input v-model="form.command" type="text" placeholder="pwsh, node, docker, npm..." />
        </div>
        <div class="form-group">
          <label>Arguments</label>
          <input v-model="form.argsRaw" type="text" placeholder="start_server.ps1  (space-separated)" />
          <div class="hint">Space-separated. Quote paths with spaces: "path/with spaces/file.sh". Supports {ENV_KEY} templates</div>
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
      <div class="modal-actions" style="justify-content: space-between">
        <div v-if="isEditing">
          <button class="btn-delete" @click="handleRemove">Remove Node</button>
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
import { ref, reactive, watch, computed } from 'vue'
import { api } from '../composables/useApi.js'

const props = defineProps({
  show: { type: Boolean, default: false },
  editingName: { type: String, default: null },
  groupNames: { type: Array, default: () => ['other'] },
  nodes: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'submit', 'remove'])

const overlayMouseDown = ref(false)
function handleOverlayClick() {
  if (overlayMouseDown.value) emit('close')
  overlayMouseDown.value = false
}

const isEditing = computed(() => !!props.editingName)

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
  cwd: '',
  type: 'service',
  group: 'other',
  usePty: false,
})

watch(() => form.type, (type) => {
  form.usePty = type === 'agent'
})

const resolvedCwd = ref(null)
const browsing = ref(false)

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
  resolvedCwd.value = null

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
    form.cwd = config.cwd || ''
    form.type = config.type || 'service'
    form.group = config.group || props.groupNames[0] || 'other'
    form.usePty = config.type === 'agent' ? true : !!config.usePty
    resolvedCwd.value = proc?.resolvedCwd || null
  } else {
    form.name = ''
    form.command = ''
    form.argsRaw = ''
    form.cwd = ''
    form.type = 'service'
    form.group = props.groupNames[0] || 'other'
    form.usePty = false
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

  const data = {
    name,
    command: command || undefined,
    args: parseArgs(form.argsRaw.trim()),
    cwd: form.cwd.trim() || undefined,
    type: form.type,
    group: form.group,
    usePty: form.usePty,
  }
  emit('submit', { data, isEditing: isEditing.value, editingName: props.editingName })
}

function handleRemove() {
  emit('remove', props.editingName)
}
</script>
