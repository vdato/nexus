<template>
  <AppHeader
    :counts="counts"
    :total="nodeStore.nodes.value.length"
    @add-node="openAddModal"
    @start-all="nodeStore.startAll"
    @stop-all="nodeStore.stopAll"
    @open-settings="settingsStore.openSettings"
  />

  <div class="floating-toolbar" :style="{ bottom: logStore.selectedNode.value ? (logStore.logPanelHeight.value + 16) + 'px' : '' }">
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
    :style="{ paddingBottom: logStore.selectedNode.value ? (logStore.logPanelHeight.value + 20) + 'px' : '' }"
  >
    <NodeGrid
      :sorted-groups="displayGroups"
      :color-map="colorMap"
      :view-mode="viewMode"
      :selected-node="logStore.selectedNode.value"
      @select="handleSelectLog"
      @start="handleStart"
      @stop="handleStop"
      @restart="handleRestart"
      @edit="openEditModal"
      @hover-enter="popoverStore.onCardHoverEnter"
      @hover-leave="popoverStore.onCardHoverLeave"
      @hover-cancel="popoverStore.onCardHoverCancel"
      @reorder="handleReorder"
      @reorder-groups="handleReorderGroups"
      @move-to-group="handleMoveToGroup"
      @branch-click="openBranchModal"
      @open-workspace="openWorkspaceModal"
      @pull-git="(name, cb) => handlePullGitChanges(name).then(cb)"
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
    :node-name="logStore.selectedNode.value"
    :panel-height="logStore.logPanelHeight.value"
    @close="handleCloseLog"
    @resize="logStore.applyLogPanelHeight"
  />

  <LogPanel
    v-else
    ref="logPanelRef"
    :selected-node="logStore.selectedNode.value"
    :logs="logStore.logs.value"
    :last-refresh="logStore.lastRefresh.value"
    :panel-height="logStore.logPanelHeight.value"
    @close="handleCloseLog"
    @resize="logStore.applyLogPanelHeight"
    @clear="logStore.clearLogs"
    @send-stdin="handleSendStdin"
  />

  <NodeModal
    :show="showNodeModal"
    :editing-name="editingNodeName"
    :group-names="groupNames"
    :color-map="colorMap"
    :nodes="nodeStore.nodes.value"
    :clone-data="cloneFormData"
    @close="closeNodeModal"
    @submit="handleNodeSubmit"
    @remove="handleNodeRemove"
    @clone="handleNodeClone"
  />

  <BranchModal
    :show="branchModalStore.show"
    :node-name="branchModalStore.nodeName"
    :branches="branchModalStore.branches"
    :current-branch="branchModalStore.currentBranch"
    :loading="branchModalStore.loading"
    :error="branchModalStore.error"
    @close="closeBranchModal"
    @checkout="handleCheckoutBranch"
  />

  <WorkspaceModal
    :show="workspaceModalStore.show"
    :node-name="workspaceModalStore.nodeName"
    :node-status="workspaceModalStatus"
    @close="closeWorkspaceModal"
    @start-node="handleStart"
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
import { ref, computed, onMounted, onUnmounted, watch, nextTick, defineAsyncComponent } from 'vue'

import AppHeader from './components/AppHeader.vue'
import NodeGrid from './components/NodeGrid.vue'
import XTermPanel from './components/XTermPanel.vue'
import LogPanel from './components/LogPanel.vue'
import LogPopover from './components/LogPopover.vue'
import NodeModal from './components/NodeModal.vue'
import SettingsModal from './components/SettingsModal.vue'
import BranchModal from './components/BranchModal.vue'
import AlertModal from './components/AlertModal.vue'
const WorkspaceModal = defineAsyncComponent(() => import('./components/WorkspaceModal.vue'))

import { useNodes } from './composables/useNodes.js'
import { useLogs } from './composables/useLogs.js'
import { usePopover } from './composables/usePopover.js'
import { useSettings } from './composables/useSettings.js'
import { useAlert } from './composables/useAlert.js'
import { api } from './composables/useApi.js'



// ── Stores ──────────────────────────────────
const nodeStore = useNodes()
const logStore = useLogs()
const popoverStore = usePopover()
const settingsStore = useSettings()
const { showAlert } = useAlert()

