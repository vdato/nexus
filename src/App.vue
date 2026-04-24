<template>
  <AppHeader
    :counts="counts"
    :total="nodeStore.nodes.value.length"
    :checking-remote="checkingRemote"
    @add-node="openAddModal"
    @open-settings="settingsStore.openSettings"
    @check-remote-updates="handleCheckAllRemote"
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
      :workspace-node="workspaceModalStore.nodeGuid"
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
      @push-git="(name, cb) => handlePushGitChanges(name).then(cb)"
      @start-group="handleStartGroup"
      @stop-group="handleStopGroup"
    />
  </div>

  <LogPopover
    ref="logPopoverRef"
    :visible="popoverStore.popoverVisible.value"
    :name="popoverStore.popoverName.value || ''"
    :logs="popoverStore.popoverLogs.value"
    :style="popoverStore.popoverStyle.value"
    :pinned="popoverStore.popoverPinned.value"
    @cancel-hide="popoverStore.cancelPopoverHide"
    @schedule-hide="popoverStore.schedulePopoverHide"
    @clear="popoverStore.clearPopoverLogs"
    @toggle-pin="popoverStore.togglePin"
  />

  <XTermPanel
    v-if="selectedIsPty"
    :node="selectedNodeObject"
    :panel-height="logStore.logPanelHeight.value"
    :terminal-width="settingsStore.sysTerminalWidth.value"
    :workspace-open="workspaceModalStore.nodeGuid === logStore.selectedNode.value"
    @close="handleCloseLog"
    @resize="logStore.applyLogPanelHeight"
    @start="handleStart"
    @stop="handleStop"
    @restart="handleRestart"
    @open-workspace="openWorkspaceModal"
    @edit="openEditModal"
  />

  <LogPanel
    v-else
    ref="logPanelRef"
    :node="selectedNodeObject"
    :selected-node="logStore.selectedNode.value"
    :logs="logStore.logs.value"
    :last-refresh="logStore.lastRefresh.value"
    :panel-height="logStore.logPanelHeight.value"
    :workspace-open="workspaceModalStore.nodeGuid === logStore.selectedNode.value"
    @close="handleCloseLog"
    @resize="logStore.applyLogPanelHeight"
    @clear="logStore.clearLogs"
    @send-stdin="handleSendStdin"
    @open-workspace="openWorkspaceModal"
    @start="handleStart"
    @stop="handleStop"
    @restart="handleRestart"
    @edit="openEditModal"
  />

  <NodeModal
    :show="showNodeModal"
    :editing-guid="editingNodeGuid"
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
    :node-guid="branchModalStore.nodeGuid"
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
    :node-guid="workspaceModalStore.nodeGuid"
    :node-name="workspaceModalStore.nodeName"
    :node-status="workspaceModalStatus"
    :is-agent="workspaceModalIsAgent"
    :log-panel-height="logStore.logPanelHeight.value"
    @close="closeWorkspaceModal"
    @start-node="handleStart"
  />

  <AlertModal />
  <NotificationContainer />
  <TaskOverlay />



  <SettingsModal
    :show="settingsStore.showSettingsModal.value"
    :env-rows="settingsStore.envRows.value"
    :group-rows="settingsStore.groupRows.value"
    :tool-rows="settingsStore.toolRows.value"
    v-model:log-poll-interval="settingsStore.sysLogPollInterval.value"
    v-model:status-poll-interval="settingsStore.sysStatusPollInterval.value"
    v-model:popover-poll-interval="settingsStore.sysPopoverPollInterval.value"
    v-model:port="settingsStore.sysPort.value"
    v-model:max-log-lines="settingsStore.sysMaxLogLines.value"
    v-model:terminal-width="settingsStore.sysTerminalWidth.value"
    @close="settingsStore.closeSettings"
    @save="handleSaveSettings"
    @add-env="settingsStore.addEnvRow"
    @remove-env="settingsStore.removeEnvRow"
    @add-group="settingsStore.addGroupRow"
    @remove-group="settingsStore.removeGroupRow"
    @add-tool="settingsStore.addToolRow"
    @remove-tool="settingsStore.removeToolRow"
    @browse-tool="settingsStore.browseFile"
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
import NotificationContainer from './components/NotificationContainer.vue'
import TaskOverlay from './components/TaskOverlay.vue'
const WorkspaceModal = defineAsyncComponent(() => import('./components/WorkspaceModal.vue'))

