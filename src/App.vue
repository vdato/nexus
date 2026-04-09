<template>
  <AppHeader
    :counts="counts"
    :total="processStore.processes.value.length"
    @add-process="openAddModal"
    @start-all="processStore.startAll"
    @stop-all="processStore.stopAll"
    @open-settings="settingsStore.openSettings"
  />

  <div class="floating-toolbar" :style="{ bottom: logStore.selectedProcess.value ? (logStore.logPanelHeight.value + 16) + 'px' : '' }">
    <div class="toolbar-section">
      <span class="toolbar-label">View</span>
      <button class="toolbar-btn" :class="{ active: viewMode === 'group' }" @click="viewMode = 'group'">Group</button>
      <button class="toolbar-btn" :class="{ active: viewMode === 'none' }" @click="viewMode = 'none'">None</button>
    </div>
    <div class="toolbar-divider"></div>
    <div class="toolbar-section">
      <span class="toolbar-label">Sort</span>
      <button class="toolbar-btn" :class="{ active: sortBy === 'default' }" @click="sortBy = 'default'">Default</button>
      <button class="toolbar-btn" :class="{ active: sortBy === 'name' }" @click="sortBy = 'name'">Name</button>
      <button class="toolbar-btn" :class="{ active: sortBy === 'status' }" @click="sortBy = 'status'">Status</button>
    </div>
  </div>

  <div
    class="container"
    :style="{ paddingBottom: logStore.selectedProcess.value ? (logStore.logPanelHeight.value + 20) + 'px' : '' }"
  >
    <ProcessGrid
      :sorted-groups="displayGroups"
      :color-map="colorMap"
      :view-mode="viewMode"
      :selected-process="logStore.selectedProcess.value"
      @select="handleSelectLog"
      @start="handleStart"
      @stop="handleStop"
      @restart="handleRestart"
      @edit="openEditModal"
      @hover-enter="popoverStore.onCardHoverEnter"
      @hover-leave="popoverStore.onCardHoverLeave"
      @reorder="handleReorder"
      @reorder-groups="handleReorderGroups"
      @move-to-group="handleMoveToGroup"
      @branch-click="openBranchModal"
    />
  </div>

  <LogPopover
    ref="logPopoverRef"
    :visible="popoverStore.popoverVisible.value"
    :name="popoverStore.popoverName.value || ''"
    :logs="popoverStore.popoverLogs.value"
    :style="popoverStore.popoverStyle.value"
    @cancel-hide="popoverStore.cancelPopoverHide"
    @schedule-hide="popoverStore.schedulePopoverHide"
    @clear="popoverStore.clearPopoverLogs"
  />

  <XTermPanel
    v-if="selectedIsPty"
    :process-name="logStore.selectedProcess.value"
    :panel-height="logStore.logPanelHeight.value"
    @close="handleCloseLog"
    @resize="logStore.applyLogPanelHeight"
  />

  <LogPanel
    v-else
    ref="logPanelRef"
    :selected-process="logStore.selectedProcess.value"
    :logs="logStore.logs.value"
    :last-refresh="logStore.lastRefresh.value"
    :panel-height="logStore.logPanelHeight.value"
    @close="handleCloseLog"
    @resize="logStore.applyLogPanelHeight"
    @clear="logStore.clearLogs"
    @send-stdin="handleSendStdin"
  />

  <ProcessModal
    :show="showProcessModal"
    :editing-name="editingProcessName"
    :group-names="groupNames"
    :processes="processStore.processes.value"
    @close="closeProcessModal"
    @submit="handleProcessSubmit"
    @remove="handleProcessRemove"
  />

  <BranchModal
    :show="branchModalStore.show"
    :process-name="branchModalStore.processName"
    :branches="branchModalStore.branches"
    :current-branch="branchModalStore.currentBranch"
    :loading="branchModalStore.loading"
    :error="branchModalStore.error"
    @close="closeBranchModal"
    @checkout="handleCheckoutBranch"
  />

  <AlertModal />



  <SettingsModal
    :show="settingsStore.showSettingsModal.value"
    :env-rows="settingsStore.envRows.value"
    :group-rows="settingsStore.groupRows.value"
    v-model:log-poll-interval="settingsStore.sysLogPollInterval.value"
    v-model:status-poll-interval="settingsStore.sysStatusPollInterval.value"
    v-model:popover-poll-interval="settingsStore.sysPopoverPollInterval.value"
    v-model:port="settingsStore.sysPort.value"
    v-model:max-log-lines="settingsStore.sysMaxLogLines.value"
    @close="settingsStore.closeSettings"
    @save="handleSaveSettings"
    @add-env="settingsStore.addEnvRow"
    @remove-env="settingsStore.removeEnvRow"
    @add-group="settingsStore.addGroupRow"
    @remove-group="settingsStore.removeGroupRow"
    @reorder-groups="settingsStore.reorderGroups"
    @import="handleImport"
  />
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'

