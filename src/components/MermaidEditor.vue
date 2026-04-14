<template>
  <div class="modal-overlay" style="z-index: 1000; background: rgba(0,0,0,0.8)" @mousedown.self="closeMermaidEditor">
    <div class="modal mermaid-editor-modal" style="width: 90%; height: 85%; display: flex; flex-direction: column; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
      <div class="workspace-header" style="border-bottom: 1px solid var(--border); padding: 12px 16px; display: flex; align-items: center;">
        <h2 style="margin: 0; font-size: 14px;"><i class="fa-solid fa-diagram-project" style="margin-right: 8px; color: var(--magenta)"></i>Mermaid Editor</h2>
        <div style="display: flex; gap: 8px; margin-left: auto">
          <button class="btn-start" style="padding: 6px 14px; font-size: 12px" @click="saveMermaidEdit">Save</button>
          <button class="btn-ghost" @click="closeMermaidEditor">Cancel</button>
        </div>
      </div>
      <div style="display: flex; flex: 1; min-height: 0;">
        <div style="flex: 1; overflow: hidden; background: var(--bg); display: flex; flex-direction: column; position: relative;">
          <div style="padding: 8px 16px; display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
            <div v-if="mermaidLiveError" style="color: var(--red); flex: 1; white-space: pre-wrap; font-family: monospace; font-size: 12px; padding: 6px 12px; background: rgba(255,0,0,0.1); border-radius: 4px;">{{ mermaidLiveError }}</div>
            <div style="font-size: 11px; color: var(--text-dim);"><i class="fa-solid fa-hand-pointer" style="margin-right: 4px"></i>Click node to inspect · Scroll to zoom · Drag to pan</div>
            <div style="margin-left: auto; display: flex; gap: 4px; align-items: center;">
              <button class="btn-ghost" style="padding: 2px 6px; font-size: 12px;" @click="zoomDiagram(-0.1)"><i class="fa-solid fa-minus"></i></button>
              <span style="font-size: 11px; color: var(--text-dim); min-width: 40px; text-align: center;">{{ Math.round(diagramZoom * 100) }}%</span>
              <button class="btn-ghost" style="padding: 2px 6px; font-size: 12px;" @click="zoomDiagram(0.1)"><i class="fa-solid fa-plus"></i></button>
              <button class="btn-ghost" style="padding: 2px 6px; font-size: 11px; margin-left: 4px;" @click="resetDiagramView">Reset</button>
            </div>
          </div>
          <div
            ref="diagramViewportRef"
            style="flex: 1; overflow: hidden; cursor: grab; position: relative;"
            @wheel.prevent="onDiagramWheel"
            @mousedown="onDiagramMouseDown"
          >
            <div
              ref="mermaidEditorPreviewRef"
              v-html="mermaidLiveSvg"
              :style="{ transform: `translate(${diagramPanX}px, ${diagramPanY}px) scale(${diagramZoom})`, transformOrigin: '0 0', transition: diagramTransition, padding: '24px', display: 'inline-block' }"
            ></div>
          </div>
        </div>
        <!-- Node Detail Panel (Right Side) -->
        <div v-if="nodeDetail.visible" class="mermaid-node-detail" style="width: 300px; flex-shrink: 0; border-left: 1px solid var(--border); background: var(--bg-dark); padding: 16px; overflow-y: auto;">
          <div style="display: flex; align-items: center; margin-bottom: 12px;">
            <i class="fa-solid fa-circle-nodes" style="margin-right: 8px; color: var(--cyan)"></i>
            <div style="flex: 1; min-width: 0;">
              <span style="font-weight: bold; font-size: 13px; display: block;">{{ nodeDetail.label || nodeDetail.id }}</span>
              <span style="font-size: 10px; color: var(--text-dim);">ID: {{ nodeDetail.id }}</span>
            </div>
            <button class="btn-ghost" style="margin-left: 8px; padding: 2px 8px; font-size: 11px; flex-shrink: 0;" @click="nodeDetail.visible = false"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-dim); text-transform: uppercase;">Label</label>
              <input v-model="nodeDetail.label" class="workspace-search-input" style="padding: 6px 8px; font-size: 12px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text)" @keydown.enter="applyNodeEdit" />
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 11px; color: var(--text-dim); text-transform: uppercase;">Shape</label>
              <select v-model="nodeDetail.shape" style="padding: 6px 8px; font-size: 12px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text); cursor: pointer;">
                <option value="rect">Rectangle [ ]</option>
                <option value="round">Rounded ( )</option>
                <option value="stadium">Stadium ([ ])</option>
                <option value="circle">Circle (( ))</option>
                <option value="diamond">Diamond { }</option>
                <option value="hexagon">Hexagon {{ }}</option>
              </select>
            </div>

            <!-- Connections -->
            <div>
              <label style="font-size: 11px; color: var(--text-dim); text-transform: uppercase; margin-bottom: 4px; display: block;">Connections</label>
              <div v-if="!nodeDetail.connections.length" style="font-size: 12px; color: var(--text-dim); padding: 4px 0;">No connections</div>
              <div v-for="(conn, ci) in nodeDetail.connections" :key="ci" style="font-size: 12px; padding: 4px 8px; background: var(--bg); border-radius: 4px; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                <span style="color: var(--cyan)">{{ conn.from }}</span>
                <span style="color: var(--text-dim)">{{ conn.arrow }}</span>
                <span style="color: var(--green)">{{ conn.to }}</span>
                <span v-if="conn.text" style="color: var(--yellow); font-style: italic;">"{{ conn.text }}"</span>
                <button class="btn-ghost" style="margin-left: auto; padding: 1px 5px; font-size: 10px; color: var(--red);" @click="deleteConnection(ci)"><i class="fa-solid fa-trash-can"></i></button>
              </div>
            </div>

            <!-- Add Transition -->
            <div style="border-top: 1px solid var(--border); padding-top: 10px;">
              <label style="font-size: 11px; color: var(--text-dim); text-transform: uppercase; margin-bottom: 6px; display: block;">Add Transition</label>
              <div style="display: flex; flex-direction: column; gap: 6px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <label style="font-size: 11px; color: var(--text-dim); width: 36px; flex-shrink: 0;">From</label>
                  <select v-model="newTransition.from" style="flex: 1; padding: 4px 8px; font-size: 12px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text); cursor: pointer;">
                    <option value="">{{ nodeDetail.id }} (current)</option>
                    <option v-for="n in availableNodes" :key="n.id" :value="n.id">{{ n.label || n.id }}</option>
                  </select>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <label style="font-size: 11px; color: var(--text-dim); width: 36px; flex-shrink: 0;">To</label>
                  <select v-model="newTransition.to" style="flex: 1; padding: 4px 8px; font-size: 12px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text); cursor: pointer;">
                    <option value="" disabled>Select node...</option>
                    <option v-for="n in availableNodes" :key="n.id" :value="n.id">{{ n.label || n.id }}</option>
                  </select>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <label style="font-size: 11px; color: var(--text-dim); width: 36px; flex-shrink: 0;">Text</label>
                  <input v-model="newTransition.text" style="flex: 1; padding: 4px 8px; font-size: 12px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text)" placeholder="optional" />
                </div>
                <button class="btn-ghost" style="padding: 4px 10px; font-size: 12px; align-self: flex-start; color: var(--green);" @click="addTransition">
                  <i class="fa-solid fa-plus" style="margin-right: 4px"></i>Add
                </button>
              </div>
            </div>

            <!-- Actions -->
            <div style="display: flex; gap: 8px; border-top: 1px solid var(--border); padding-top: 10px; margin-top: 4px;">
              <button class="btn-start" style="padding: 5px 12px; font-size: 12px;" @click="applyNodeEdit">
                <i class="fa-solid fa-check" style="margin-right: 4px"></i>Apply
              </button>
              <button class="btn-ghost" style="padding: 5px 12px; font-size: 12px; color: var(--red);" @click="deleteNode">
                <i class="fa-solid fa-trash" style="margin-right: 4px"></i>Delete Node
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed, nextTick, onUnmounted } from 'vue'

