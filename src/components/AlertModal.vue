<template>
  <div v-if="state.show" class="modal-overlay" @mousedown.self="overlayMouseDown = true" @click.self="handleOverlayClick">
    <div class="modal alert-modal">
      <div class="modal-header">
        <h2>{{ state.title }}</h2>
      </div>
      <div class="modal-body">
        <p>{{ state.message }}</p>
      </div>
      <div class="modal-actions">
        <button class="btn-ghost" @click="hideAlert">Close</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useAlert } from '../composables/useAlert.js'

const { state, hideAlert } = useAlert()

const overlayMouseDown = ref(false)
function handleOverlayClick() {
  if (overlayMouseDown.value) hideAlert()
  overlayMouseDown.value = false
}
</script>

<style scoped>
.alert-modal {
  width: 400px;
  max-width: 90vw;
}
.modal-header h2 {
  margin-bottom: 12px;
  font-size: 16px;
  color: var(--text);
}
.modal-body p {
  font-size: 14px;
  color: var(--text-dim);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
