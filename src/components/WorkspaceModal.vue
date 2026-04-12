<template>
  <div v-if="show" class="modal-overlay" @mousedown.self="overlayMouseDown = true" @click.self="handleOverlayClick">
    <div class="modal workspace-modal" :class="{ 'workspace-modal-editor': !!openFile || terminalOpen, 'workspace-modal-with-term': terminalOpen }">
      <div class="workspace-header">
        <h2>
          <i class="fa-solid fa-folder-open" style="margin-right: 8px; color: var(--yellow)"></i>
          {{ nodeName }}
        </h2>
        <div style="display: flex; gap: 6px; margin-left: auto">
          <button
            class="btn-ghost workspace-terminal-toggle"
            :class="{ active: terminalOpen }"
            @click="toggleTerminal"
            title="Toggle Terminal"
          >
            <i class="fa-solid fa-terminal" style="margin-right: 4px"></i>Terminal
          </button>
          <button class="btn-ghost" @click="handleClose">Close</button>
        </div>
      </div>

      <div class="workspace-body" :class="{ 'has-terminal': terminalOpen }">
        <!-- Main content pane -->
        <div class="workspace-main">
          <!-- File Browser -->
          <template v-if="!openFile">
            <div class="workspace-search-bar">
              <i class="fa-solid fa-magnifying-glass workspace-search-icon"></i>
              <input
                ref="searchInputRef"
                v-model="searchQuery"
                type="text"
                class="workspace-search-input"
                placeholder="Search files and content..."
                @input="onSearchInput"
                @keydown.esc="clearSearch"
              />
              <button v-if="searchQuery" class="workspace-search-clear" @click="clearSearch">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>

            <!-- Search Results -->
            <template v-if="searchActive">
              <div class="workspace-file-list">
                <div class="workspace-file-list-header">
                  <input
                    type="checkbox"
                    class="workspace-file-checkbox"
                    :checked="isAllInViewSelected"
                    @change="toggleSelectAllInView"
                  />
                  <span>File</span>
                  <span v-if="selectedFiles.length" style="margin-left: auto; text-transform: none; color: var(--blue)">
                    {{ selectedFiles.length }} selected
                  </span>
                </div>
                <div v-if="searchLoading" class="workspace-empty">Searching...</div>
                <div v-if="!searchLoading && !searchResults.length && searchQuery" class="workspace-empty">No results found</div>
                <div
                  v-for="(result, i) in searchResults"
                  :key="i"
                  class="workspace-file-item clickable"
                  @click="openFileFromSearch(result)"
                >
                  <input
                    type="checkbox"
                    class="workspace-file-checkbox"
                    :checked="selectedFiles.includes(result.path)"
                    @click.stop="toggleFileSelection(result.path)"
                  />
                  <i :class="fileIconByName(result.path)" style="width: 16px"></i>
                  <div class="search-result-info">
                    <span class="file-name">{{ result.path }}</span>
                    <span v-if="result.type === 'content'" class="search-result-line">
                      L{{ result.line }}: {{ result.text }}
                    </span>
                  </div>
                  <span class="search-result-badge" :class="result.type === 'file' ? 'badge-file' : 'badge-content'">
                    {{ result.type === 'file' ? 'name' : 'content' }}
                  </span>
                </div>
              </div>
            </template>

            <!-- Normal Directory Listing -->
            <template v-else>
              <div class="workspace-breadcrumb">
                <span class="breadcrumb-segment" @click="navigateTo('')">root</span>
                <template v-for="(seg, i) in pathSegments" :key="i">
                  <span class="breadcrumb-sep">/</span>
                  <span class="breadcrumb-segment" @click="navigateTo(pathSegments.slice(0, i + 1).join('/'))">{{ seg }}</span>
                </template>
              </div>
              <div class="workspace-file-list">
                <div class="workspace-file-list-header">
                  <input
                    type="checkbox"
                    class="workspace-file-checkbox"
                    :checked="isAllInViewSelected"
                    @change="toggleSelectAllInView"
                  />
                  <span>Name</span>
                  <span v-if="selectedFiles.length" style="margin-left: auto; text-transform: none; color: var(--blue)">
                    {{ selectedFiles.length }} selected
                  </span>
                </div>
                <div v-if="currentPath" class="workspace-file-item directory" @click="navigateUp">
                  <div style="width: 14px; flex-shrink: 0"></div>
                  <i class="fa-solid fa-arrow-up" style="width: 16px; color: var(--text-dim)"></i>
                  <span class="file-name">..</span>
                </div>
                <div
                  v-for="file in files"
                  :key="file.name"
                  class="workspace-file-item"
                  :class="{ directory: file.isDirectory, clickable: !file.isDirectory }"
                  @click="handleFileClick(file)"
                >
                  <input
                    type="checkbox"
                    class="workspace-file-checkbox"
                    :checked="selectedFiles.includes(currentPath ? `${currentPath}/${file.name}` : file.name)"
                    @click.stop="toggleFileSelection(currentPath ? `${currentPath}/${file.name}` : file.name)"
                  />
                  <i :class="fileIcon(file)" style="width: 16px"></i>
                  <span class="file-name">{{ file.name }}</span>
                  <span v-if="!file.isDirectory && file.size != null" class="file-size">{{ formatSize(file.size) }}</span>
                </div>
                <div v-if="!listLoading && !files.length" class="workspace-empty">Empty directory</div>
                <div v-if="listLoading" class="workspace-empty">Loading...</div>
                <div v-if="listError" class="workspace-empty" style="color: var(--red)">{{ listError }}</div>
              </div>
            </template>
          </template>

          <!-- File View (Editor or Markdown Preview) -->
          <template v-if="openFile">
            <div class="workspace-editor-bar">
              <span class="workspace-editor-filename">
                <i :class="fileIconByName(openFile)" style="margin-right: 6px"></i>
                {{ openFile }}
              </span>
              <div style="display: flex; gap: 6px; align-items: center">
                <button class="btn-ghost" @click="closeFile" style="padding: 3px 10px; font-size: 11px">
                  <i class="fa-solid fa-arrow-left" style="margin-right: 4px"></i>Back
                </button>
                <button v-if="isMarkdown" class="btn-ghost" style="padding: 3px 10px; font-size: 11px" @click="toggleMarkdownEdit">
                  <i :class="markdownEditMode ? 'fa-solid fa-eye' : 'fa-solid fa-pen'" style="margin-right: 4px"></i>
                  {{ markdownEditMode ? 'Preview' : 'Edit Source' }}
                </button>
                <span v-if="dirty" class="workspace-dirty-badge">Modified</span>
                <button v-if="!isMarkdown || markdownEditMode" class="btn-start" :disabled="!dirty || saving" @click="saveFile" style="padding: 4px 12px; font-size: 12px">
                  {{ saving ? 'Saving...' : 'Save' }}
                </button>
              </div>
            </div>
            <div v-if="fileLoading" class="workspace-empty">Loading file...</div>
            <div v-if="fileError" class="workspace-empty" style="color: var(--red)">{{ fileError }}</div>

            <!-- Markdown rendered preview -->
            <div v-if="isMarkdown && !markdownEditMode" ref="mdPreviewRef" class="workspace-md-preview" v-html="renderedMarkdown"></div>

            <!-- Monaco editor -->
            <div v-show="!isMarkdown || markdownEditMode" ref="editorContainerRef" class="workspace-editor-container"></div>
          </template>
        </div>

        <!-- Terminal resizer -->
        <div v-if="terminalOpen" class="workspace-resizer" @mousedown="startResizing"></div>

        <!-- Terminal side panel -->
        <div v-if="terminalOpen" class="workspace-terminal-panel" :style="{ width: terminalWidth + 'px' }">
          <div class="workspace-terminal-header">
            <span><i class="fa-solid fa-terminal" style="margin-right: 6px"></i>Terminal</span>
            <button class="btn-ghost" style="padding: 2px 8px; font-size: 11px" @click="toggleTerminal">Close</button>
          </div>
          <div ref="wsTermContainerRef" class="workspace-terminal-container" @click="focusWsTerm"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed, nextTick, onUnmounted, shallowRef } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { api } from '../composables/useApi.js'