const props = defineProps({
  initialCode: { type: String, default: '' }
})

const emit = defineEmits(['save', 'cancel'])

const mermaidEditorCode = ref('')
const mermaidEditorPreviewRef = ref(null)
const mermaidLiveSvg = ref('')
const mermaidLiveError = ref(null)

let mermaidModule = null

async function loadMermaid() {
  if (mermaidModule) return mermaidModule
  const mod = await import('mermaid')
  mermaidModule = mod.default
  mermaidModule.initialize({ startOnLoad: false, theme: 'dark' })
  return mermaidModule
}



// ── Diagram Zoom & Pan ─────────────────────
const diagramViewportRef = ref(null)
const diagramZoom = ref(1)
const diagramPanX = ref(0)
const diagramPanY = ref(0)
const diagramTransition = ref('none')
let isDraggingDiagram = false
let dragStartX = 0
let dragStartY = 0
let dragStartPanX = 0
let dragStartPanY = 0

function zoomDiagram(delta) {
  diagramTransition.value = 'transform 0.15s ease'
  diagramZoom.value = Math.max(0.1, Math.min(5, diagramZoom.value + delta))
  setTimeout(() => { diagramTransition.value = 'none' }, 160)
}

function resetDiagramView() {
  diagramTransition.value = 'transform 0.2s ease'
  diagramZoom.value = 1
  diagramPanX.value = 0
  diagramPanY.value = 0
  setTimeout(() => { diagramTransition.value = 'none' }, 220)
}