import AppHeader from './components/AppHeader.vue'
import ProcessGrid from './components/ProcessGrid.vue'
import XTermPanel from './components/XTermPanel.vue'
import LogPanel from './components/LogPanel.vue'
import LogPopover from './components/LogPopover.vue'
import ProcessModal from './components/ProcessModal.vue'
import SettingsModal from './components/SettingsModal.vue'
import BranchModal from './components/BranchModal.vue'
import AlertModal from './components/AlertModal.vue'

import { useProcesses } from './composables/useProcesses.js'
import { useLogs } from './composables/useLogs.js'
import { usePopover } from './composables/usePopover.js'
import { useSettings } from './composables/useSettings.js'
import { useAlert } from './composables/useAlert.js'
import { api } from './composables/useApi.js'



// ── Stores ──────────────────────────────────
const processStore = useProcesses()
const logStore = useLogs()
const popoverStore = usePopover()
const settingsStore = useSettings()
const { showAlert } = useAlert()

// ── Computed ────────────────────────────────
const selectedIsPty = computed(() => {
  const name = logStore.selectedProcess.value
  if (!name) return false
  const proc = processStore.processes.value.find(p => p.name === name)
  return proc?.usePty || false
})

const counts = computed(() => processStore.getCounts(processStore.processes.value))

const sortedGroupsData = computed(() =>
  processStore.buildSortedGroups(processStore.processes.value, processStore.groups.value)
)

const sortedGroups = computed(() => sortedGroupsData.value.sorted)
const colorMap = computed(() => sortedGroupsData.value.colorMap)

// ── View Mode & Sorting ────────────────────
const viewMode = ref(localStorage.getItem('xpm-view') || 'group')
const sortBy = ref(localStorage.getItem('xpm-sort') || 'default')
const customOrder = ref(JSON.parse(localStorage.getItem('xpm-order') || '[]'))

watch(viewMode, (v) => localStorage.setItem('xpm-view', v))
watch(sortBy, (v) => localStorage.setItem('xpm-sort', v))

const STATUS_PRIORITY = { running: 0, stopping: 1, errored: 2, stopped: 3 }

function sortProcesses(procs) {
  if (sortBy.value === 'name') {
    return [...procs].sort((a, b) => a.name.localeCompare(b.name))
  }
  if (sortBy.value === 'status') {
    return [...procs].sort((a, b) => (STATUS_PRIORITY[a.status] ?? 9) - (STATUS_PRIORITY[b.status] ?? 9) || a.name.localeCompare(b.name))
  }
  // default — use custom order if available
  if (customOrder.value.length) {
    const orderMap = new Map(customOrder.value.map((n, i) => [n, i]))
    return [...procs].sort((a, b) => (orderMap.get(a.name) ?? 999) - (orderMap.get(b.name) ?? 999))
  }
  return procs
}

const displayGroups = computed(() => {
  if (viewMode.value === 'none') {
    // Flat list — all processes in one unnamed group
    const all = sortedGroups.value.flatMap(([, items]) => items)
    return [['', sortProcesses(all)]]
  }
  // Grouped — sort within each group
  return sortedGroups.value.map(([group, items]) => [group, sortProcesses(items)])
})

function handleReorder(orderedNames) {
  customOrder.value = orderedNames
  localStorage.setItem('xpm-order', JSON.stringify(orderedNames))
  if (sortBy.value !== 'default') sortBy.value = 'default'
}

async function handleMoveToGroup({ name, group }) {
  const config = await processStore.getProcessConfig(name)
  if (config.error) return
  await processStore.updateProcess(name, { ...config, group })
}

async function handleReorderGroups(groupNames) {
  // Rebuild groups list with existing colors in the new order
  const currentGroups = processStore.groups.value
  const reordered = groupNames.map((name) => {
    const existing = currentGroups.find((g) => (typeof g === 'string' ? g : g.name) === name)
    if (existing && typeof existing === 'object') return existing
    return { name, color: '#888888' }
  })
  await api('/api/groups', 'PUT', reordered)
  await processStore.refresh(true)
}

const groupNames = computed(() => {
  const names = processStore.groupDefsToNames(processStore.groups.value)
  return names.length ? names : ['other']
})

// ── Process Modal ───────────────────────────
const showProcessModal = ref(false)
const editingProcessName = ref(null)

function openAddModal() {
  editingProcessName.value = null
  showProcessModal.value = true
}