const props = defineProps({
  show: { type: Boolean, default: false },
  nodeName: { type: String, default: null },
})

const emit = defineEmits(['close'])

const overlayMouseDown = ref(false)
function handleOverlayClick() {
  if (overlayMouseDown.value) {
    if (openFile.value) closeFile()
    else emit('close')
  }
  overlayMouseDown.value = false
}

function handleClose() {
  closeTerminal()
  emit('close')
}

// ── Search State ────────────────────────────
const searchInputRef = ref(null)
const searchQuery = ref('')
const searchResults = ref([])
const searchLoading = ref(false)
const searchActive = computed(() => searchQuery.value.length > 0)
let searchDebounce = null

function onSearchInput() {
  if (searchDebounce) clearTimeout(searchDebounce)
  if (!searchQuery.value.trim()) {
    searchResults.value = []
    return
  }
  searchDebounce = setTimeout(() => runSearch(), 300)
}

async function runSearch() {
  const q = searchQuery.value.trim()
  if (!q || !props.nodeName) return
  searchLoading.value = true
  const res = await api(`/api/processes/${encodeURIComponent(props.nodeName)}/search?q=${encodeURIComponent(q)}`)
  searchLoading.value = false
  if (res.error) return
  searchResults.value = res.results || []
}

function clearSearch() {
  searchQuery.value = ''
  searchResults.value = []
}