function onDiagramWheel(e) {
  const delta = e.deltaY > 0 ? -0.08 : 0.08
  diagramZoom.value = Math.max(0.1, Math.min(5, diagramZoom.value + delta))
}

function onDiagramMouseDown(e) {
  const nodeEl = e.target.closest ? e.target.closest('.node') : null
  if (nodeEl) return
  isDraggingDiagram = true
  dragStartX = e.clientX
  dragStartY = e.clientY
  dragStartPanX = diagramPanX.value
  dragStartPanY = diagramPanY.value
  document.addEventListener('mousemove', onDiagramMouseMove)
  document.addEventListener('mouseup', onDiagramMouseUp)
  document.body.style.cursor = 'grabbing'
  document.body.style.userSelect = 'none'
}

function onDiagramMouseMove(e) {
  if (!isDraggingDiagram) return
  diagramPanX.value = dragStartPanX + (e.clientX - dragStartX)
  diagramPanY.value = dragStartPanY + (e.clientY - dragStartY)
}

function onDiagramMouseUp() {
  isDraggingDiagram = false
  document.removeEventListener('mousemove', onDiagramMouseMove)
  document.removeEventListener('mouseup', onDiagramMouseUp)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onDiagramMouseMove)
  document.removeEventListener('mouseup', onDiagramMouseUp)
})

// ── Node Detail Panel State ─────────────────
const nodeDetail = ref({
  visible: false,
  id: '',
  label: '',
  originalLabel: '',
  shape: 'rect',
  originalShape: 'rect',
  connections: [],
})

const SHAPE_WRAPPERS = {
  rect:    { open: '[', close: ']' },
  round:   { open: '(', close: ')' },
  stadium: { open: '([', close: '])' },
  circle:  { open: '((', close: '))' },
  diamond: { open: '{', close: '}' },
  hexagon: { open: '{{', close: '}}' },
}

function detectShape(defStr) {
  const s = defStr.trim()
  if (s.startsWith('((') && s.endsWith('))')) return 'circle'
  if (s.startsWith('([') && s.endsWith('])')) return 'stadium'
  if (s.startsWith('{{') && s.endsWith('}}')) return 'hexagon'
  if (s.startsWith('{') && s.endsWith('}')) return 'diamond'
  if (s.startsWith('(') && s.endsWith(')')) return 'round'
  if (s.startsWith('[') && s.endsWith(']')) return 'rect'
  return 'rect'
}

function extractLabel(defStr, shape) {
  const w = SHAPE_WRAPPERS[shape]
  if (!w) return defStr
  const s = defStr.trim()
  if (s.startsWith(w.open) && s.endsWith(w.close)) {
    return s.slice(w.open.length, s.length - w.close.length)
  }
  return defStr
}

