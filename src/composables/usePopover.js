import { ref, onUnmounted, nextTick } from 'vue'
import { api } from './useApi.js'

export function usePopover() {
  const popoverVisible = ref(false)
  const popoverName = ref(null)
  const popoverLogs = ref([])
  const popoverStyle = ref({ left: '0px', top: '0px' })

  let popoverSince = 0
  let popoverShowTimer = null
  let popoverHideTimer = null
  let popoverPollTimer = null
  let popoverPollInterval = 1500
  let popoverAnchorEl = null
  let popoverEl = null

  function setPopoverEl(el) {
    popoverEl = el
  }

  function setPopoverPollInterval(ms) {
    popoverPollInterval = ms || 1500
  }

  function positionPopover(anchorEl) {
    if (!popoverEl) return
    const rect = anchorEl.getBoundingClientRect()
    const margin = 8
    const w = popoverEl.offsetWidth || 400
    const h = popoverEl.offsetHeight || 200
    let left = rect.left
    let top = rect.bottom + margin

    if (left + w > window.innerWidth - 12) left = window.innerWidth - w - 12
    if (left < 12) left = 12
    if (top + h > window.innerHeight - 12) {
      top = rect.top - margin - h
    }
    if (top < 12) top = 12

    popoverStyle.value = { left: left + 'px', top: top + 'px' }
  }

  async function fetchPopoverLogs() {
    if (!popoverName.value) return
    const sinceBefore = popoverSince
    const logs = await api(
      `/api/processes/${encodeURIComponent(popoverName.value)}/logs?since=${popoverSince}`
    )
    if (!Array.isArray(logs)) return

    if (sinceBefore === 0) {
      popoverLogs.value = []
    }

    for (const entry of logs) {
      popoverLogs.value.push(entry)
      popoverSince = Math.max(popoverSince, entry.ts)
    }

    // Trim to 200 lines
    if (popoverLogs.value.length > 200) {
      popoverLogs.value = popoverLogs.value.slice(-200)
    }

    await nextTick()
    if (popoverEl) {
      const body = popoverEl.querySelector('.log-popover-body')
      if (body) body.scrollTop = body.scrollHeight
    }
  }

  function openLogPopover(name, anchorEl) {
    hideLogPopover()
    popoverName.value = name
    popoverSince = 0
    popoverAnchorEl = anchorEl
    popoverLogs.value = []
    popoverVisible.value = true

    nextTick(() => {
      positionPopover(anchorEl)
      nextTick(() => positionPopover(anchorEl))
    })

    fetchPopoverLogs()
    popoverPollTimer = setInterval(fetchPopoverLogs, popoverPollInterval)
  }

  function hideLogPopover() {
    clearTimeout(popoverShowTimer)
    popoverShowTimer = null
    clearTimeout(popoverHideTimer)
    popoverHideTimer = null
    if (popoverPollTimer) {
      clearInterval(popoverPollTimer)
      popoverPollTimer = null
    }
    popoverName.value = null
    popoverSince = 0
    popoverAnchorEl = null
    popoverVisible.value = false
    popoverLogs.value = []
  }

  function schedulePopoverHide() {
    clearTimeout(popoverHideTimer)
    popoverHideTimer = setTimeout(() => {
      popoverHideTimer = null
      hideLogPopover()
    }, 250)
  }

  function cancelPopoverHide() {
    clearTimeout(popoverHideTimer)
    popoverHideTimer = null
  }

  function onCardHoverEnter(name, cardEl) {
    cancelPopoverHide()
    clearTimeout(popoverShowTimer)
    popoverShowTimer = setTimeout(() => {
      popoverShowTimer = null
      openLogPopover(name, cardEl)
    }, 1000)
  }

  function onCardHoverLeave() {
    clearTimeout(popoverShowTimer)
    popoverShowTimer = null
    schedulePopoverHide()
  }

  function onWindowResize() {
    if (popoverAnchorEl && popoverVisible.value) {
      positionPopover(popoverAnchorEl)
    }
  }

  onUnmounted(() => {
    hideLogPopover()
  })

  return {
    popoverVisible,
    popoverName,
    popoverLogs,
    popoverStyle,
    setPopoverEl,
    setPopoverPollInterval,
    hideLogPopover,
    schedulePopoverHide,
    cancelPopoverHide,
    onCardHoverEnter,
    onCardHoverLeave,
    onWindowResize,
  }
}
