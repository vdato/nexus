import { ref, onUnmounted, nextTick } from 'vue'
import { api } from './useApi.js'

export function usePopover() {
  const popoverVisible = ref(false)
  const popoverName = ref(null)
  const popoverLogs = ref([])
  const popoverStyle = ref({ left: '0px', top: '0px' })
  const isPinned = ref(false)

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
    const cardWidth = rect.width
    const h = popoverEl.offsetHeight || 200
    let left = rect.left
    let top = rect.bottom + margin

    // Ensure it doesn't go off-screen horizontally
    if (left + cardWidth > window.innerWidth - 12) {
      left = window.innerWidth - cardWidth - 12
    }
    if (left < 12) left = 12

    // Vertical positioning
    if (top + h > window.innerHeight - 12) {
      top = rect.top - margin - h
    }
    if (top < 12) top = 12

    // Extract actual border color from the card
    const borderColor = window.getComputedStyle(anchorEl).borderColor || '#2e3144'

    popoverStyle.value = { 
      left: left + 'px', 
      top: top + 'px',
      width: cardWidth + 'px',
      borderColor
    }
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
    isPinned.value = false
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
    if (isPinned.value) return
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

  function onCardHoverEnter(name, cardEl, immediate = false) {
    cancelPopoverHide()
    if (popoverVisible.value && popoverName.value === name) {
      if (immediate) isPinned.value = true
      return
    }
    clearTimeout(popoverShowTimer)
    if (immediate) {
      popoverShowTimer = null
      openLogPopover(name, cardEl)
      isPinned.value = true
      return
    }
    isPinned.value = false
    popoverShowTimer = setTimeout(() => {
      popoverShowTimer = null
      openLogPopover(name, cardEl)
    }, 1000)
  }

  function onCardHoverLeave(name, force = false) {
    if (name && popoverName.value !== name) {
      return
    }
    if (force) {
      hideLogPopover()
      return
    }
    if (isPinned.value) {
      return
    }
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

  function clearPopoverLogs() {
    popoverLogs.value = []
    popoverSince = Date.now()
  }

  return {
    popoverVisible,
    popoverName,
    popoverLogs,
    popoverStyle,
    setPopoverEl,
    setPopoverPollInterval,
    hideLogPopover,
    clearPopoverLogs,
    schedulePopoverHide,
    cancelPopoverHide,
    onCardHoverEnter,
    onCardHoverLeave,
    onWindowResize,
  }
}
