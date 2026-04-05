import { ref, onUnmounted, nextTick } from 'vue'
import { api } from './useApi.js'

export function useLogs() {
  const selectedProcess = ref(null)
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
    if (!selectedProcess.value) return
    const newLogs = await api(
      `/api/processes/${encodeURIComponent(selectedProcess.value)}/logs?since=${logSince}`
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
    if (selectedProcess.value === name) {
      closeLog()
      return
    }
    selectedProcess.value = name
    logSince = 0
    logs.value = []
    fetchLogs()
  }

  function closeLog() {
    selectedProcess.value = null
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

  return {
    selectedProcess,
    logs,
    lastRefresh,
    logAutoScroll,
    logPanelHeight,
    setLogBodyEl,
    fetchLogs,
    selectLog,
    closeLog,
    onLogScroll,
    applyLogPanelHeight,
    startLogPolling,
    stopLogPolling,
  }
}