function openFileFromSearch(result) {
  openFileView(result.path, result.type === 'content' ? result.line : null)
}

// ── File Browser State ──────────────────────
const files = ref([])
const currentPath = ref('')
const listLoading = ref(false)
const listError = ref(null)
const selectedFiles = ref([])

const pathSegments = computed(() => {
  if (!currentPath.value) return []
  return currentPath.value.split('/').filter(Boolean)
})

const isAllInViewSelected = computed(() => {
  if (searchActive.value) {
    if (searchResults.value.length === 0) return false
    return searchResults.value.every((r) => selectedFiles.value.includes(r.path))
  }
  if (files.value.length === 0) return false
  return files.value.every((f) => {
    const fullPath = currentPath.value ? `${currentPath.value}/${f.name}` : f.name
    return selectedFiles.value.includes(fullPath)
  })
})

function toggleSelectAllInView() {
  if (isAllInViewSelected.value) {
    if (searchActive.value) {
      searchResults.value.forEach((r) => {
        const idx = selectedFiles.value.indexOf(r.path)
        if (idx !== -1) selectedFiles.value.splice(idx, 1)
      })
    } else {
      files.value.forEach((f) => {
        const fullPath = currentPath.value ? `${currentPath.value}/${f.name}` : f.name
        const idx = selectedFiles.value.indexOf(fullPath)
        if (idx !== -1) selectedFiles.value.splice(idx, 1)
      })
    }
  } else {
    if (searchActive.value) {
      searchResults.value.forEach((r) => {
        if (!selectedFiles.value.includes(r.path)) selectedFiles.value.push(r.path)
      })
    } else {
      files.value.forEach((f) => {
        const fullPath = currentPath.value ? `${currentPath.value}/${f.name}` : f.name
        if (!selectedFiles.value.includes(fullPath)) selectedFiles.value.push(fullPath)
      })
    }
  }
}

function toggleFileSelection(path) {
  const idx = selectedFiles.value.indexOf(path)
  if (idx === -1) {
    selectedFiles.value.push(path)
  } else {
    selectedFiles.value.splice(idx, 1)
  }
}

async function fetchFiles(subPath) {
  if (!props.nodeName) return
  listLoading.value = true
  listError.value = null
  files.value = []
  const query = subPath ? `?path=${encodeURIComponent(subPath)}` : ''
  const res = await api(`/api/processes/${encodeURIComponent(props.nodeName)}/files${query}`)
  listLoading.value = false
  if (res.error) { listError.value = res.error; return }
  files.value = res.files || []
  currentPath.value = subPath || ''
}

function navigateTo(subPath) { fetchFiles(subPath) }

function navigateUp() {
  const segments = [...pathSegments.value]
  segments.pop()
  fetchFiles(segments.join('/'))
}

function handleFileClick(file) {
  if (file.isDirectory) {
    navigateTo(currentPath.value ? currentPath.value + '/' + file.name : file.name)
  } else {
    openFileView(currentPath.value ? currentPath.value + '/' + file.name : file.name)
  }
}

