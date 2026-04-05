<template>
  <AppHeader
    :counts="counts"
    :total="processStore.processes.value.length"
    @add-process="openAddModal"
    @start-all="processStore.startAll"
    @stop-all="processStore.stopAll"
    @open-settings="settingsStore.openSettings"
  />

  <div
    class="container"
    :style="{ paddingBottom: logStore.selectedProcess.value ? (logStore.logPanelHeight.value + 20) + 'px' : '' }"
  >
    <ProcessGrid
      :sorted-groups="sortedGroups"
      :color-map="colorMap"
      :selected-process="logStore.selectedProcess.value"
      @select="handleSelectLog"
      @start="handleStart"
      @stop="handleStop"
      @restart="handleRestart"
      @edit="openEditModal"
      @hover-enter="popoverStore.onCardHoverEnter"
      @hover-leave="popoverStore.onCardHoverLeave"
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
  />

  <LogPanel
    ref="logPanelRef"
    :selected-process="logStore.selectedProcess.value"
    :logs="logStore.logs.value"
    :last-refresh="logStore.lastRefresh.value"
    :panel-height="logStore.logPanelHeight.value"
    @close="handleCloseLog"
    @resize="logStore.applyLogPanelHeight"
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
    @import="handleImport"
  />
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'

import AppHeader from './components/AppHeader.vue'
import ProcessGrid from './components/ProcessGrid.vue'
import LogPanel from './components/LogPanel.vue'
import LogPopover from './components/LogPopover.vue'
import ProcessModal from './components/ProcessModal.vue'
import SettingsModal from './components/SettingsModal.vue'

import { useProcesses } from './composables/useProcesses.js'
import { useLogs } from './composables/useLogs.js'
import { usePopover } from './composables/usePopover.js'
import { useSettings } from './composables/useSettings.js'
import { api } from './composables/useApi.js'

// ── Stores ──────────────────────────────────
const processStore = useProcesses()
const logStore = useLogs()
const popoverStore = usePopover()
const settingsStore = useSettings()

// ── Computed ────────────────────────────────
const counts = computed(() => processStore.getCounts(processStore.processes.value))

const sortedGroupsData = computed(() =>
  processStore.buildSortedGroups(processStore.processes.value, processStore.groups.value)
)

const sortedGroups = computed(() => sortedGroupsData.value.sorted)
const colorMap = computed(() => sortedGroupsData.value.colorMap)

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
  logStore.selectLog(name)
}

async function handleStop(name) {
  await processStore.stopProcess(name)
}

async function handleRestart(name) {
  await processStore.restartProcess(name)
  logStore.selectLog(name)
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
