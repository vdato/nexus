<template>
  <div>
    <div 
      v-for="(g, gi) in sortedGroups" :key="g.guid || g.name"
      class="group-section"
      :class="{ 
        'group-hovered': hoveredGroup === g.name && g.name,
        'group-selected': selectedNode && g.items.some(p => p.guid === selectedNode)
      }"
      :style="{ '--group-color': colorMap[g.name || 'other'] || '#4b5563' }"
      @mouseenter="hoveredGroup = g.name"
      @mouseleave="hoveredGroup = null"
    >
      <div
        v-if="g.name"
        class="group-title"
        :class="{
          'group-drag-over': groupDragOverIndex === gi && groupDragOverIndex !== groupDragIndex,
          'group-card-drag-over': cardDragOverGroup === g.name && dragGuid,
          'collapsed': collapsedGroups[g.guid || g.name]
        }"
        @click="toggleGroup(g.guid || g.name)"
        @dragover.prevent="onGroupHeaderDragOver(gi, $event)"
        @dragleave="onGroupHeaderDragLeave(gi)"
        @drop.prevent="onGroupHeaderDrop(gi, g.name)"
      >
        <span
          class="group-title-drag-handle"
          draggable="true"
          @dragstart.stop="onGroupDragStart(gi, g.name, $event)"
          @dragend="onGroupDragEnd"
          @click.stop
          title="Drag to reorder group"
        ><i class="fa-solid fa-grip-vertical"></i></span>
        <i class="fa-solid fa-chevron-down group-collapse-icon"></i>
        {{ g.name }}
        
        <StatSummary 
          :counts="getCounts(g.items)" 
          :total="g.items.length" 
          size="small"
          class="group-summary"
        />

        <div class="group-title-actions" @click.stop>
          <button class="btn-start btn-icon" style="padding: 2px 6px; font-size: 11px" @click="$emit('start-group', g.name)" title="Start all in group"><i class="fa-solid fa-forward-fast"></i></button>
          <button class="btn-stop btn-icon" style="padding: 2px 6px; font-size: 11px" @click="$emit('stop-group', g.name)" title="Stop all in group"><i class="fa-solid fa-power-off"></i></button>
        </div>
      </div>
      <div v-show="!collapsedGroups[g.guid || g.name] || !g.name" class="node-grid">
        <NodeCard
          v-for="p in g.items"
          :key="p.guid"
          :node="p"
          :border-color="colorMap[p.group || 'other'] || '#4b5563'"
          :is-selected="selectedNode === p.guid"
          :terminal-open="selectedNode === p.guid"
          :workspace-open="workspaceNode === p.guid"
          draggable="true"
          @dragstart="onDragStart(p.guid, $event)"
          @dragover.prevent="onDragOver(p.guid, $event)"
          @dragend="onDragEnd"
          @drop.prevent="onDrop(p.guid)"
          :class="{ 
            'drag-over': dragOverGuid === p.guid && dragOverGuid !== dragGuid,
            'card-agent': p.type === 'agent'
          }"
          @select="$emit('select', $event)"
          @start="$emit('start', $event)"
          @stop="$emit('stop', $event)"
          @restart="$emit('restart', $event)"
          @edit="$emit('edit', $event)"
          @hover-enter="(...args) => $emit('hover-enter', ...args)"
          @hover-leave="(...args) => $emit('hover-leave', ...args)"
          @hover-cancel="(...args) => $emit('hover-cancel', ...args)"
          @branch-click="$emit('branch-click', $event)"
          @open-workspace="$emit('open-workspace', $event)"
          @pull-git="(...args) => $emit('pull-git', ...args)"
          @push-git="(...args) => $emit('push-git', ...args)"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import NodeCard from './NodeCard.vue'
import StatSummary from './StatSummary.vue'
import { useNodes } from '../composables/useNodes.js'

const { getCounts } = useNodes()

const props = defineProps({
  sortedGroups: { type: Array, required: true },
  colorMap: { type: Object, required: true },
  selectedNode: { type: String, default: null },
  workspaceNode: { type: String, default: null },
  viewMode: { type: String, default: 'group' },
})

const emit = defineEmits(['select', 'start', 'stop', 'restart', 'edit', 'hover-enter', 'hover-leave', 'hover-cancel', 'reorder', 'reorder-groups', 'move-to-group', 'branch-click', 'open-workspace', 'pull-git', 'push-git', 'start-group', 'stop-group'])