// ── Editor / Preview State ──────────────────
const openFile = ref(null)
const fileLoading = ref(false)
const fileError = ref(null)
const dirty = ref(false)
const saving = ref(false)
const editorContainerRef = ref(null)
const mdPreviewRef = ref(null)
const markdownEditMode = ref(false)
const renderedMarkdown = ref('')

let editorInstance = null
let monacoModule = shallowRef(null)
let markedModule = null
let mermaidModule = null
let mermaidId = 0
let originalContent = ''

const isMarkdown = computed(() => {
  if (!openFile.value) return false
  return openFile.value.toLowerCase().endsWith('.md')
})

async function loadMarked() {
  if (markedModule) return markedModule
  markedModule = await import('marked')
  const { marked } = markedModule

  const renderer = new marked.Renderer()
  const origCode = renderer.code.bind(renderer)
  renderer.code = function ({ text, lang }) {
    if (lang === 'mermaid') {
      const id = `mermaid-${++mermaidId}`
      return `<div class="mermaid-placeholder" data-mermaid-id="${id}">${escapeHtml(text)}</div>`
    }
    return origCode({ text, lang })
  }
  marked.setOptions({ renderer })
  return markedModule
}

async function loadMermaid() {
  if (mermaidModule) return mermaidModule
  const mod = await import('mermaid')
  mermaidModule = mod.default
  mermaidModule.initialize({ startOnLoad: false, theme: 'dark' })
  return mermaidModule
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderMarkdown(content) {
  if (!markedModule) return ''
  const { marked } = markedModule
  return marked.parse(content)
}

async function renderMermaidBlocks() {
  await nextTick()
  if (!mdPreviewRef.value) return
  const placeholders = mdPreviewRef.value.querySelectorAll('.mermaid-placeholder')
  if (!placeholders.length) return

  const mermaid = await loadMermaid()
  for (const el of placeholders) {
    const id = el.getAttribute('data-mermaid-id')
    const code = el.textContent
    try {
      const { svg } = await mermaid.render(id, code)
      el.innerHTML = svg
      el.classList.add('mermaid-rendered')
    } catch {
      el.classList.add('mermaid-error')
    }
  }
}

async function toggleMarkdownEdit() {
  if (markdownEditMode.value) {
    if (editorInstance) {
      originalContent = dirty.value ? editorInstance.getValue() : originalContent
      renderedMarkdown.value = renderMarkdown(editorInstance.getValue())
    }
    markdownEditMode.value = false
    await renderMermaidBlocks()
  } else {
    markdownEditMode.value = true
    await nextTick()
    if (!editorInstance && editorContainerRef.value) {
      await createEditor(openFile.value, originalContent)
    }
  }
}

const EXT_TO_LANG = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  json: 'json', html: 'html', htm: 'html',
  css: 'css', scss: 'scss', less: 'less',
  vue: 'html', svelte: 'html',
  md: 'markdown', yaml: 'yaml', yml: 'yaml',
  xml: 'xml', svg: 'xml',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  ps1: 'powershell', psm1: 'powershell',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
  java: 'java', c: 'c', cpp: 'cpp', h: 'cpp',
  cs: 'csharp', php: 'php', sql: 'sql',
  toml: 'ini', ini: 'ini', env: 'ini',
  dockerfile: 'dockerfile',
}

function getLang(filename) {
  const lower = filename.toLowerCase()
  if (lower === 'dockerfile') return 'dockerfile'
  const ext = lower.split('.').pop()
  return EXT_TO_LANG[ext] || 'plaintext'
}

async function loadMonaco() {
  if (monacoModule.value) return monacoModule.value
  const monaco = await import('monaco-editor')

  self.MonacoEnvironment = {
    getWorker(_, label) {
      if (label === 'json') return new Worker(new URL('monaco-editor/esm/vs/language/json/json.worker.js', import.meta.url), { type: 'module' })
      if (label === 'css' || label === 'scss' || label === 'less') return new Worker(new URL('monaco-editor/esm/vs/language/css/css.worker.js', import.meta.url), { type: 'module' })
      if (label === 'html' || label === 'handlebars' || label === 'razor') return new Worker(new URL('monaco-editor/esm/vs/language/html/html.worker.js', import.meta.url), { type: 'module' })
      if (label === 'typescript' || label === 'javascript') return new Worker(new URL('monaco-editor/esm/vs/language/typescript/ts.worker.js', import.meta.url), { type: 'module' })
      return new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), { type: 'module' })
    },
  }

  monacoModule.value = monaco
  return monaco
}