function parseMermaidNodes(code) {
  const lines = code.split('\n')
  const nodes = {} // id -> { id, label, shape, defStr }
  const connections = [] // { from, to, arrow, text }

  const arrowPatterns = [
    { regex: /^\s*(\w+)\s*(-->\.>)\s*(\w+)/, arrow: '-->.' },
    { regex: /^\s*(\w+)\s*(==>)\s*(\w+)/, arrow: '==>' },
    { regex: /^\s*(\w+)\s*(-.->)\s*(\w+)/, arrow: '-.->' },
    { regex: /^\s*(\w+)\s*--\s*"?([^"\|]+?)"?\s*-->\s*(\w+)/, arrow: '-->', hasText: true },
    { regex: /^\s*(\w+)\s*-->\s*\|([^|]+)\|\s*(\w+)/, arrow: '-->', hasText: true, textGroup: 2, toGroup: 3 },
    { regex: /^\s*(\w+)\s*(-->)\s*(\w+)/, arrow: '-->' },
    { regex: /^\s*(\w+)\s*(---)\s*(\w+)/, arrow: '---' },
  ]

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || /^(graph|flowchart|subgraph|end|%%|classDef|class |style )/.test(trimmed)) continue

    let foundConnection = false
    for (const pat of arrowPatterns) {
      const m = trimmed.match(pat.regex)
      if (m) {
        let from, to, text = ''
        if (pat.hasText) {
          from = m[1]
          text = m[pat.textGroup || 2]
          to = m[pat.toGroup || 3]
        } else {
          from = m[1]
          to = m[3]
        }
        connections.push({ from, to, arrow: pat.arrow, text })
        const fullPartsRe = /(\w+)(\[.*?\]|\(.*?\)|\{.*?\})?/g
        let pm
        while ((pm = fullPartsRe.exec(trimmed)) !== null) {
          if (pm[2] && !nodes[pm[1]]) {
            const shape = detectShape(pm[2])
            nodes[pm[1]] = { id: pm[1], label: extractLabel(pm[2], shape), shape, defStr: pm[2] }
          }
        }
        foundConnection = true
        break
      }
    }
    if (foundConnection) continue

    const nodeDefMatch = trimmed.match(/^(\w+)(\[\[.*?\]\]|\[\(.*?\)\]|\(\[.*?\]\)|\(\(.*?\)\)|\{\{.*?\}\}|\[.*?\]|\(.*?\)|\{.*?\})\s*$/)
    if (nodeDefMatch) {
      const id = nodeDefMatch[1]
      const defStr = nodeDefMatch[2]
      const shape = detectShape(defStr)
      nodes[id] = { id, label: extractLabel(defStr, shape), shape, defStr }
    }
  }

  return { nodes, connections }
}

function handleNodeClick(nodeId) {
  const { nodes, connections } = parseMermaidNodes(mermaidEditorCode.value)
  const node = nodes[nodeId]
  const relatedConns = connections.filter(c => c.from === nodeId || c.to === nodeId)

  nodeDetail.value = {
    visible: true,
    id: nodeId,
    label: node ? node.label : nodeId,
    originalLabel: node ? node.label : nodeId,
    shape: node ? node.shape : 'rect',
    originalShape: node ? node.shape : 'rect',
    connections: relatedConns,
  }
}

function applyNodeEdit() {
  if (!nodeDetail.value.id) return
  const code = mermaidEditorCode.value
  const id = nodeDetail.value.id
  const newLabel = nodeDetail.value.label
  const newShape = nodeDetail.value.shape
  const w = SHAPE_WRAPPERS[newShape]
  const newDef = `${id}${w.open}${newLabel}${w.close}`

  const lines = code.split('\n')
  let replaced = false
  const newLines = lines.map(line => {
    const re = new RegExp(`(^|\\s|-->|---|==>|-\\.->|\\|)${escapeRegex(id)}(\\[\\[.*?\\]\\]|\\[\\(.*?\\)\\]|\\(\\[.*?\\]\\)|\\(\\(.*?\\)\\)|\\{\\{.*?\\}\\}|\\[.*?\\]|\\(.*?\\)|\\{.*?\\})`, 'g')
    if (re.test(line)) {
      replaced = true
      re.lastIndex = 0
      return line.replace(re, (match, prefix) => `${prefix}${newDef}`)
    }
    return line
  })

  if (!replaced) {
    newLines.push(`    ${newDef}`)
  }

  mermaidEditorCode.value = newLines.join('\n')
  updateMermaidLivePreview()
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const newTransition = ref({ from: '', to: '', text: '' })

const availableNodes = computed(() => {
  if (!mermaidEditorCode.value) return []
  const { nodes, connections } = parseMermaidNodes(mermaidEditorCode.value)
  const map = {}
  Object.values(nodes).forEach(n => { map[n.id] = n.label || n.id })
  connections.forEach(c => {
    if (!map[c.from]) map[c.from] = c.from
    if (!map[c.to]) map[c.to] = c.to
  })
  return Object.entries(map).map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label))
})