const hoveredGroup = ref(null)

// ── Collapsing Groups ──────────────────────
const collapsedGroups = reactive(JSON.parse(localStorage.getItem('xpm-collapsed-groups') || '{}'))

function toggleGroup(group) {
  collapsedGroups[group] = !collapsedGroups[group]
  localStorage.setItem('xpm-collapsed-groups', JSON.stringify(collapsedGroups))
}

// ── Card Drag and Drop ─────────────────────
const dragGuid = ref(null)
const dragOverGuid = ref(null)
const cardDragOverGroup = ref(null)

function onDragStart(guid, ev) {
  // Don't drag when interacting with terminal, log body, or input areas
  const src = ev.target
  if (src.closest('.card-xterm-container, .card-log-body, .xterm')) {
    ev.preventDefault()
    return
  }
  dragGuid.value = guid
  ev.dataTransfer.effectAllowed = 'move'
  ev.dataTransfer.setData('text/plain', guid)
  requestAnimationFrame(() => {
    if (ev.target) ev.target.style.opacity = '0.4'
  })
}

function onDragOver(guid) {
  dragOverGuid.value = guid
}

function onDragEnd(ev) {
  if (ev.target) ev.target.style.opacity = ''
  dragGuid.value = null
  dragOverGuid.value = null
  cardDragOverGroup.value = null
}

function findNodeGroupByGuid(guid) {
  for (const g of props.sortedGroups) {
    if (g.items.some(p => p.guid === guid)) return g.name
  }
  return null
}

function onDrop(targetGuid) {
  const sourceGuid = dragGuid.value
  if (!sourceGuid || sourceGuid === targetGuid) return

  const sourceGroup = findNodeGroupByGuid(sourceGuid)
  const targetGroup = findNodeGroupByGuid(targetGuid)

  // Cross-group: move process to the target's group
  if (sourceGroup !== targetGroup && targetGroup) {
    emit('move-to-group', { guid: sourceGuid, group: targetGroup })
  }

  // Reorder within display
  const allGuids = props.sortedGroups.flatMap(g => g.items.map(p => p.guid))
  const srcIdx = allGuids.indexOf(sourceGuid)
  const tgtIdx = allGuids.indexOf(targetGuid)
  if (srcIdx === -1 || tgtIdx === -1) return

  allGuids.splice(srcIdx, 1)
  allGuids.splice(tgtIdx, 0, sourceGuid)

  emit('reorder', allGuids)
  dragGuid.value = null
  dragOverGuid.value = null
  cardDragOverGroup.value = null
}

// ── Group Drag and Drop ────────────────────
const groupDragIndex = ref(null)
const groupDragOverIndex = ref(null)

function onGroupDragStart(gi, group, ev) {
  groupDragIndex.value = gi
  ev.dataTransfer.effectAllowed = 'move'
  ev.dataTransfer.setData('text/x-group', group)
}

function onGroupHeaderDragOver(gi) {
  if (groupDragIndex.value !== null) {
    groupDragOverIndex.value = gi
  }
  if (dragGuid.value) {
    cardDragOverGroup.value = props.sortedGroups[gi]?.name || null
  }
}

function onGroupHeaderDragLeave(gi) {
  if (groupDragOverIndex.value === gi) groupDragOverIndex.value = null
  const group = props.sortedGroups[gi]?.name
  if (cardDragOverGroup.value === group) cardDragOverGroup.value = null
}

function onGroupHeaderDrop(gi, group) {
  // Card dropped onto group header
  if (dragGuid.value) {
    const sourceGuid = dragGuid.value
    const sourceGroup = findNodeGroupByGuid(sourceGuid)
    if (sourceGroup !== group) {
      emit('move-to-group', { guid: sourceGuid, group })
    }
    dragGuid.value = null
    dragOverGuid.value = null
    cardDragOverGroup.value = null
    return
  }

  // Group reorder
  const from = groupDragIndex.value
  if (from === null || from === gi) return

  const groupNames = props.sortedGroups.map(g => g.name)
  const [moved] = groupNames.splice(from, 1)
  groupNames.splice(gi, 0, moved)

  emit('reorder-groups', groupNames)
  groupDragIndex.value = null
  groupDragOverIndex.value = null
}

function onGroupDragEnd() {
  groupDragIndex.value = null
  groupDragOverIndex.value = null
}
</script>
