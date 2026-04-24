<template>
  <div
    ref="cardRef"
    class="card"
    :class="{ selected: isSelected, expanded, stopped: node.status !== 'running' }"
    :style="{ borderColor, '--card-color': borderColor }"
    @click="$emit('select', node.guid)"
    @mouseenter="$emit('hover-enter', node.guid, $event.currentTarget, expanded, node.command)"
    @mouseleave="!expanded && $emit('hover-leave', node.guid)"
  >
    <div class="card-header">
      <div class="card-name">
        <i :class="[typeIcon, 'node-type-icon', node.status]" :title="node.type"></i>
        {{ node.name }}
        <i v-if="node.type === 'script' && node.status === 'running'" class="fa-solid fa-spinner script-running-spinner" style="margin-left: 8px;" title="Running..."></i>
        <i v-if="node.needsInput" class="fa-solid fa-keyboard fa-fade" style="margin-left: 8px; color: #fbbf24;" title="Waiting for input..."></i>
      </div>
      <CardActions
        :node="node"
        :is-selected="isSelected"
        :terminal-open="terminalOpen"
        :workspace-open="workspaceOpen"
        :card-ref="cardRef"
        :expanded="expanded"
        @start="$emit('start', $event)"
        @stop="$emit('stop', $event)"
        @restart="$emit('restart', $event)"
        @edit="$emit('edit', $event)"
        @open-workspace="$emit('open-workspace', $event)"
        @hover-cancel="$emit('hover-cancel', $event)"
        @hover-enter="(name, el, exp, cmd) => $emit('hover-enter', name, el, exp, cmd)"
      />
    </div>
    <div class="card-meta">
      <div v-if="node.branch" class="branch-tag-group" @click.stop>
        <span class="branch-tag" @click.stop="$emit('branch-click', node.guid)">{{ node.branch }}</span>
        <button
          v-if="gitRemoteStatus === 'behind'"
          class="btn-git-action btn-pull"
          @click.stop="pullGitChanges"
          title="Pull updates"
        >
          <i class="fa-solid fa-cloud-arrow-down"></i>
        </button>
        <button
          v-if="gitRemoteStatus === 'ahead'"
          class="btn-git-action btn-push"
          @click.stop="pushGitChanges"
          title="Push updates"
        >
          <i class="fa-solid fa-cloud-arrow-up"></i>
        </button>
        <button
          class="btn-git-action btn-refresh"
          :class="{ spinning: gitRemoteStatus === 'checking' }"
          @click.stop="checkGitStatus"
          title="Check for remote updates"
        >
          <i class="fa-solid fa-arrows-rotate"></i>
        </button>
      </div>
      <div class="card-meta-info">
        <span class="pid-badge" title="PID"><i class="fa-solid fa-hashtag mr-1"></i>{{ node.pid || '-' }}</span>
        <span title="Uptime"><i class="fa-regular fa-clock mr-1"></i>{{ uptime }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { api } from '../composables/useApi.js'
import { useNotifications } from '../composables/useNotifications.js'
import CardActions from './CardActions.vue'

const props = defineProps({
  node: { type: Object, required: true },
  borderColor: { type: String, default: '#4b5563' },
  isSelected: { type: Boolean, default: false },
  terminalOpen: { type: Boolean, default: false },
  workspaceOpen: { type: Boolean, default: false },
})

const emit = defineEmits(['select', 'start', 'stop', 'restart', 'edit', 'hover-enter', 'hover-leave', 'hover-cancel', 'branch-click', 'open-workspace', 'pull-git', 'push-git'])

const { addNotification } = useNotifications()

const cardRef = ref(null)
const expanded = ref(false)
const gitRemoteStatus = ref(null)

function formatUptime(ms) {
  if (!ms) return '-'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

const TYPE_ICONS = {
  service: 'fa-solid fa-server',
  agent: 'fa-solid fa-robot',
  desk: 'fa-solid fa-desktop',
  script: 'fa-solid fa-scroll',
}

const typeIcon = computed(() => TYPE_ICONS[props.node.type] || 'fa-solid fa-circle')

const uptime = computed(() => {
  if (props.node.status === 'running' && props.node.startedAt) {
    return formatUptime(Date.now() - props.node.startedAt)
  }
  return '-'
})


async function checkGitStatus() {
  gitRemoteStatus.value = 'checking'
  try {
    const res = await api(`/api/processes/${encodeURIComponent(props.node.guid)}/git/remote-status`, 'POST')
    gitRemoteStatus.value = res.status
  } catch (err) {
    console.error('Failed to check git status:', err)
    gitRemoteStatus.value = 'error'
    addNotification(`Failed to check git status for ${props.node.name}: ${err.message}`, 'error')
  }
}

async function pullGitChanges() {
  gitRemoteStatus.value = 'checking'
  emit('pull-git', props.node.guid, (success) => {
    if (success) {
      checkGitStatus()
    } else {
      gitRemoteStatus.value = 'behind'
    }
  })
}

async function pushGitChanges() {
  gitRemoteStatus.value = 'checking'
  emit('push-git', props.node.guid, (success) => {
    if (success) {
      checkGitStatus()
    } else {
      gitRemoteStatus.value = 'ahead'
    }
  })
}

onUnmounted(() => {
})
</script>
