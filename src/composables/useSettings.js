import { ref } from 'vue'
import { api } from './useApi.js'

export function useSettings() {
  const showSettingsModal = ref(false)
  const activeTab = ref('general')

  const envRows = ref([])
  const groupRows = ref([])
  const toolRows = ref([])

  const sysLogPollInterval = ref(500)
  const sysStatusPollInterval = ref(3000)
  const sysPopoverPollInterval = ref(1500)
  const sysPort = ref(1337)
  const sysMaxLogLines = ref(500)
  const sysTerminalWidth = ref(120)

  function normalizeColorInput(hex) {
    if (!hex || typeof hex !== 'string') return '#888888'
    const s = hex.trim()
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase()
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase()
    }
    return '#888888'
  }

  async function openSettings() {
    const [env, groupData, sys, toolsData] = await Promise.all([
      api('/api/env'),
      api('/api/groups'),
      api('/api/system'),
      api('/api/tools'),
    ])

    sysLogPollInterval.value = sys.logPollInterval || 500
    sysStatusPollInterval.value = sys.statusPollInterval || 3000
    sysPopoverPollInterval.value = sys.popoverPollInterval || 1500
    sysPort.value = sys.port || 1337
    sysMaxLogLines.value = sys.maxLogLines || 500
    sysTerminalWidth.value = sys.terminalWidth || 120

    activeTab.value = 'general'

    const entries = Object.entries(env)
    envRows.value = entries.length ? entries.map(([k, v]) => ({ key: k, value: v })) : [{ key: '', value: '' }]

    const fallback = [
      { name: 'infra', color: '#a78bfa' },
      { name: 'frontend', color: '#60a5fa' },
      { name: 'backend', color: '#34d399' },
    ]
    const gList = Array.isArray(groupData) && groupData.length ? groupData : fallback
    groupRows.value = gList.map((g) => {
      if (typeof g === 'string') return { guid: null, name: g, color: '#888888' }
      return { guid: g.guid, name: g.name || '', color: normalizeColorInput(g.color) }
    })

    toolRows.value = Array.isArray(toolsData) && toolsData.length 
      ? toolsData.map(t => ({ 
          label: t.label || '', 
          path: t.path || '', 
          isBuiltIn: !!t.isBuiltIn,
          requireConfirmation: !!t.requireConfirmation,
          params: Array.isArray(t.params) ? t.params.map(p => ({ label: p.label || '', type: p.type || 'text' })) : []
        }))
      : [{ label: '', path: '', isBuiltIn: false, requireConfirmation: false, params: [] }]

    showSettingsModal.value = true
  }

  function closeSettings() {
    showSettingsModal.value = false
  }

  function addEnvRow() {
    envRows.value.push({ key: '', value: '' })
  }

  function removeEnvRow(index) {
    envRows.value.splice(index, 1)
  }

  function addGroupRow() {
    groupRows.value.push({ name: '', color: '#888888' })
  }

  function removeGroupRow(index) {
    groupRows.value.splice(index, 1)
  }

  function addToolRow() {
    toolRows.value.push({ label: '', path: '', isBuiltIn: false, requireConfirmation: false, params: [] })
  }

  async function removeToolRow(index) {
    toolRows.value.splice(index, 1)
  }

  async function browseFile(index) {
    try {
      const startDir = toolRows.value[index].path || undefined
      const result = await api('/api/browse-file', 'POST', { startDir })
      if (result.path) {
        toolRows.value[index].path = result.path
      }
    } catch {}
  }

  function reorderGroups({ from, to }) {
    const rows = groupRows.value
    const [item] = rows.splice(from, 1)
    rows.splice(to, 0, item)
  }

  async function saveSettings() {
    // Build env object
    const env = {}
    for (const row of envRows.value) {
      const key = row.key.trim()
      if (key) env[key] = row.value
    }

    // Validate groups
    const groups = []
    const seen = new Set()
    for (const row of groupRows.value) {
      const name = row.name.trim()
      if (!name) continue
      if (seen.has(name)) {
        alert(`Duplicate group name: "${name}"`)
        return false
      }
      seen.add(name)
      groups.push({ guid: row.guid, name, color: normalizeColorInput(row.color) })
    }
    if (groups.length === 0) {
      alert('At least one non-empty group is required.')
      return false
    }

    const r1 = await api('/api/env', 'PUT', env)
    if (r1.error) { alert(r1.error); return false }

    const r2 = await api('/api/groups', 'PUT', groups)
    if (r2.error) { alert(r2.error); return false }

    const tools = toolRows.value.filter(t => t.label.trim() && t.path.trim()).map(t => ({
      label: t.label.trim(),
      path: t.path.trim(),
      isBuiltIn: !!t.isBuiltIn,
      requireConfirmation: !!t.requireConfirmation,
      params: t.params.map(p => ({ label: p.label.trim(), type: p.type }))
    }))
    const r4 = await api('/api/tools', 'PUT', tools)
    if (r4.error) { alert(r4.error); return false }

    const sysUpdate = {
      port: parseInt(sysPort.value) || 1337,
      maxLogLines: parseInt(sysMaxLogLines.value) || 500,
      terminalWidth: parseInt(sysTerminalWidth.value) || 120,
      logPollInterval: parseInt(sysLogPollInterval.value) || 500,
      statusPollInterval: parseInt(sysStatusPollInterval.value) || 3000,
      popoverPollInterval: parseInt(sysPopoverPollInterval.value) || 1500,
    }
    const r3 = await api('/api/system', 'PUT', sysUpdate)
    if (r3.error) { alert(r3.error); return false }

    closeSettings()
    return sysUpdate
  }

  async function handleImport(file) {
    if (!file) return null
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!Array.isArray(data)) {
        alert('File must contain a JSON array of node configs.')
        return null
      }
      const result = await api('/api/config/import', 'POST', data)
      if (result.error) { alert(result.error); return null }
      const msgs = []
      if (result.added?.length) msgs.push(`Added: ${result.added.join(', ')}`)
      if (result.skipped?.length) msgs.push(`Skipped: ${result.skipped.map((s) => `${s.name} (${s.reason})`).join(', ')}`)
      alert(msgs.join('\n') || 'Nothing to import.')
      return result
    } catch {
      alert('Invalid JSON file.')
      return null
    }
  }

  return {
    showSettingsModal,
    activeTab,
    envRows,
    groupRows,
    toolRows,
    sysLogPollInterval,
    sysStatusPollInterval,
    sysPopoverPollInterval,
    sysPort,
    sysMaxLogLines,
    sysTerminalWidth,
    openSettings,
    closeSettings,
    addEnvRow,
    removeEnvRow,
    addGroupRow,
    removeGroupRow,
    addToolRow,
    removeToolRow,
    browseFile,
    reorderGroups,
    saveSettings,
    handleImport,
    normalizeColorInput,
  }
}