function deleteNode() {
  if (!nodeDetail.value.id) return
  const id = nodeDetail.value.id
  const lines = mermaidEditorCode.value.split('\n')

  const newLines = lines.filter(line => {
    const trimmed = line.trim()
    const standaloneRe = new RegExp(`^${escapeRegex(id)}(\\[|\\(|\\{|\\s*$)`)
    if (standaloneRe.test(trimmed)) return false
    const connRe = new RegExp(`(^|\\s)${escapeRegex(id)}(\\s|\\[|\\(|\\{|$)`)
    const arrowRe = /-->|---|-\.->|==>|~~>/
    if (connRe.test(trimmed) && arrowRe.test(trimmed)) return false
    return true
  })

  mermaidEditorCode.value = newLines.join('\n')
  nodeDetail.value.visible = false
  updateMermaidLivePreview()
}

function deleteConnection(connIndex) {
  const conn = nodeDetail.value.connections[connIndex]
  if (!conn) return
  const lines = mermaidEditorCode.value.split('\n')

  let removed = false
  const newLines = lines.filter(line => {
    if (removed) return true
    const trimmed = line.trim()
    const fromRe = new RegExp(`(^|\\s)${escapeRegex(conn.from)}`)
    const toRe = new RegExp(`${escapeRegex(conn.to)}(\\s|\\[|\\(|\\{|$)`)
    if (fromRe.test(trimmed) && toRe.test(trimmed) && /-->|---|-\.->|==>/.test(trimmed)) {
      removed = true
      return false
    }
    return true
  })

  mermaidEditorCode.value = newLines.join('\n')
  nodeDetail.value.connections.splice(connIndex, 1)
  updateMermaidLivePreview()
}

function addTransition() {
  const from = newTransition.value.from || nodeDetail.value.id
  const to = newTransition.value.to
  if (!to) return

  let line = `    ${from} --> ${to}`
  if (newTransition.value.text) {
    line = `    ${from} -->|${newTransition.value.text}| ${to}`
  }

  mermaidEditorCode.value = mermaidEditorCode.value.trimEnd() + '\n' + line
  newTransition.value = { from: '', to: '', text: '' }

  const { connections } = parseMermaidNodes(mermaidEditorCode.value)
  nodeDetail.value.connections = connections.filter(c => c.from === nodeDetail.value.id || c.to === nodeDetail.value.id)

  updateMermaidLivePreview()
}

function attachNodeClickHandlers(containerEl) {
  if (!containerEl) return
  const svgEl = containerEl.querySelector('svg')
  if (!svgEl) return

  const nodeEls = svgEl.querySelectorAll('.node')
  nodeEls.forEach(nodeEl => {
    let nodeId = nodeEl.id || ''
    const fullMatch = nodeId.match(/flowchart-(\w+)-\d+$/)
    if (fullMatch) {
      nodeId = fullMatch[1]
    }
    if (!nodeId) return

    nodeEl.style.cursor = 'pointer'
    nodeEl.addEventListener('click', (e) => {
      e.stopPropagation()
      handleNodeClick(nodeId)
    })

    nodeEl.addEventListener('mouseenter', () => {
      nodeEl.style.filter = 'brightness(1.3) drop-shadow(0 0 6px rgba(96, 165, 250, 0.4))'
    })
    nodeEl.addEventListener('mouseleave', () => {
      nodeEl.style.filter = ''
    })
  })
}

async function updateMermaidLivePreview() {
  if (!mermaidEditorCode.value) { mermaidLiveSvg.value = ''; mermaidLiveError.value = null; return }
  try {
    const mermaid = await loadMermaid()
    const id = `mermaid-live-${Date.now()}`
    const { svg } = await mermaid.render(id, mermaidEditorCode.value)
    mermaidLiveSvg.value = svg
    mermaidLiveError.value = null
    await nextTick()
    attachNodeClickHandlers(mermaidEditorPreviewRef.value)
  } catch (err) {
    mermaidLiveError.value = err.message || err.toString()
  }
}

function saveMermaidEdit() {
  emit('save', mermaidEditorCode.value)
}

function closeMermaidEditor() {
  emit('cancel')
}

watch(() => props.initialCode, (newVal) => {
  mermaidEditorCode.value = newVal || ''
  diagramZoom.value = 1
  diagramPanX.value = 0
  diagramPanY.value = 0
  nodeDetail.value.visible = false
  updateMermaidLivePreview()
}, { immediate: true })
</script>
