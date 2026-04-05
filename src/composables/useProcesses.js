import { ref, onUnmounted } from 'vue'
import { api } from './useApi.js'

export function useProcesses() {
  const processes = ref([])
  const groups = ref([])
  const lastSnapshot = ref('')

  let statusTimer = null

  function normalizeColorInput(hex) {
    if (!hex || typeof hex !== 'string') return '#888888'
    const s = hex.trim()
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase()
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase()
    }
    return '#888888'
  }

  function groupDefsToNames(defs) {
    if (!Array.isArray(defs)) return []
    return defs.map((g) => (typeof g === 'string' ? g : g && g.name)).filter(Boolean)
  }

  function buildGroupColorMap(groupDefs) {
    const map = {}
    if (!Array.isArray(groupDefs)) return map
    for (const g of groupDefs) {
      if (typeof g === 'object' && g && g.name) {
        map[g.name] = normalizeColorInput(g.color || '#4b5563')
      }
    }
    return map
  }

  function buildSortedGroups(procs, groupDefs) {
    const grouped = {}
    for (const p of procs) {
      const g = p.group || 'other'
      if (!grouped[g]) grouped[g] = []
      grouped[g].push(p)
    }

    const orderNames = groupDefsToNames(groupDefs)
    const order = orderNames.length ? orderNames : ['infra', 'frontend', 'backend']
    const colorMap = buildGroupColorMap(groupDefs)

    const sorted = Object.entries(grouped).sort((a, b) => {
      const ia = order.indexOf(a[0])
      const ib = order.indexOf(b[0])
      const va = ia === -1 ? 999 : ia
      const vb = ib === -1 ? 999 : ib
      if (va !== vb) return va - vb
      return a[0].localeCompare(b[0])
    })

    return { sorted, colorMap }
  }

  function getCounts(procs) {
    const counts = { running: 0, stopped: 0, errored: 0, stopping: 0 }
    for (const p of procs) {
      if (counts[p.status] !== undefined) counts[p.status]++
      else counts.stopped++
    }
    return counts
  }

  const DEFAULT_GROUPS = [
    { name: 'infra', color: '#a78bfa' },
    { name: 'frontend', color: '#60a5fa' },
    { name: 'backend', color: '#34d399' },
  ]

  async function refresh(force = false) {
    const [procs, groupDefs] = await Promise.all([
      api('/api/processes'),
      api('/api/groups'),
    ])
    const defs = Array.isArray(groupDefs) && groupDefs.length ? groupDefs : DEFAULT_GROUPS

    const snapshot = JSON.stringify({
      procs: procs.map((p) => ({
        name: p.name, status: p.status, pid: p.pid, group: p.group, branch: p.branch,
      })),
      groups: defs,
    })

    if (!force && snapshot === lastSnapshot.value) return
    lastSnapshot.value = snapshot

    processes.value = procs
    groups.value = defs
  }

  async function startProcess(name) {
    await api(`/api/processes/${encodeURIComponent(name)}/start`, 'POST')
    await refresh(true)
  }

  async function stopProcess(name) {
    await api(`/api/processes/${encodeURIComponent(name)}/stop`, 'POST')
    await refresh(true)
  }

  async function restartProcess(name) {
    await api(`/api/processes/${encodeURIComponent(name)}/restart`, 'POST')
    await refresh(true)
  }

  async function startAll() {
    await api('/api/start-all', 'POST')
    await refresh(true)
  }

  async function stopAll() {
    await api('/api/stop-all', 'POST')
    await refresh(true)
  }

  async function addProcess(data) {
    const result = await api('/api/config', 'POST', data)
    if (result.error) { alert(result.error); return false }
    await refresh(true)
    return true
  }

  async function updateProcess(oldName, data) {
    const result = await api(`/api/config/${encodeURIComponent(oldName)}`, 'PUT', data)
    if (result.error) { alert(result.error); return false }
    await refresh(true)
    return true
  }

  async function removeProcess(name) {
    if (!confirm(`Remove "${name}" from config?`)) return false
    const result = await api(`/api/config/${encodeURIComponent(name)}`, 'DELETE')
    if (result.error) { alert(result.error); return false }
    await refresh(true)
    return true
  }

  async function getProcessConfig(name) {
    return api(`/api/config/${encodeURIComponent(name)}`)
  }

  async function importProcesses(fileData) {
    const result = await api('/api/config/import', 'POST', fileData)
    if (result.error) { alert(result.error); return null }
    await refresh(true)
    return result
  }

  function startPolling(intervalMs = 3000) {
    stopPolling()
    statusTimer = setInterval(() => refresh(), intervalMs)
  }

  function stopPolling() {
    if (statusTimer) {
      clearInterval(statusTimer)
      statusTimer = null
    }
  }

  onUnmounted(stopPolling)

  return {
    processes,
    groups,
    refresh,
    startProcess,
    stopProcess,
    restartProcess,
    startAll,
    stopAll,
    addProcess,
    updateProcess,
    removeProcess,
    getProcessConfig,
    importProcesses,
    startPolling,
    stopPolling,
    buildSortedGroups,
    getCounts,
    groupDefsToNames,
    normalizeColorInput,
  }
}
