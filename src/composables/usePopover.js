import { ref, reactive, onUnmounted, nextTick } from 'vue'
import { api } from './useApi.js'

export function usePopover() {
  // ── Pinned popovers (one per expanded card) ──
  const pinnedPopovers = reactive(new Map())

  // ── Hover popover (single, transient) ──
  const popoverVisible = ref(false)
  const popoverName = ref(null)
  const popoverLogs = ref([])
  const popoverStyle = ref({ left: '0px', top: '0px' })

  let hoverSince = 0
  let hoverShowTimer = null
  let hoverHideTimer = null
  let hoverPollTimer = null
  let hoverAnchorEl = null
  let hoverPopoverEl = null

  let popoverPollInterval = 1500

  function setPopoverEl(el) {
    hoverPopoverEl = el
  }

  function setPopoverPollInterval(ms) {
    popoverPollInterval = ms || 1500
  }

  // ── Positioning ──────────────────────────────
  function computePosition(anchorEl, popoverEl) {
    const rect = anchorEl.getBoundingClientRect()
    const margin = 8
    const cardWidth = rect.width
    const h = (popoverEl && popoverEl.offsetHeight) || 200
    let left = rect.left
    let top = rect.bottom + margin

    if (left + cardWidth > window.innerWidth - 12) {
      left = window.innerWidth - cardWidth - 12
    }
    if (left < 12) left = 12
    if (top + h > window.innerHeight - 12) {
      top = rect.top - margin - h
    }
    if (top < 12) top = 12

    const borderColor = window.getComputedStyle(anchorEl).borderColor || '#2e3144'
    return { left: left + 'px', top: top + 'px', width: cardWidth + 'px', borderColor }
  }

  // ── Pinned popover management ────────────────
  function addPinnedPopover(name, anchorEl) {
    if (pinnedPopovers.has(name)) {
      const entry = pinnedPopovers.get(name)
      entry.anchorEl = anchorEl
      entry.style = computePosition(anchorEl, null)
      return
    }

    // Close hover popover if it's showing this node
    if (popoverName.value === name) {
      hideHoverPopover()
    }

    const entry = reactive({
      logs: [],
      style: computePosition(anchorEl, null),
      since: 0,
      anchorEl,
      pollTimer: null,
    })

    pinnedPopovers.set(name, entry)

    fetchPinnedLogs(name)
    entry.pollTimer = setInterval(() => fetchPinnedLogs(name), popoverPollInterval)

    nextTick(() => {
      entry.style = computePosition(anchorEl, null)
      nextTick(() => { entry.style = computePosition(anchorEl, null) })
    })
  }

  function removePinnedPopover(name) {
    const entry = pinnedPopovers.get(name)
    if (!entry) return
    if (entry.pollTimer) clearInterval(entry.pollTimer)
    pinnedPopovers.delete(name)
  }

  async function fetchPinnedLogs(name) {
    const entry = pinnedPopovers.get(name)
    if (!entry) return

    const sinceBefore = entry.since
    const logs = await api(
      `/api/processes/${encodeURIComponent(name)}/logs?since=${entry.since}`
    )
    if (!Array.isArray(logs)) return
    if (!pinnedPopovers.has(name)) return

    if (sinceBefore === 0) entry.logs = []

    for (const log of logs) {
      entry.logs.push(log)
      entry.since = Math.max(entry.since, log.ts)
    }

    if (entry.logs.length > 200) {
      entry.logs = entry.logs.slice(-200)
    }
  }

  function clearPinnedLogs(name) {
    const entry = pinnedPopovers.get(name)
    if (!entry) return
    entry.logs = []
    entry.since = Date.now()
  }

  // ── Hover popover ────────────────────────────
  async function fetchHoverLogs() {
    if (!popoverName.value) return
    const sinceBefore = hoverSince
    const logs = await api(
      `/api/processes/${encodeURIComponent(popoverName.value)}/logs?since=${hoverSince}`
    )
    if (!Array.isArray(logs)) return

    if (sinceBefore === 0) popoverLogs.value = []

    for (const entry of logs) {
      popoverLogs.value.push(entry)
      hoverSince = Math.max(hoverSince, entry.ts)
    }

    if (popoverLogs.value.length > 200) {
      popoverLogs.value = popoverLogs.value.slice(-200)
    }

    await nextTick()
    if (hoverPopoverEl) {
      const body = hoverPopoverEl.querySelector('.log-popover-body')
      if (body) body.scrollTop = body.scrollHeight
    }
  }

  function openHoverPopover(name, anchorEl) {
    hideHoverPopover()
    popoverName.value = name
    hoverSince = 0
    hoverAnchorEl = anchorEl
    popoverLogs.value = []
    popoverVisible.value = true

    nextTick(() => {
      if (hoverPopoverEl) popoverStyle.value = computePosition(anchorEl, hoverPopoverEl)
      nextTick(() => {
        if (hoverPopoverEl) popoverStyle.value = computePosition(anchorEl, hoverPopoverEl)
      })
    })

    fetchHoverLogs()
    hoverPollTimer = setInterval(fetchHoverLogs, popoverPollInterval)
  }

  function hideHoverPopover() {
    clearTimeout(hoverShowTimer)
    hoverShowTimer = null
    clearTimeout(hoverHideTimer)
    hoverHideTimer = null
    if (hoverPollTimer) {
      clearInterval(hoverPollTimer)
      hoverPollTimer = null
    }
    popoverName.value = null
    hoverSince = 0
    hoverAnchorEl = null
    popoverVisible.value = false
    popoverLogs.value = []
  }

  function schedulePopoverHide() {
    clearTimeout(hoverHideTimer)
    hoverHideTimer = setTimeout(() => {
      hoverHideTimer = null
      hideHoverPopover()
    }, 250)
  }

  function cancelPopoverHide() {
    clearTimeout(hoverHideTimer)
    hoverHideTimer = null
  }

  function clearPopoverLogs() {
    popoverLogs.value = []
    hoverSince = Date.now()
  }

  // ── Card event handlers ──────────────────────
  function onCardHoverEnter(name, cardEl, immediate = false, command = '') {
    if (immediate) {
      addPinnedPopover(name, cardEl)
      return
    }
    // Passive hover — skip if already pinned
    if (pinnedPopovers.has(name)) return
    // Only cancel a pending hide if the visible popover is for this same card.
    // Otherwise, let the existing popover hide while we schedule this card's show.
    if (popoverVisible.value && popoverName.value === name) {
      cancelPopoverHide()
      return
    }
    const delay = 2000;
    clearTimeout(hoverShowTimer)
    hoverShowTimer = setTimeout(() => {
      hoverShowTimer = null
      openHoverPopover(name, cardEl)
    }, delay)
  }

  function onCardHoverCancel() {
    clearTimeout(hoverShowTimer)
    hoverShowTimer = null
  }

  function onCardHoverLeave(name, force = false) {
    if (force) {
      removePinnedPopover(name)
      return
    }
    if (pinnedPopovers.has(name)) return
    clearTimeout(hoverShowTimer)
    hoverShowTimer = null
    if (popoverVisible.value) {
      schedulePopoverHide()
    }
  }

  function onWindowResize() {
    if (hoverAnchorEl && popoverVisible.value && hoverPopoverEl) {
      popoverStyle.value = computePosition(hoverAnchorEl, hoverPopoverEl)
    }
    for (const [, entry] of pinnedPopovers) {
      if (entry.anchorEl) {
        entry.style = computePosition(entry.anchorEl, null)
      }
    }
  }

  // ── Cleanup ──────────────────────────────────
  function hideAllPopovers() {
    hideHoverPopover()
    for (const [, entry] of pinnedPopovers) {
      if (entry.pollTimer) clearInterval(entry.pollTimer)
    }
    pinnedPopovers.clear()
  }

  onUnmounted(() => {
    hideAllPopovers()
  })

  return {
    // Pinned
    pinnedPopovers,
    removePinnedPopover,
    clearPinnedLogs,
    // Hover
    popoverVisible,
    popoverName,
    popoverLogs,
    popoverStyle,
    setPopoverEl,
    setPopoverPollInterval,
    hideLogPopover: hideHoverPopover,
    clearPopoverLogs,
    schedulePopoverHide,
    cancelPopoverHide,
    // Shared
    onCardHoverEnter,
    onCardHoverLeave,
    onCardHoverCancel,
    onWindowResize,
  }
}
