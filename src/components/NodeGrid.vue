<template>
  <div>
    <template v-for="([group, items], gi) in sortedGroups" :key="group">
      <div
        v-if="group"
        class="group-title"
        :class="{
          'group-drag-over': groupDragOverIndex === gi && groupDragOverIndex !== groupDragIndex,
          'group-card-drag-over': cardDragOverGroup === group && dragName,
        }"
        @dragover.prevent="onGroupHeaderDragOver(gi, $event)"
        @dragleave="onGroupHeaderDragLeave(gi)"
        @drop.prevent="onGroupHeaderDrop(gi, group)"
      >
        <span
          class="group-title-drag-handle"
          draggable="true"
          @dragstart.stop="onGroupDragStart(gi, group, $event)"
          @dragend="onGroupDragEnd"
          title="Drag to reorder group"
        ><i class="fa-solid fa-grip-vertical"></i></span>
        {{ group }}
      </div>
      <div class="node-grid">
        <NodeCard
          v-for="p in items"
          :key="p.name"
          :node="p"
          :border-color="colorMap[p.group || 'other'] || '#4b5563'"
          :is-selected="selectedNode === p.name"
          draggable="true"
          @dragstart="onDragStart(p.name, $event)"
          @dragover.prevent="onDragOver(p.name, $event)"
          @dragend="onDragEnd"
          @drop.prevent="onDrop(p.name)"
          :class="{ 
            'drag-over': dragOverName === p.name && dragOverName !== dragName,
            'card-agent': p.type === 'agent'
          }"
          @select="$emit('select', $event)"
          @start="$emit('start', $event)"
          @stop="$emit('stop', $event)"
          @restart="$emit('restart', $event)"
          @edit="$emit('edit', $event)"
          @hover-enter="(...args) => $emit('hover-enter', ...args)"
          @hover-leave="(...args) => $emit('hover-leave', ...args)"
          @branch-click="$emit('branch-click', $event)"
          @open-workspace="$emit('open-workspace', $event)"
        />
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import NodeCard from './NodeCard.vue'

const props = defineProps({
  sortedGroups: { type: Array, required: true },
  colorMap: { type: Object, required: true },
  selectedNode: { type: String, default: null },
  viewMode: { type: String, default: 'group' },
})

const emit = defineEmits(['select', 'start', 'stop', 'restart', 'edit', 'hover-enter', 'hover-leave', 'reorder', 'reorder-groups', 'move-to-group', 'branch-click', 'open-workspace'])

// ── Card Drag and Drop ─────────────────────
const dragName = ref(null)
const dragOverName = ref(null)
const cardDragOverGroup = ref(null)

function onDragStart(name, ev) {
  // Don't drag when interacting with terminal, log body, or input areas
  const src = ev.target
  if (src.closest('.card-xterm-container, .card-log-body, .xterm')) {
    ev.preventDefault()
    return
  }
  dragName.value = name
  ev.dataTransfer.effectAllowed = 'move'
  ev.dataTransfer.setData('text/plain', name)
  requestAnimationFrame(() => {
    if (ev.target) ev.target.style.opacity = '0.4'
  })
}

function onDragOver(name) {
  dragOverName.value = name
}

function onDragEnd(ev) {
  if (ev.target) ev.target.style.opacity = ''
  dragName.value = null
  dragOverName.value = null
  cardDragOverGroup.value = null
}

function findNodeGroup(name) {
  for (const [group, items] of props.sortedGroups) {
    if (items.some(p => p.name === name)) return group
  }
  return null
}

function onDrop(targetName) {
  const sourceName = dragName.value
  if (!sourceName || sourceName === targetName) return

  const sourceGroup = findNodeGroup(sourceName)
  const targetGroup = findNodeGroup(targetName)

  // Cross-group: move process to the target's group
  if (sourceGroup !== targetGroup && targetGroup) {
    emit('move-to-group', { name: sourceName, group: targetGroup })
  }

  // Reorder within display
  const allNames = props.sortedGroups.flatMap(([, items]) => items.map(p => p.name))
  const srcIdx = allNames.indexOf(sourceName)
  const tgtIdx = allNames.indexOf(targetName)
  if (srcIdx === -1 || tgtIdx === -1) return

  allNames.splice(srcIdx, 1)
  allNames.splice(tgtIdx, 0, sourceName)

  emit('reorder', allNames)
  dragName.value = null
  dragOverName.value = null
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
  if (dragName.value) {
    cardDragOverGroup.value = props.sortedGroups[gi]?.[0] || null
  }
}

function onGroupHeaderDragLeave(gi) {
  if (groupDragOverIndex.value === gi) groupDragOverIndex.value = null
  const group = props.sortedGroups[gi]?.[0]
  if (cardDragOverGroup.value === group) cardDragOverGroup.value = null
}

function onGroupHeaderDrop(gi, group) {
  // Card dropped onto group header
  if (dragName.value) {
    const sourceName = dragName.value
    const sourceGroup = findNodeGroup(sourceName)
    if (sourceGroup !== group) {
      emit('move-to-group', { name: sourceName, group })
    }
    dragName.value = null
    dragOverName.value = null
    cardDragOverGroup.value = null
    return
  }

  // Group reorder
  const from = groupDragIndex.value
  if (from === null || from === gi) return

  const groupNames = props.sortedGroups.map(([name]) => name)
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
