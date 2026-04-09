<template>
  <div v-if="show" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <h2>{{ isEditing ? `Edit — ${editingName}` : 'Add Process' }}</h2>
      <div class="form-group">
        <label>Name</label>
        <input v-model="form.name" type="text" placeholder="my-service" />
      </div>
      <div class="form-group">
        <label>Command</label>
        <input v-model="form.command" type="text" placeholder="pwsh, node, docker, npm..." />
      </div>
      <div class="form-group">
        <label>Arguments</label>
        <input v-model="form.argsRaw" type="text" placeholder="start_server.ps1  (space-separated)" />
        <div class="hint">Space-separated. Quote paths with spaces: "path/with spaces/file.sh". Supports {ENV_KEY} templates</div>
      </div>
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
      <div class="form-group checkbox-group" style="display: flex; align-items: center; gap: 8px; margin-top: 16px;">
        <input v-model="form.usePty" type="checkbox" id="usePty" style="width: auto" />
        <label for="usePty" style="margin: 0; cursor: pointer;">Run in Interactive Terminal (TTY)</label>
      </div>
      <div class="hint" style="margin-top: -6px; margin-bottom: 12px; margin-left: 24px;">
        Check this for interactive tools like <code>claude</code> that require a real terminal.
      </div>
      <div class="modal-actions" style="justify-content: space-between">
        <div v-if="isEditing">
          <button class="btn-delete" @click="handleRemove">Remove Process</button>
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
  processes: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'submit', 'remove'])

const isEditing = computed(() => !!props.editingName)

const form = reactive({
  name: '',
  command: '',
  argsRaw: '',
  cwd: '',
  group: 'other',
  usePty: false,
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
    form.group = config.group || props.groupNames[0] || 'other'
    form.usePty = !!config.usePty
    resolvedCwd.value = proc?.resolvedCwd || null
  } else {
    form.name = ''
    form.command = ''
    form.argsRaw = ''
    form.cwd = ''
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
  if (!command) return alert('Command is required.')

  const data = {
    name,
    command,
    args: parseArgs(form.argsRaw.trim()),
    cwd: form.cwd.trim() || undefined,
    group: form.group,
    usePty: form.usePty,
  }
  emit('submit', { data, isEditing: isEditing.value, editingName: props.editingName })
}

function handleRemove() {
  emit('remove', props.editingName)
}
</script>