function openEditModal(name) {
  editingProcessName.value = name
  showProcessModal.value = true
}

function closeProcessModal() {
  showProcessModal.value = false
  editingProcessName.value = null
}

async function handleProcessSubmit({ data, isEditing, editingName }) {
  let success
  if (isEditing) {
    success = await processStore.updateProcess(editingName, data)
    if (success && data.name !== editingName && logStore.selectedProcess.value === editingName) {
      logStore.selectedProcess.value = data.name
    }
  } else {
    success = await processStore.addProcess(data)
  }
  if (success) closeProcessModal()
}

async function handleProcessRemove(name) {
  const removed = await processStore.removeProcess(name)
  if (removed) {
    if (logStore.selectedProcess.value === name) logStore.closeLog()
    closeProcessModal()
  }
}

// ── Process Actions ─────────────────────────
async function handleStart(name) {
  await processStore.startProcess(name)
}

async function handleStop(name) {
  await processStore.stopProcess(name)
}

async function handleRestart(name) {
  await processStore.restartProcess(name)
}

// ── Branch Modal ────────────────────────────
import { reactive } from 'vue'
const branchModalStore = reactive({
  show: false,
  processName: null,
  branches: [],
  currentBranch: null,
  loading: false,
  error: null
})

async function openBranchModal(name) {
  branchModalStore.processName = name
  branchModalStore.branches = []
  branchModalStore.currentBranch = null
  branchModalStore.error = null
  branchModalStore.loading = true
  branchModalStore.show = true
  
  const res = await api(`/api/processes/${name}/git/branches`)
  branchModalStore.loading = false
  if (res.error) {
    branchModalStore.error = res.error
    return
  }
  branchModalStore.branches = res.branches || []
  branchModalStore.currentBranch = res.current
}

function closeBranchModal() {
  branchModalStore.show = false
  branchModalStore.processName = null
}

async function handleCheckoutBranch(branch) {
  if (!branchModalStore.processName) return
  const name = branchModalStore.processName
  branchModalStore.loading = true
  const res = await api(`/api/processes/${name}/git/checkout`, 'POST', { branch })
  branchModalStore.loading = false
  if (res.error) {
    showAlert('Branch Error', res.error)
    return
  }
  closeBranchModal()
  await processStore.refresh(true)
}

// ── Logs ────────────────────────────────────
const logPanelRef = ref(null)
const logPopoverRef = ref(null)

function handleSelectLog(name) {
  popoverStore.hideLogPopover()
  logStore.selectLog(name)
}

function handleCloseLog() {
  logStore.closeLog()
}

async function handleSendStdin(text) {
  if (!logStore.selectedProcess.value) return
  await api(
    `/api/processes/${encodeURIComponent(logStore.selectedProcess.value)}/stdin`,
    'POST',
    { input: text }
  )
}

// ── Settings ────────────────────────────────
async function handleSaveSettings() {
  const sysUpdate = await settingsStore.saveSettings()
  if (sysUpdate) {
    await applyPollIntervals(sysUpdate)
    await processStore.refresh(true)
  }
}

async function handleImport(file) {
  const result = await settingsStore.handleImport(file)
  if (result) {
    await processStore.refresh(true)
  }
}

// ── Polling ─────────────────────────────────
async function applyPollIntervals(sys) {
  if (!sys) sys = await api('/api/system')
  popoverStore.setPopoverPollInterval(sys.popoverPollInterval || 1500)
  processStore.stopPolling()
  logStore.stopLogPolling()
  processStore.startPolling(sys.statusPollInterval || 3000)
  logStore.startLogPolling(sys.logPollInterval || 500)
}

// ── Popover ref wiring ──────────────────────
watch(logPopoverRef, (comp) => {
  if (comp?.popoverRef) {
    popoverStore.setPopoverEl(comp.popoverRef)
  }
}, { immediate: true })

// ── Log panel body ref wiring ───────────────
watch(logPanelRef, (comp) => {
  nextTick(() => {
    if (comp?.logBodyRef) {
      logStore.setLogBodyEl(comp.logBodyRef)
    }
  })
}, { immediate: true })

// Also watch when selectedProcess changes to re-wire the log body scroll
watch(() => logStore.selectedProcess.value, () => {
  nextTick(() => {
    if (logPanelRef.value?.logBodyRef) {
      logStore.setLogBodyEl(logPanelRef.value.logBodyRef)
    }
  })
})

// ── Window resize handler ───────────────────
function onResize() {
  popoverStore.onWindowResize()
}

// ── Lifecycle ───────────────────────────────
onMounted(async () => {
  await processStore.refresh()
  await applyPollIntervals()
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  processStore.stopPolling()
  logStore.stopLogPolling()
})
</script>
