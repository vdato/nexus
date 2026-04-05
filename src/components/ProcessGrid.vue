<template>
  <div>
    <template v-for="([group, items]) in sortedGroups" :key="group">
      <div class="group-title">{{ group }}</div>
      <div class="process-grid">
        <ProcessCard
          v-for="p in items"
          :key="p.name"
          :process="p"
          :border-color="colorMap[p.group || 'other'] || '#4b5563'"
          :is-selected="selectedProcess === p.name"
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
import ProcessCard from './ProcessCard.vue'

defineProps({
  sortedGroups: { type: Array, required: true },
  colorMap: { type: Object, required: true },
  selectedProcess: { type: String, default: null },
})

defineEmits(['select', 'start', 'stop', 'restart', 'edit', 'hover-enter', 'hover-leave'])
</script>