async function openFileView(filePath, goToLine) {
  openFile.value = filePath
  fileLoading.value = true
  fileError.value = null
  dirty.value = false
  markdownEditMode.value = false
  renderedMarkdown.value = ''

  const res = await api(`/api/processes/${encodeURIComponent(props.nodeName)}/file?path=${encodeURIComponent(filePath)}`)
  fileLoading.value = false
  if (res.error) { fileError.value = res.error; return }

  originalContent = res.content

  if (filePath.toLowerCase().endsWith('.md')) {
    await loadMarked()
    renderedMarkdown.value = renderMarkdown(res.content)
    await renderMermaidBlocks()
  } else {
    await nextTick()
    await createEditor(filePath, res.content, goToLine)
  }
}

async function createEditor(filePath, content, goToLine) {
  disposeEditor()
  if (!editorContainerRef.value) return

  const monaco = await loadMonaco()
  editorInstance = monaco.editor.create(editorContainerRef.value, {
    value: content,
    language: getLang(filePath),
    theme: 'vs-dark',
    minimap: { enabled: false },
    fontSize: 13,
    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', 'Menlo', monospace",
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 2,
    wordWrap: 'on',
    padding: { top: 8 },
  })

  editorInstance.onDidChangeModelContent(() => {
    dirty.value = editorInstance.getValue() !== originalContent
  })

  editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    if (dirty.value) saveFile()
  })

  if (goToLine) {
    editorInstance.revealLineInCenter(goToLine)
    editorInstance.setPosition({ lineNumber: goToLine, column: 1 })
    editorInstance.focus()
  }
}

function disposeEditor() {
  if (editorInstance) { editorInstance.dispose(); editorInstance = null }
}

function closeFile() {
  disposeEditor()
  openFile.value = null
  fileError.value = null
  dirty.value = false
  markdownEditMode.value = false
  renderedMarkdown.value = ''
}

async function saveFile() {
  if (!editorInstance || !openFile.value) return
  saving.value = true
  const res = await api(`/api/processes/${encodeURIComponent(props.nodeName)}/file`, 'PUT', {
    path: openFile.value,
    content: editorInstance.getValue(),
  })
  saving.value = false
  if (res.error) { fileError.value = res.error; return }
  originalContent = editorInstance.getValue()
  dirty.value = false
}

// ── Embedded Terminal ───────────────────────
const terminalOpen = ref(false)
const terminalWidth = ref(420)
const wsTermContainerRef = ref(null)

let isResizing = false

function startResizing(e) {
  isResizing = true
  document.addEventListener('mousemove', doResizing)
  document.addEventListener('mouseup', stopResizing)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function doResizing(e) {
  if (!isResizing) return
  // Calculate new width: total width - mouse X position
  // But wait, the modal is centered. It's easier to use the current width and the delta.
  // Actually, since it's on the right:
  const modalRect = document.querySelector('.workspace-modal').getBoundingClientRect()
  const newWidth = modalRect.right - e.clientX
  if (newWidth > 200 && newWidth < modalRect.width - 200) {
    terminalWidth.value = newWidth
    nextTick(() => fitWsTerm())
  }
}

function stopResizing() {
  isResizing = false
  document.removeEventListener('mousemove', doResizing)
  document.removeEventListener('mouseup', stopResizing)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

let wsTerm = null
let wsTermFitAddon = null
let wsTermWs = null
let wsTermRetryTimer = null
let wsTermResizeObserver = null

const TERM_THEME = {
  background: '#0f1117',
  foreground: '#e1e4ed',
  cursor: '#60a5fa',
  selectionBackground: 'rgba(96, 165, 250, 0.3)',
  black: '#1a1d27', red: '#f87171', green: '#34d399', yellow: '#fbbf24',
  blue: '#60a5fa', magenta: '#a78bfa', cyan: '#22d3ee', white: '#e1e4ed',
  brightBlack: '#8b8fa3', brightRed: '#fca5a5', brightGreen: '#6ee7b7', brightYellow: '#fde68a',
  brightBlue: '#93c5fd', brightMagenta: '#c4b5fd', brightCyan: '#67e8f9', brightWhite: '#f8fafc',
}

async function toggleTerminal() {
  if (terminalOpen.value) {
    closeTerminal()
  } else {
    terminalOpen.value = true
    await nextTick()
    createWsTerm()
    connectWsTerm(props.nodeName)
  }
}

function createWsTerm() {
  if (wsTerm || !wsTermContainerRef.value) return
  wsTerm = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', 'Menlo', monospace",
    theme: TERM_THEME,
    allowProposedApi: true,
  })

  wsTermFitAddon = new FitAddon()
  wsTerm.loadAddon(wsTermFitAddon)
  wsTerm.loadAddon(new WebLinksAddon())
  wsTerm.open(wsTermContainerRef.value)
  fitWsTerm()

  wsTermResizeObserver = new ResizeObserver(() => fitWsTerm())
  wsTermResizeObserver.observe(wsTermContainerRef.value)

  wsTerm.onResize(({ cols, rows }) => {
    if (wsTermWs && wsTermWs.readyState === 1) {
      wsTermWs.send(JSON.stringify({ type: 'resize', cols, rows }))
    }
  })

  wsTerm.onData((data) => {
    if (wsTermWs && wsTermWs.readyState === 1) {
      wsTermWs.send(JSON.stringify({ type: 'input', data }))
    }
  })
}