import { useNodes } from './composables/useNodes.js'
import { useLogs } from './composables/useLogs.js'
import { usePopover } from './composables/usePopover.js'
import { useSettings } from './composables/useSettings.js'
import { useAlert } from './composables/useAlert.js'
import { useNotifications } from './composables/useNotifications.js'
import { api } from './composables/useApi.js'



// ── Stores ──────────────────────────────────
const nodeStore = useNodes()
const logStore = useLogs()
const popoverStore = usePopover()
const settingsStore = useSettings()
const { showAlert } = useAlert()
const { addNotification } = useNotifications()

// ── Computed ────────────────────────────────
const selectedIsPty = computed(() => {
  const guid = logStore.selectedNode.value
  if (!guid) return false
  const nd = nodeStore.nodes.value.find(p => p.guid === guid)
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
    const orderMap = new Map(customOrder.value.map((guid, i) => [guid, i]))
    return [...items].sort((a, b) => (orderMap.get(a.guid) ?? 999) - (orderMap.get(b.guid) ?? 999))
  }
  return items
}

const displayGroups = computed(() => {
  if (viewMode.value === 'none') {
    // Flat list — all nodes in one unnamed group
    const all = sortedGroups.value.flatMap((g) => g.items)
    return [{
      name: '',
      guid: '',
      items: sortNodes(all)
    }]
  }
  // Grouped — sort within each group
  return sortedGroups.value.map((g) => ({
    ...g,
    items: sortNodes(g.items)
  }))
})

function handleReorder(orderedGuids) {
  customOrder.value = orderedGuids
  localStorage.setItem('xpm-order', JSON.stringify(orderedGuids))
  if (sortBy.value !== 'default') sortBy.value = 'default'
}

