<template>
  <div v-if="show" class="modal-overlay" @mousedown.self="overlayMouseDown = true" @click.self="handleOverlayClick">
    <div class="modal">
      <h2>Checkout Branch — {{ nodeName }}</h2>
      <div class="form-group">
        <input
          v-model="filterQuery"
          type="text"
          placeholder="Filter branches..."
          ref="filterInput"
        />
      </div>
      <div class="branch-list-container">
        <div v-if="loading" style="padding:12px;color:var(--text-dim);font-size:13px;text-align:center;">
          Loading branches...
        </div>
        <div v-else-if="error" style="padding:12px;color:var(--red);font-size:13px;">
          {{ error }}
        </div>
        <div v-else-if="!filteredBranches.length" style="padding:12px;color:var(--text-dim);font-size:13px;text-align:center;">
          No branches found
        </div>
        <div
          v-else
          v-for="b in filteredBranches"
          :key="b"
          class="branch-item"
          :class="{ current: b === currentBranch }"
          @click="checkout(b)"
        >
          {{ b }}
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn-ghost" @click="handleClose">Cancel</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'

const props = defineProps({
  show: Boolean,
  nodeName: String,
  branches: Array,
  currentBranch: String,
  loading: Boolean,
  error: String
})

const emit = defineEmits(['close', 'checkout'])

const filterQuery = ref('')
const filterInput = ref(null)

watch(() => props.show, (val) => {
  if (val) {
    filterQuery.value = ''
    nextTick(() => {
      if (filterInput.value) filterInput.value.focus()
    })
  }
})

const filteredBranches = computed(() => {
  const q = filterQuery.value.toLowerCase()
  if (!props.branches) return []
  return props.branches.filter(b => b.toLowerCase().includes(q))
})

function checkout(branch) {
  if (branch === props.currentBranch) {
    handleClose()
    return
  }
  emit('checkout', branch)
}

const overlayMouseDown = ref(false)
function handleOverlayClick() {
  if (overlayMouseDown.value) emit('close')
  overlayMouseDown.value = false
}

function handleClose() {
  emit('close')
}
</script>
