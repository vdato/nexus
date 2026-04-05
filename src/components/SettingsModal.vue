<template>
  <div v-if="show" class="modal-overlay" @click.self="emit('close')">
    <div class="modal modal-wide">
      <h2>Settings</h2>
      <div class="settings-tabs">
        <button
          class="settings-tab"
          :class="{ active: activeTab === 'general' }"
          @click="activeTab = 'general'"
        >General</button>
        <button
          class="settings-tab"
          :class="{ active: activeTab === 'advanced' }"
          @click="activeTab = 'advanced'"
        >Advanced</button>
      </div>
      <div class="modal-scroll">
        <!-- General Tab -->
        <div class="settings-tab-content" :class="{ active: activeTab === 'general' }">
          <!-- Import section -->
          <div class="settings-section">
            <div class="settings-section-title">Import processes</div>
            <div class="env-note">
              Choose a JSON file in the same format as <code>processes.config.json</code>
              (an array of process definitions). Existing names are skipped.
            </div>
            <button type="button" class="btn-ghost" @click="triggerImport">Import…</button>
            <input
              ref="importFileRef"
              type="file"
              accept=".json"
              style="display: none"
              @change="onImportFile"
            />
          </div>

          <!-- Groups section -->
          <div class="settings-section">
            <div class="settings-section-title">Groups</div>
            <div class="env-note">
              Process groups, section order, and card border colors. Stored in
              <code>groups.config.json</code>. At least one group is required.
            </div>
            <div class="env-rows group-rows">
              <div v-for="(row, i) in groupRows" :key="i" class="env-row group-row">
                <input
                  v-model="row.name"
                  type="text"
                  class="env-val group-name"
                  style="flex: 1"
                  placeholder="group name"
                />
                <input
                  v-model="row.color"
                  type="color"
                  class="group-color"
                  title="Border color"
                />
                <button type="button" class="btn-remove-row" @click="emit('remove-group', i)">&times;</button>
              </div>
            </div>
            <button type="button" class="btn-add-row" @click="emit('add-group')">+ Add group</button>
          </div>

          <!-- Environment section -->
          <div class="settings-section">
            <div class="settings-section-title">Environment variables</div>
            <div class="env-note">
              These variables are injected into all processes at startup. Restart running processes to pick up changes.
            </div>
            <div class="env-rows">
              <div v-for="(row, i) in envRows" :key="i" class="env-row">
                <input v-model="row.key" type="text" class="env-key" placeholder="KEY" />
                <input v-model="row.value" type="text" class="env-val" placeholder="value" />
                <button type="button" class="btn-remove-row" @click="emit('remove-env', i)">&times;</button>
              </div>
            </div>
            <button type="button" class="btn-add-row" @click="emit('add-env')">+ Add Variable</button>
          </div>
        </div>

        <!-- Advanced Tab -->
        <div class="settings-tab-content" :class="{ active: activeTab === 'advanced' }">
          <div class="settings-section" style="margin-top: 0; padding-top: 0; border-top: none">
            <div class="settings-section-title">Polling intervals</div>
            <div class="env-note">
              Control how frequently the UI fetches updates. Changes apply after saving
              (poll intervals apply immediately, port/maxLogLines require server restart).
            </div>
            <div class="setting-field">
              <label>Log poll interval (ms)</label>
              <input
                :value="logPollInterval"
                type="number" min="100" step="100"
                @input="emit('update:logPollInterval', parseInt($event.target.value) || 500)"
              />
            </div>
            <div class="setting-field">
              <label>Status poll interval (ms)</label>
              <input
                :value="statusPollInterval"
                type="number" min="500" step="500"
                @input="emit('update:statusPollInterval', parseInt($event.target.value) || 3000)"
              />
            </div>
            <div class="setting-field">
              <label>Popover poll interval (ms)</label>
              <input
                :value="popoverPollInterval"
                type="number" min="500" step="500"
                @input="emit('update:popoverPollInterval', parseInt($event.target.value) || 1500)"
              />
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-section-title">Server</div>
            <div class="env-note">Requires server restart to take effect.</div>
            <div class="setting-field">
              <label>Port</label>
              <input
                :value="port"
                type="number" min="1" max="65535"
                @input="emit('update:port', parseInt($event.target.value) || 1337)"
              />
            </div>
            <div class="setting-field">
              <label>Max log lines per process</label>
              <input
                :value="maxLogLines"
                type="number" min="50" step="50"
                @input="emit('update:maxLogLines', parseInt($event.target.value) || 500)"
              />
            </div>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn-ghost" @click="emit('close')">Close</button>
        <button type="button" class="btn-start" @click="emit('save')">Save</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  show: { type: Boolean, default: false },
  envRows: { type: Array, default: () => [] },
  groupRows: { type: Array, default: () => [] },
  logPollInterval: { type: Number, default: 500 },
  statusPollInterval: { type: Number, default: 3000 },
  popoverPollInterval: { type: Number, default: 1500 },
  port: { type: Number, default: 1337 },
  maxLogLines: { type: Number, default: 500 },
})

const emit = defineEmits([
  'close', 'save',
  'add-env', 'remove-env',
  'add-group', 'remove-group',
  'import',
  'update:logPollInterval', 'update:statusPollInterval', 'update:popoverPollInterval',
  'update:port', 'update:maxLogLines',
])

const activeTab = ref('general')
const importFileRef = ref(null)

function triggerImport() {
  importFileRef.value?.click()
}

function onImportFile(e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (file) {
    emit('import', file)
  }
}
</script>