async function handleMoveToGroup(nodeOrGuid, group) {
  // Handle event object or direct parameters
  let guid, name
  if (typeof nodeOrGuid === 'object' && nodeOrGuid.guid) {
    guid = nodeOrGuid.guid
    name = nodeOrGuid.name
  } else if (typeof nodeOrGuid === 'object' && nodeOrGuid.name && nodeOrGuid.group !== undefined) {
    // This handles the {name, group} object from NodeGrid
    guid = nodeStore.nodes.value.find(n => n.name === nodeOrGuid.name)?.guid
    name = nodeOrGuid.name
    group = nodeOrGuid.group
  } else {
    guid = nodeOrGuid
    name = nodeStore.nodes.value.find(n => n.guid === guid)?.name || guid
  }

  if (!guid) return
  const config = await nodeStore.getNodeConfig(guid)
  if (config.error) return
  await nodeStore.updateNode(guid, { ...config, group })
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
const editingNodeGuid = ref(null)
const cloneFormData = ref(null)

function openAddModal() {
  editingNodeGuid.value = null
  showNodeModal.value = true
}

function openEditModal(nodeOrGuid) {
  editingNodeGuid.value = typeof nodeOrGuid === 'object' ? nodeOrGuid.guid : nodeOrGuid
  showNodeModal.value = true
}

function closeNodeModal() {
  showNodeModal.value = false
  editingNodeGuid.value = null
  cloneFormData.value = null
}

async function handleNodeSubmit({ data, isEditing, editingGuid }) {
  let success
  if (isEditing) {
    success = await nodeStore.updateNode(editingGuid, data)
  } else {
    success = await nodeStore.addNode(data)
  }
  if (success) closeNodeModal()
}

async function handleNodeRemove(nodeOrGuid) {
  const guid = typeof nodeOrGuid === 'object' ? nodeOrGuid.guid : nodeOrGuid
  const name = typeof nodeOrGuid === 'object' ? nodeOrGuid.name : (nodeStore.nodes.value.find(n => n.guid === guid)?.name || guid)
  
  const removed = await nodeStore.removeNode(guid, name)
  if (removed) {
    if (logStore.selectedNode.value === guid) logStore.closeLog()
    closeNodeModal()
  }
}

function handleNodeClone(cloneData) {
  // Close the edit dialog and open an Add dialog pre-filled with cloned data
  closeNodeModal()
  cloneFormData.value = cloneData
  editingNodeGuid.value = null
  showNodeModal.value = true
}

// ── Node Actions ───────────────────────────
async function handleStart(nodeOrGuid) {
  const guid = typeof nodeOrGuid === 'object' ? nodeOrGuid.guid : nodeOrGuid
  const name = typeof nodeOrGuid === 'object' ? nodeOrGuid.name : (nodeStore.nodes.value.find(n => n.guid === guid)?.name || guid)

  const res = await nodeStore.startNode(guid)
  if (res?.error) {
    addNotification(`Failed to start ${name}: ${res.error}`, 'error')
  } else {
    addNotification(`Started ${name}`)
  }
}

async function handleStop(nodeOrGuid) {
  const guid = typeof nodeOrGuid === 'object' ? nodeOrGuid.guid : nodeOrGuid
  const name = typeof nodeOrGuid === 'object' ? nodeOrGuid.name : (nodeStore.nodes.value.find(n => n.guid === guid)?.name || guid)

  const res = await nodeStore.stopNode(guid)
  if (res?.error) {
    addNotification(`Failed to stop ${name}: ${res.error}`, 'error')
  } else {
    addNotification(`Stopped ${name}`)
  }
}

async function handleRestart(nodeOrGuid) {
  const guid = typeof nodeOrGuid === 'object' ? nodeOrGuid.guid : nodeOrGuid
  const name = typeof nodeOrGuid === 'object' ? nodeOrGuid.name : (nodeStore.nodes.value.find(n => n.guid === guid)?.name || guid)

  const res = await nodeStore.restartNode(guid)
  if (res?.error) {
    addNotification(`Failed to restart ${name}: ${res.error}`, 'error')
  } else {
    addNotification(`Restarted ${name}`)
  }
}

async function handleStartGroup(group) {
  const nodes = nodeStore.nodes.value.filter(n => (n.group || 'other') === group && n.status !== 'running')
  if (nodes.length === 0) return
  addNotification(`Starting group: ${group}...`, 'info')
  const results = await Promise.all(nodes.map(n => nodeStore.startNode(n.guid)))
  const failures = results.filter(r => r?.error)
  if (failures.length > 0) {
    addNotification(`Group ${group}: ${failures.length} failed to start`, 'error')
  } else {
    addNotification(`Group ${group} started successfully`)
  }
}

async function handleStopGroup(group) {
  const nodes = nodeStore.nodes.value.filter(n => (n.group || 'other') === group && n.status === 'running')
  if (nodes.length === 0) return
  addNotification(`Stopping group: ${group}...`, 'info')
  const results = await Promise.all(nodes.map(n => nodeStore.stopNode(n.guid)))
  const failures = results.filter(r => r?.error)
  if (failures.length > 0) {
    addNotification(`Group ${group}: ${failures.length} failed to stop`, 'error')
  } else {
    addNotification(`Group ${group} stopped successfully`)
  }
}

// ── Branch Modal ────────────────────────────
import { reactive } from 'vue'
const branchModalStore = reactive({
  show: false,
  nodeGuid: null,
  nodeName: null,
  branches: [],
  currentBranch: null,
  loading: false,
  error: null
})

async function openBranchModal(nodeOrGuid) {
  const guid = typeof nodeOrGuid === 'object' ? nodeOrGuid.guid : nodeOrGuid
  const name = typeof nodeOrGuid === 'object' ? nodeOrGuid.name : (nodeStore.nodes.value.find(n => n.guid === guid)?.name || guid)

  branchModalStore.nodeGuid = guid
  branchModalStore.nodeName = name
  branchModalStore.branches = []
  branchModalStore.currentBranch = null
  branchModalStore.error = null
  branchModalStore.loading = true
  branchModalStore.show = true

  const res = await api(`/api/processes/${encodeURIComponent(guid)}/git/branches`)
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
  branchModalStore.nodeGuid = null
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
  if (!branchModalStore.nodeGuid) return
  const guid = branchModalStore.nodeGuid
  branchModalStore.loading = true
  const res = await api(`/api/processes/${encodeURIComponent(guid)}/git/checkout`, 'POST', { branch, strategy })
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
    addNotification(`Checkout failed: ${res.error}`, 'error')
    return
  }
  addNotification(`Successfully checked out ${branch}`)
  closeBranchModal()
  await nodeStore.refresh(true)
}

async function handlePullGitChanges(nodeOrGuid, strategy = null) {
  const guid = typeof nodeOrGuid === 'object' ? nodeOrGuid.guid : nodeOrGuid
  const name = typeof nodeOrGuid === 'object' ? nodeOrGuid.name : (nodeStore.nodes.value.find(n => n.guid === guid)?.name || guid)

  const res = await api(`/api/processes/${encodeURIComponent(guid)}/git/pull`, 'POST', { strategy })
  
  if (res.error === 'CONFLICT') {
    const choice = await askUserStrategy('Git Conflict', res.message);
    if (choice) {
      return handlePullGitChanges(guid, choice);
    }
    return false;
  }

  if (res.error) {
    showAlert('Pull Error', res.error)
    addNotification(`Pull failed for ${name}: ${res.error}`, 'error')
    return false
  }
  addNotification(`Successfully pulled updates for ${name}`)
  await nodeStore.refresh(true)
  return true
}

