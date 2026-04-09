import { ref, onUnmounted, nextTick } from 'vue'
import { api } from './useApi.js'

export function useLogs() {
  const selectedNode = ref(null)
  const logs = ref([])
  const lastRefresh = ref('')
  const logAutoScroll = ref(true)
  const logPanelHeight = ref(300)

  let logSince = 0
  let logTimer = null

  /** Reference to the log body element — set from the component */
  let logBodyEl = null

  function setLogBodyEl(el) {
    logBodyEl = el
  }

  async function fetchLogs() {
    if (!selectedNode.value) return
    const newLogs = await api(
      `/api/processes/${encodeURIComponent(selectedNode.value)}/logs?since=${logSince}`
    )
    if (!Array.isArray(newLogs)) return

    for (const entry of newLogs) {
      logs.value.push(entry)
      logSince = Math.max(logSince, entry.ts)
    }

    if (logAutoScroll.value && newLogs.length > 0) {
      await nextTick()
      if (logBodyEl) {
        logBodyEl.scrollTop = logBodyEl.scrollHeight
      }
    }

    const now = new Date()
    lastRefresh.value = 'Last refresh: ' + now.toLocaleTimeString()
  }

  function selectLog(name) {
    if (selectedNode.value === name) {
      closeLog()
      return
    }
    selectedNode.value = name
    logSince = 0
    logs.value = []
    fetchLogs()
  }

  function closeLog() {
    selectedNode.value = null
    logs.value = []
    logSince = 0
  }

  function onLogScroll() {
    if (!logBodyEl) return
    const { scrollTop, scrollHeight, clientHeight } = logBodyEl
    logAutoScroll.value = scrollHeight - scrollTop - clientHeight < 40
  }

  function applyLogPanelHeight(h) {
    logPanelHeight.value = Math.max(120, Math.min(h, window.innerHeight - 60))
  }

  function startLogPolling(intervalMs = 500) {
    stopLogPolling()
    logTimer = setInterval(fetchLogs, intervalMs)
  }

  function stopLogPolling() {
    if (logTimer) {
      clearInterval(logTimer)
      logTimer = null
    }
  }

  onUnmounted(stopLogPolling)

  function clearLogs() {
    logs.value = []
    logSince = Date.now()
  }

  return {
    selectedNode,
    logs,
    lastRefresh,
    logAutoScroll,
    logPanelHeight,
    setLogBodyEl,
    fetchLogs,
    selectLog,
    closeLog,
    clearLogs,
    onLogScroll,
    applyLogPanelHeight,
    startLogPolling,
    stopLogPolling,
  }
}