function fitWsTerm() {
  if (!wsTermFitAddon || !wsTerm) return
  try { wsTermFitAddon.fit() } catch {}
}

function focusWsTerm() {
  if (wsTerm) wsTerm.focus()
}

function connectWsTerm(name) {
  disconnectWsTerm()
  if (!name) return

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = `${proto}//${location.host}/ws/terminal?name=${encodeURIComponent(name)}`
  const localWs = new WebSocket(url)
  wsTermWs = localWs

  localWs.onmessage = (ev) => {
    if (wsTermWs === localWs && wsTerm) wsTerm.write(ev.data)
  }

  localWs.onclose = () => {
    if (wsTermWs !== localWs) return
    wsTermWs = null
    if (terminalOpen.value && props.nodeName === name) {
      wsTermRetryTimer = setTimeout(() => connectWsTerm(name), 1500)
    }
  }

  localWs.onerror = () => {}
}

function disconnectWsTerm() {
  if (wsTermRetryTimer) { clearTimeout(wsTermRetryTimer); wsTermRetryTimer = null }
  if (wsTermWs) { wsTermWs.close(); wsTermWs = null }
}

function destroyWsTerm() {
  if (wsTermResizeObserver) { wsTermResizeObserver.disconnect(); wsTermResizeObserver = null }
  if (wsTerm) { wsTerm.dispose(); wsTerm = null; wsTermFitAddon = null }
}

function closeTerminal() {
  terminalOpen.value = false
  disconnectWsTerm()
  destroyWsTerm()
}

// ── Icon Helpers ────────────────────────────
function fileIcon(file) {
  if (file.isDirectory) return 'fa-solid fa-folder file-icon-dir'
  return fileIconByName(file.name)
}

function fileIconByName(name) {
  const ext = name.split('.').pop().toLowerCase()
  if (['js', 'ts', 'mjs', 'cjs', 'jsx', 'tsx'].includes(ext)) return 'fa-solid fa-file-code file-icon-code'
  if (['json', 'yaml', 'yml', 'toml'].includes(ext)) return 'fa-solid fa-file-lines file-icon-config'
  if (['md', 'txt', 'rst'].includes(ext)) return 'fa-solid fa-file-lines file-icon-text'
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico'].includes(ext)) return 'fa-solid fa-file-image file-icon-image'
  return 'fa-solid fa-file file-icon-default'
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// ── Lifecycle ───────────────────────────────
watch(() => props.show, (val) => {
  if (val && props.nodeName) {
    currentPath.value = ''
    openFile.value = null
    selectedFiles.value = []
    clearSearch()
    fetchFiles('')
  } else if (!val) {
    disposeEditor()
    closeTerminal()
    openFile.value = null
    selectedFiles.value = []
    markdownEditMode.value = false
    renderedMarkdown.value = ''
  }
})

onUnmounted(() => {
  disposeEditor()
  closeTerminal()
})
</script>