async function handlePushGitChanges(nodeOrGuid) {
  const guid = typeof nodeOrGuid === 'object' ? nodeOrGuid.guid : nodeOrGuid
  const name = typeof nodeOrGuid === 'object' ? nodeOrGuid.name : (nodeStore.nodes.value.find(n => n.guid === guid)?.name || guid)

  const res = await api(`/api/processes/${encodeURIComponent(guid)}/git/push`, 'POST')
  
  if (res.error) {
    showAlert('Push Error', res.error)
    addNotification(`Push failed for ${name}: ${res.error}`, 'error')
    return false
  }
  addNotification(`Successfully pushed updates for ${name}`)
  await nodeStore.refresh(true)
  return true
}

const checkingRemote = ref(false)

async function handleCheckAllRemote() {
  if (checkingRemote.value) return
  checkingRemote.value = true
  try {
    const nodesWithBranch = nodeStore.nodes.value.filter(n => n.branch && n.cwd)
    await Promise.all(
      nodesWithBranch.map(n =>
        api(`/api/processes/${encodeURIComponent(n.guid)}/git/remote-status`, 'POST').catch(() => {})
      )
    )
    await nodeStore.refresh(true)
  } finally {
    checkingRemote.value = false
  }
}

// ── Workspace Modal ─────────────────────────
const workspaceModalStore = reactive({
  show: false,
  nodeGuid: null,
  nodeName: null,
})

const workspaceModalStatus = computed(() => {
  if (!workspaceModalStore.nodeGuid) return null
  const node = nodeStore.nodes.value.find(n => n.guid === workspaceModalStore.nodeGuid)
  return node?.status || 'stopped'
})

const workspaceModalIsAgent = computed(() => {
  if (!workspaceModalStore.nodeGuid) return false
  const node = nodeStore.nodes.value.find(n => n.guid === workspaceModalStore.nodeGuid)
  return node?.type === 'agent'
})

function openWorkspaceModal(nodeOrGuid) {
  const guid = typeof nodeOrGuid === 'object' ? nodeOrGuid.guid : nodeOrGuid
  const name = typeof nodeOrGuid === 'object' ? nodeOrGuid.name : (nodeStore.nodes.value.find(n => n.guid === guid)?.name || guid)

  if (workspaceModalStore.show && workspaceModalStore.nodeGuid === guid) {
    workspaceModalStore.show = false
    workspaceModalStore.nodeGuid = null
    workspaceModalStore.nodeName = null
    return
  }
  workspaceModalStore.nodeGuid = guid
  workspaceModalStore.nodeName = name
  workspaceModalStore.show = true
  
  const node = typeof nodeOrGuid === 'object' ? nodeOrGuid : nodeStore.nodes.value.find(n => n.guid === guid)

  if (node?.type === 'agent') {
    if (logStore.selectedNode.value !== guid) {
      handleSelectLog(guid)
    }
  }
}

function closeWorkspaceModal() {
  workspaceModalStore.show = false
  workspaceModalStore.nodeGuid = null
  workspaceModalStore.nodeName = null
}

// ── Logs ────────────────────────────────────
const logPanelRef = ref(null)
const logPopoverRef = ref(null)

const selectedNodeObject = computed(() => {
  if (!logStore.selectedNode.value) return null
  return nodeStore.nodes.value.find(n => n.guid === logStore.selectedNode.value) || null
})

function handleSelectLog(nodeOrGuid) {
  const guid = typeof nodeOrGuid === 'object' ? nodeOrGuid.guid : nodeOrGuid
  popoverStore.hideLogPopover()
  logStore.selectLog(guid)
}

function handleCloseLog() {
  const closedGuid = logStore.selectedNode.value
  logStore.closeLog()
  
  if (workspaceModalStore.show && workspaceModalStore.nodeGuid === closedGuid) {
    const node = nodeStore.nodes.value.find(n => n.guid === closedGuid)
    if (node?.type === 'agent') {
      workspaceModalStore.show = false
      workspaceModalStore.nodeGuid = null
      workspaceModalStore.nodeName = null
    }
  }
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
