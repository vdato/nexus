<template>
  <div>
    <template v-for="([group, items]) in sortedGroups" :key="group">
      <div v-if="group" class="group-title">{{ group }}</div>
      <div class="process-grid">
        <ProcessCard
          v-for="p in items"
          :key="p.name"
          :process="p"
          :border-color="colorMap[p.group || 'other'] || '#4b5563'"
          :is-selected="selectedProcess === p.name"
          draggable="true"
          @dragstart="onDragStart(p.name, $event)"
          @dragover.prevent="onDragOver(p.name, $event)"
          @dragend="onDragEnd"
          @drop.prevent="onDrop(p.name)"
          :class="{ 'drag-over': dragOverName === p.name && dragOverName !== dragName }"
          @select="$emit('select', $event)"
          @start="$emit('start', $event)"
          @stop="$emit('stop', $event)"
          @restart="$emit('restart', $event)"
          @edit="$emit('edit', $event)"
          @hover-enter="(name, el) => $emit('hover-enter', name, el)"
          @hover-leave="$emit('hover-leave')"
        />
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import ProcessCard from './ProcessCard.vue'

const props = defineProps({
  sortedGroups: { type: Array, required: true },
  colorMap: { type: Object, required: true },
  selectedProcess: { type: String, default: null },
  viewMode: { type: String, default: 'group' },
})

const emit = defineEmits(['select', 'start', 'stop', 'restart', 'edit', 'hover-enter', 'hover-leave', 'reorder'])

// ── Drag and Drop ──────────────────────────
const dragName = ref(null)
const dragOverName = ref(null)

function onDragStart(name, ev) {
  // Don't drag when interacting with terminal, log body, or input areas
  const src = ev.target
  if (src.closest('.card-xterm-container, .card-log-body, .xterm, .stdin-input-row')) {
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
}

function onDrop(targetName) {
  const sourceName = dragName.value
  if (!sourceName || sourceName === targetName) return

  // Build the full ordered list from current display
  const allNames = props.sortedGroups.flatMap(([, items]) => items.map(p => p.name))
  const srcIdx = allNames.indexOf(sourceName)
  const tgtIdx = allNames.indexOf(targetName)
  if (srcIdx === -1 || tgtIdx === -1) return

  allNames.splice(srcIdx, 1)
  allNames.splice(tgtIdx, 0, sourceName)

  emit('reorder', allNames)
  dragName.value = null
  dragOverName.value = null
}
</script>