// ── Computed ────────────────────────────────
const selectedIsPty = computed(() => {
  const name = logStore.selectedNode.value
  if (!name) return false
  const nd = nodeStore.nodes.value.find(p => p.name === name)
  return nd?.usePty || false
})

const counts = computed(() => nodeStore.getCounts(nodeStore.nodes.value))

const sortedGroupsData = computed(() =>
  nodeStore.buildSortedGroups(nodeStore.nodes.value, nodeStore.groups.value)
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

function sortNodes(items) {
  if (sortBy.value === 'name') {
    return [...items].sort((a, b) => a.name.localeCompare(b.name))
  }
  if (sortBy.value === 'status') {
    return [...items].sort((a, b) => (STATUS_PRIORITY[a.status] ?? 9) - (STATUS_PRIORITY[b.status] ?? 9) || a.name.localeCompare(b.name))
  }
  // default — use custom order if available
  if (customOrder.value.length) {
    const orderMap = new Map(customOrder.value.map((n, i) => [n, i]))
    return [...items].sort((a, b) => (orderMap.get(a.name) ?? 999) - (orderMap.get(b.name) ?? 999))
  }
  return items
}

const displayGroups = computed(() => {
  if (viewMode.value === 'none') {
    // Flat list — all nodes in one unnamed group
    const all = sortedGroups.value.flatMap(([, items]) => items)
    return [['', sortNodes(all)]]
  }
  // Grouped — sort within each group
  return sortedGroups.value.map(([group, items]) => [group, sortNodes(items)])
})

function handleReorder(orderedNames) {
  customOrder.value = orderedNames
  localStorage.setItem('xpm-order', JSON.stringify(orderedNames))
  if (sortBy.value !== 'default') sortBy.value = 'default'
}

async function handleMoveToGroup({ name, group }) {
  const config = await nodeStore.getNodeConfig(name)
  if (config.error) return
  await nodeStore.updateNode(name, { ...config, group })
}

async function handleReorderGroups(groupNames) {
  // Rebuild groups list with existing colors in the new order
  const currentGroups = nodeStore.groups.value
  const reordered = groupNames.map((name) => {
    const existing = currentGroups.find((g) => (typeof g === 'string' ? g : g.name) === name)
    if (existing && typeof existing === 'object') return existing
    return { name, color: '#888888' }
  })
  await api('/api/groups', 'PUT', reordered)
  await nodeStore.refresh(true)
}

const groupNames = computed(() => {
  const names = nodeStore.groupDefsToNames(nodeStore.groups.value)
  return names.length ? names : ['other']
})

// ── Node Modal ─────────────────────────────
const showNodeModal = ref(false)
const editingNodeName = ref(null)
const cloneFormData = ref(null)

function openAddModal() {
  editingNodeName.value = null
  showNodeModal.value = true
}

function openEditModal(name) {
  editingNodeName.value = name
  showNodeModal.value = true
}

function closeNodeModal() {
  showNodeModal.value = false
  editingNodeName.value = null
  cloneFormData.value = null
}

async function handleNodeSubmit({ data, isEditing, editingName }) {
  let success
  if (isEditing) {
    success = await nodeStore.updateNode(editingName, data)
    if (success && data.name !== editingName && logStore.selectedNode.value === editingName) {
      logStore.selectedNode.value = data.name
    }
  } else {
    success = await nodeStore.addNode(data)
  }
  if (success) closeNodeModal()
}

async function handleNodeRemove(name) {
  const removed = await nodeStore.removeNode(name)
  if (removed) {
    if (logStore.selectedNode.value === name) logStore.closeLog()
    closeNodeModal()
  }
}

function handleNodeClone(cloneData) {
  // Close the edit dialog and open an Add dialog pre-filled with cloned data
  closeNodeModal()
  cloneFormData.value = cloneData
  editingNodeName.value = null
  showNodeModal.value = true
}

// ── Node Actions ───────────────────────────
async function handleStart(name) {
  await nodeStore.startNode(name)
}

async function handleStop(name) {
  await nodeStore.stopNode(name)
}

async function handleRestart(name) {
  await nodeStore.restartNode(name)
}

// ── Branch Modal ────────────────────────────
import { reactive } from 'vue'
const branchModalStore = reactive({
  show: false,
  nodeName: null,
  branches: [],
  currentBranch: null,
  loading: false,
  error: null
})

async function openBranchModal(name) {
  branchModalStore.nodeName = name
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
  branchModalStore.nodeName = null
}

async function askUserStrategy(title, message) {
  return new Promise((resolve) => {
    const res = confirm(`${message}\n\nWould you like to Stash your changes or Discard them?\n\nOK = Stash, Cancel = Discard\n(Close/Esc to abort)`);
    // This is a bit crude but works for a quick CLI-like experience without building a full custom modal.
    // For a better UX, I should probably add a custom GitConflictModal.
    if (res === true) resolve('stash');
    else resolve('discard');
  });
}

async function handleCheckoutBranch(branch, strategy = null) {
  if (!branchModalStore.nodeName) return
  const name = branchModalStore.nodeName
  branchModalStore.loading = true
  const res = await api(`/api/processes/${name}/git/checkout`, 'POST', { branch, strategy })
  branchModalStore.loading = false
  
  if (res.error === 'CONFLICT') {
    const choice = await askUserStrategy('Git Conflict', res.message);
    if (choice) {
      return handleCheckoutBranch(branch, choice);
    }
    return;
  }

  if (res.error) {
    showAlert('Branch Error', res.error)
    return
  }
  closeBranchModal()
  await nodeStore.refresh(true)
}

async function handlePullGitChanges(name, strategy = null) {
  const res = await api(`/api/processes/${name}/git/pull`, 'POST', { strategy })
  
  if (res.error === 'CONFLICT') {
    const choice = await askUserStrategy('Git Conflict', res.message);
    if (choice) {
      return handlePullGitChanges(name, choice);
    }
    return false;
  }

  if (res.error) {
    showAlert('Pull Error', res.error)
    return false
  }
  await nodeStore.refresh(true)
  return true
}

// ── Workspace Modal ─────────────────────────
const workspaceModalStore = reactive({
  show: false,
  nodeName: null,
})

const workspaceModalStatus = computed(() => {
  if (!workspaceModalStore.nodeName) return null
  const node = nodeStore.nodes.value.find(n => n.name === workspaceModalStore.nodeName)
  return node?.status || 'stopped'
})

function openWorkspaceModal(node) {
  workspaceModalStore.nodeName = node.name
  workspaceModalStore.show = true
}

function closeWorkspaceModal() {
  workspaceModalStore.show = false
  workspaceModalStore.nodeName = null
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
  if (!logStore.selectedNode.value) return
  await api(
    `/api/processes/${encodeURIComponent(logStore.selectedNode.value)}/stdin`,
    'POST',
    { input: text }
  )
}

// ── Settings ────────────────────────────────
async function handleSaveSettings() {
  const sysUpdate = await settingsStore.saveSettings()
  if (sysUpdate) {
    await applyPollIntervals(sysUpdate)
    await nodeStore.refresh(true)
  }
}

async function handleImport(file) {
  const result = await settingsStore.handleImport(file)
  if (result) {
    await nodeStore.refresh(true)
  }
}

// ── Polling ─────────────────────────────────
async function applyPollIntervals(sys) {
  if (!sys) sys = await api('/api/system')
  popoverStore.setPopoverPollInterval(sys.popoverPollInterval || 1500)
  nodeStore.stopPolling()
  logStore.stopLogPolling()
  nodeStore.startPolling(sys.statusPollInterval || 3000)
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

// Also watch when selectedNode changes to re-wire the log body scroll
watch(() => logStore.selectedNode.value, () => {
  nextTick(() => {
    if (logPanelRef.value?.logBodyRef) {
      logStore.setLogBodyEl(logPanelRef.value.logBodyRef)
    }
  })
})

// ── Window and Global Drag/Drop handlers ───────────────────
function onResize() {
  popoverStore.onWindowResize()
}

function onGlobalDragOver(ev) {
  ev.preventDefault()
  ev.stopPropagation()
}

function onGlobalDrop(ev) {
  ev.preventDefault()
  ev.stopPropagation()
}

// ── Lifecycle ───────────────────────────────
onMounted(async () => {
  await nodeStore.refresh()
  await applyPollIntervals()
  window.addEventListener('resize', onResize)
  document.addEventListener('dragover', onGlobalDragOver, true)
  document.addEventListener('drop', onGlobalDrop, true)
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  document.removeEventListener('dragover', onGlobalDragOver, true)
  document.removeEventListener('drop', onGlobalDrop, true)
  nodeStore.stopPolling()
  logStore.stopLogPolling()
})
</script>
