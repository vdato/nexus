const express = require('express');
const { spawn, execFileSync, exec } = require('child_process');
const kill = require('tree-kill');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const http = require('http');

const os = require('os');

// Ensure the running node's bin dir is in PATH (covers nvm-managed CLIs)
const nodeBinDir = path.dirname(process.execPath);
if (!process.env.PATH.split(':').includes(nodeBinDir)) {
  process.env.PATH = nodeBinDir + ':' + process.env.PATH;
}

// Ensure ~/.local/bin is in PATH (covers newly upgraded native CLIs like claude)
const localBinDir = path.join(os.homedir(), '.local', 'bin');
if (!process.env.PATH.split(':').includes(localBinDir)) {
  process.env.PATH = localBinDir + ':' + process.env.PATH;
}

// Ensure standard macOS binary paths are in PATH (crucial for launchd/background services)
['/usr/local/bin', '/opt/homebrew/bin'].forEach(dir => {
  if (fs.existsSync(dir) && !process.env.PATH.split(':').includes(dir)) {
    process.env.PATH = dir + ':' + process.env.PATH;
  }
});

const systemConfigPath = path.join(__dirname, 'system.config.json');
const systemConfig = fs.existsSync(systemConfigPath) ? JSON.parse(fs.readFileSync(systemConfigPath, 'utf-8')) : {};

const app = express();
const PORT = parseInt(process.env.PORT) || systemConfig.port || 1337;
const MAX_LOG_LINES = systemConfig.maxLogLines || 500;

const configPath = path.join(__dirname, 'processes.config.json');
let processConfigs = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf-8')) : [];

const envConfigPath = path.join(__dirname, 'env.config.json');
let envVars = {};
if (fs.existsSync(envConfigPath)) {
  envVars = JSON.parse(fs.readFileSync(envConfigPath, 'utf-8'));
}

const groupsConfigPath = path.join(__dirname, 'groups.config.json');
const DEFAULT_GROUP_DEFS = [
  { name: 'infra', color: '#a78bfa' },
  { name: 'frontend', color: '#60a5fa' },
  { name: 'backend', color: '#34d399' },
];
const DEFAULT_PALETTE = ['#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#f87171', '#fb923c', '#38bdf8'];

function isValidHexColor(s) {
  return typeof s === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s.trim());
}

function normalizeGroupEntry(raw, index) {
  if (typeof raw === 'string') {
    const name = raw.trim();
    if (!name) return null;
    return { name, color: DEFAULT_PALETTE[index % DEFAULT_PALETTE.length] };
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const name = String(raw.name ?? '').trim();
    if (!name) return null;
    let color = String(raw.color ?? '').trim();
    if (!isValidHexColor(color)) {
      color = DEFAULT_PALETTE[index % DEFAULT_PALETTE.length];
    } else {
      color = color.toLowerCase();
      if (color.length === 4) {
        color = `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
      }
    }
    return { name, color };
  }
  return null;
}

function normalizeGroupList(parsed) {
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const out = [];
  const seen = new Set();
  for (let i = 0; i < parsed.length; i++) {
    const entry = normalizeGroupEntry(parsed[i], i);
    if (!entry) continue;
    if (seen.has(entry.name)) continue;
    seen.add(entry.name);
    out.push(entry);
  }
  return out.length ? out : null;
}

let groupList = normalizeGroupList(DEFAULT_GROUP_DEFS) || [...DEFAULT_GROUP_DEFS];
if (fs.existsSync(groupsConfigPath)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(groupsConfigPath, 'utf-8'));
    const normalized = normalizeGroupList(parsed);
    if (normalized) {
      groupList = normalized;
      const hadOnlyStrings =
        Array.isArray(parsed) && parsed.length > 0 && parsed.every((x) => typeof x === 'string');
      if (hadOnlyStrings) {
        saveGroupsConfig();
      }
    }
  } catch {
    groupList = normalizeGroupList(DEFAULT_GROUP_DEFS) || [...DEFAULT_GROUP_DEFS];
  }
}
if (groupList.length === 0) {
  groupList = [...DEFAULT_GROUP_DEFS];
}

function saveGroupsConfig() {
  fs.writeFileSync(groupsConfigPath, JSON.stringify(groupList, null, 2) + '\n');
}

function saveConfig() {
  fs.writeFileSync(configPath, JSON.stringify(processConfigs, null, 2) + '\n');
}

function saveEnvConfig() {
  fs.writeFileSync(envConfigPath, JSON.stringify(envVars, null, 2) + '\n');
}

const processes = new Map();

// WebSocket clients per process: Map<processName, Set<WebSocket>>
const wsClients = new Map();

function broadcastPtyData(name, data) {
  const clients = wsClients.get(name);
  if (!clients || clients.size === 0) return;
  for (const ws of clients) {
    try { if (ws.readyState === 1) ws.send(data); } catch {}
  }
}

function disconnectPtyClients(name) {
  const clients = wsClients.get(name);
  if (!clients) return;
  for (const ws of clients) {
    try { ws.close(1000, 'PTY exited'); } catch {}
  }
}

const INPUT_PATTERNS = [
  /\?\s*$/m,           // lines ending with "?"
  />\s*$/m,            // interactive caret prompts
  /press enter/i,
  /\([yY]\/[nN]\)/,
  /do you want to/i,
];

function checkNeedsInput(entry, text) {
  if (!entry) return;
  if (INPUT_PATTERNS.some(p => p.test(text))) {
    entry.needsInput = true;
  }
}

function resolveTemplate(str) {
  if (!str) return str;
  return str.replace(/\{(\w+)\}/g, (match, key) => {
    return envVars[key] !== undefined ? envVars[key] : match;
  });
}

function getGitBranch(cwd) {
  if (!cwd) return null;
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd,
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'], // suppress stderr for non-git working directories
    }).trim();
  } catch {
    return null;
  }
}

function getState(name) {
  const entry = processes.get(name);
  if (!entry) return { status: 'stopped', pid: null, logs: [], startedAt: null };
  return {
    status: entry.status,
    pid: entry.proc?.pid ?? null,
    logs: entry.logs,
    startedAt: entry.startedAt,
    needsInput: entry.needsInput || false,
  };
}

let pty;
try {
  pty = require('node-pty-prebuilt-multiarch');
} catch(e1) {
  try {
    pty = require('node-pty');
  } catch(e2) {}
}

const { stripVTControlCharacters } = require('util');

function cleanAnsiLog(line) {
  // 1. Handle carriage returns properly. Take the final state in this line segment.
  const segments = line.split('\r');
  let text = segments[segments.length - 1];
  
  // 2. Strip non-color ANSI sequences (CSI sequences ending in A-L or N-Z etc.)
  // Keep sequences ending in 'm' (SGR)
  return text.replace(/\x1b\[[0-9;]*([A-LN-Z])/g, '');
}

function appendLog(entry, source, data) {
  const rawData = data.toString();
  // Split raw stream by newline
  const lines = rawData.split('\n');
  
  for (const line of lines) {
    if (line.length === 0) continue;

    // Clean the line (handle overwrites and strip movement codes)
    const cleanedLine = cleanAnsiLog(line);
    const visibleText = stripVTControlCharacters(cleanedLine).trim();
    
    // Drop single spinner characters or empty lines that spam raw logs
    const spinners = ['✻', '◐', '◓', '◑', '◒', '...', '⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    if (spinners.includes(visibleText)) continue;
    
    // De-duplicate if the last log is identical (anti-spam for redraws)
    const lastLog = entry.logs[entry.logs.length - 1];
    if (lastLog && stripVTControlCharacters(lastLog.text).trim() === visibleText && lastLog.source === source) {
      continue;
    }
    
    // Push the line with preserved colors to Vue
    entry.logs.push({ ts: Date.now(), source, text: cleanedLine });
    if (entry.logs.length > MAX_LOG_LINES) entry.logs.shift();
  }
}

function normalizeOnSuccess(value) {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    const arr = value.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim());
    return arr.length > 0 ? arr : undefined;
  }
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}

function triggerOnSuccess(entry, config) {
  if (!config.onSuccess) return;
  const targets = Array.isArray(config.onSuccess) ? config.onSuccess : [config.onSuccess];
  for (const target of targets) {
    if (!target) continue;
    appendLog(entry, 'system', `onSuccess: triggering "${target}"`);
    setImmediate(() => {
      const result = startProcess(target);
      if (result && result.error) appendLog(entry, 'system', `onSuccess "${target}" failed: ${result.error}`);
    });
  }
}

function getGeminiPath() {
  const possible = ['/opt/homebrew/bin/gemini', '/usr/local/bin/gemini', 'gemini'];
  for (const p of possible) {
    if (p.startsWith('/') && fs.existsSync(p)) return p;
  }
  return 'gemini';
}

function startProcess(name, resumeId = null) {
  const config = processConfigs.find((c) => c.name === name);
  if (!config) return { error: `Unknown process: ${name}` };

  const existing = processes.get(name);
  if (existing && existing.status === 'running') {
    return { error: `${name} is already running` };
  }

  const resolvedCwd = resolveTemplate(config.cwd);
  let resolvedArgs = (config.args || []).map(resolveTemplate);

  if (resumeId) {
    // Check if the command is gemini or node + gemini
    const isGemini = config.command.includes('gemini') || (resolvedArgs[0] && resolvedArgs[0].includes('gemini'));
    if (isGemini) {
      // Find existing -r or --resume and replace, or append
      const idx = resolvedArgs.findIndex(a => a === '-r' || a === '--resume');
      if (idx !== -1) {
        resolvedArgs[idx + 1] = resumeId;
      } else {
        resolvedArgs.push('--resume', resumeId);
      }
    }
  }

  const env = { ...process.env, PYTHONUNBUFFERED: '1', ...envVars };

  
  if (envVars.PATH) {
    // If the user provided a custom PATH, prepend it to the current PATH
    // to ensure it takes precedence without losing standard system paths.
    env.PATH = envVars.PATH + (process.env.PATH ? ':' + process.env.PATH : '');
  }
  let proc;
  const entry = {
    status: 'running',
    logs: [{ ts: Date.now(), source: 'system', text: `Spawning: ${config.command} ${resolvedArgs.join(' ')}` }],
    ptyRawBuffer: '',       // Raw PTY output for faithful xterm replay
    logRawBuffer: '',       // Raw non-PTY output for faithful xterm replay
    startedAt: Date.now(),
    config,
  };

  try {
    if (pty && config.usePty) {
      console.log(`[xpm] Spawning (pty): ${config.command} ${JSON.stringify(resolvedArgs)} cwd=${resolvedCwd || '(none)'}`);
      proc = pty.spawn('/usr/bin/env', [config.command, ...resolvedArgs], {
        name: 'xterm-256color',
        cols: 100,
        rows: 40,
        cwd: resolvedCwd || process.cwd(),
        env
      });

      entry.ptyProc = proc;  // Keep raw PTY ref for WebSocket resize/write

      proc.onData((data) => {
        appendLog(entry, 'stdout', data);
        broadcastPtyData(name, data);
        checkNeedsInput(entry, data.toString());
        // Buffer raw output for faithful replay on late-connecting terminals
        entry.ptyRawBuffer += data;
        // Cap buffer at ~256KB to avoid unbounded memory growth
        if (entry.ptyRawBuffer.length > 256 * 1024) {
          entry.ptyRawBuffer = entry.ptyRawBuffer.slice(-128 * 1024);
        }
      });

      proc.onExit(({ exitCode }) => {
        const wasStopping = entry.status === 'stopping';
        if (!wasStopping) {
          entry.status = exitCode === 0 ? 'stopped' : 'errored';
        } else {
          entry.status = 'stopped';
        }
        appendLog(entry, 'system', `Exited with code ${exitCode}`);
        entry.proc = null;
        entry.ptyProc = null;
        disconnectPtyClients(name);
        if (!wasStopping && exitCode === 0) triggerOnSuccess(entry, config);
      });
    } else {
      console.log(`[xpm] Spawning: ${config.command} ${JSON.stringify(resolvedArgs)} cwd=${resolvedCwd || '(none)'}`);
      proc = spawn(config.command, resolvedArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: resolvedCwd || undefined,
        env
      });

      const handleData = (data) => {
        appendLog(entry, 'stdout', data);
        broadcastPtyData(name, data);
        checkNeedsInput(entry, data.toString());
        entry.logRawBuffer += data;
        if (entry.logRawBuffer.length > 256 * 1024) {
          entry.logRawBuffer = entry.logRawBuffer.slice(-128 * 1024);
        }
      };

      proc.stdout.on('data', handleData);
      proc.stderr.on('data', handleData);

      proc.on('error', (err) => {
        entry.status = 'errored';
        appendLog(entry, 'system', `Process error: ${err.message}`);
      });

      proc.on('close', (code) => {
        const wasStopping = entry.status === 'stopping';
        if (!wasStopping) {
          entry.status = code === 0 ? 'stopped' : 'errored';
        } else {
          entry.status = 'stopped';
        }
        appendLog(entry, 'system', `Exited with code ${code}`);
        entry.proc = null;
        disconnectPtyClients(name);
        if (!wasStopping && code === 0) triggerOnSuccess(entry, config);
      });
    }
  } catch (err) {
    entry.status = 'errored';
    appendLog(entry, 'system', `Failed to start process: ${err.message}`);
    processes.set(name, entry);
    return { error: err.message };
  }

  // To support both pty.js (write) and child_process.spawn (stdin.write)
  entry.proc = {
    stdin: proc.stdin || {
      write: (data) => proc.write(data),
      destroyed: false
    },
    pid: proc.pid,
    kill: (signal) => proc.kill(signal)
  };

  processes.set(name, entry);
  return { ok: true };
}

function stopProcess(name) {
  const entry = processes.get(name);
  if (!entry || entry.status !== 'running' || !entry.proc) {
    return { error: `${name} is not running` };
  }

  entry.status = 'stopping';
  const config = entry.config;

  if (config.stopCommand) {
    spawn(config.stopCommand.command, config.stopCommand.args || [], {
      stdio: 'ignore',
    });
    setTimeout(() => {
      if (entry.proc) {
        kill(entry.proc.pid, 'SIGKILL');
      }
    }, 5000);
  } else {
    kill(entry.proc.pid, 'SIGTERM', (err) => {
      if (err) {
        appendLog(entry, 'system', `Kill error: ${err.message}`);
      }
    });
  }

  return { ok: true };
}

// Serve Vue build output from dist/, fall back to legacy public/
const distDir = path.join(__dirname, 'dist');
const publicDir = path.join(__dirname, 'public');

app.use(express.json());

app.get('/api/processes', (_req, res) => {
  const result = processConfigs.map((config) => {
    const state = getState(config.name);
    const resolvedCwd = resolveTemplate(config.cwd);
    return {
      name: config.name,
      type: config.type || 'service',
      group: config.group,
      command: `${config.command} ${(config.args || []).map(resolveTemplate).join(' ')}`.trim(),
      cwd: config.cwd || null,
      resolvedCwd: resolvedCwd || null,
      branch: getGitBranch(resolvedCwd),
      usePty: !!config.usePty,
      status: state.status,
      pid: state.pid,
      startedAt: state.startedAt,
      needsInput: state.needsInput,
    };
  });
  res.json(result);
});

app.get('/api/system', (req, res) => {
  res.json({
    port: systemConfig.port || 1337,
    maxLogLines: systemConfig.maxLogLines || 500,
    logPollInterval: systemConfig.logPollInterval || 500,
    statusPollInterval: systemConfig.statusPollInterval || 3000,
    popoverPollInterval: systemConfig.popoverPollInterval || 1500,
  });
});

app.get('/api/processes/:name/logs', (req, res) => {
  const since = parseInt(req.query.since) || 0;
  const state = getState(req.params.name);
  const logs = state.logs.filter((l) => l.ts > since);
  res.json(logs);
});

app.use(express.text());

app.post('/api/processes/:name/stdin', (req, res) => {
  const name = req.params.name;
  const entry = processes.get(name);
  if (!entry || entry.status !== 'running' || !entry.proc) {
    return res.status(400).json({ error: `${name} is not running` });
  }
  if (!entry.proc.stdin || entry.proc.stdin.destroyed) {
    return res.status(400).json({ error: `${name} stdin is not available` });
  }
  
  entry.needsInput = false;
  
  const input = req.body.input !== undefined ? req.body.input : (typeof req.body === 'string' ? req.body : '');
  // Send exactly \r (Return key payload) because Raw mode drops \n and \r\n can confuse TUI prompts
  entry.proc.stdin.write(input + '\r');
  appendLog(entry, 'stdin', input);
  res.json({ ok: true });
});

function listGeminiSessions(cwd) {
  return new Promise((resolve, reject) => {
    const gemini = getGeminiPath();
    const execOpts = { env: { ...process.env, ...envVars } };
    if (cwd && fs.existsSync(cwd)) execOpts.cwd = cwd;

    const parse = (out) => {
      const sessions = [];
      const regex = /^\s*(\d+)\.\s+(.+?)\s+\((.+?)\)\s+\[(.+?)\]/;
      for (const line of out.split('\n')) {
        const m = line.match(regex);
        if (m) sessions.push({ index: parseInt(m[1]), title: m[2], time: m[3], id: m[4] });
      }
      return sessions;
    };

    exec(`node ${gemini} --list-sessions`, execOpts, (error, stdout, stderr) => {
      if (error && stdout.includes('SyntaxError')) {
        const brewNode = '/opt/homebrew/bin/node';
        const brewGemini = '/opt/homebrew/bin/gemini';
        if (fs.existsSync(brewNode) && fs.existsSync(brewGemini)) {
          return exec(`${brewNode} ${brewGemini} --list-sessions`, execOpts, (err2, out2, serr2) => {
            if (err2 && !out2) return reject({ error: err2.message, stderr: serr2 });
            resolve(parse(out2));
          });
        }
      }
      if (error && !stdout) return reject({ error: error.message, stderr });
      resolve(parse(stdout));
    });
  });
}

app.get('/api/gemini/sessions', (req, res) => {
  listGeminiSessions()
    .then((sessions) => res.json(sessions))
    .catch((err) => res.status(500).json(err));
});

app.get('/api/processes/:name/sessions', (req, res) => {
  const config = processConfigs.find((c) => c.name === req.params.name);
  if (!config) return res.status(404).json({ error: `Unknown process: ${req.params.name}` });
  listGeminiSessions(resolveTemplate(config.cwd))
    .then((sessions) => res.json(sessions))
    .catch((err) => res.status(500).json(err));
});

app.post('/api/processes/:name/start', (req, res) => {
  res.json(startProcess(req.params.name));
});

app.post('/api/processes/:name/resume/:id', async (req, res) => {
  const { name, id } = req.params;
  const config = processConfigs.find((c) => c.name === name);
  if (!config) return res.status(404).json({ error: `Unknown process: ${name}` });

  try {
    const sessions = await listGeminiSessions(resolveTemplate(config.cwd));
    const found = sessions.some((s) => s.id === id || String(s.index) === String(id));
    if (!found) {
      return res.status(404).json({
        error: `Session "${id}" is no longer available. The session list may be stale — refresh and try again.`,
        staleSession: true,
      });
    }
  } catch (err) {
    return res.status(500).json({ error: `Failed to verify session: ${err.error || err.message}` });
  }

  res.json(startProcess(name, id));
});

app.post('/api/processes/:name/stop', (req, res) => {
  res.json(stopProcess(req.params.name));
});

app.post('/api/processes/:name/restart', async (req, res) => {
  const name = req.params.name;
  const entry = processes.get(name);
  if (entry && entry.status === 'running') {
    stopProcess(name);
    const wait = () =>
      new Promise((resolve) => {
        const check = setInterval(() => {
          const s = getState(name);
          if (s.status !== 'running' && s.status !== 'stopping') {
            clearInterval(check);
            resolve();
          }
        }, 200);
        setTimeout(() => {
          clearInterval(check);
          resolve();
        }, 10000);
      });
    await wait();
  }
  res.json(startProcess(name));
});

app.get('/api/processes/:name/files', (req, res) => {
  const name = req.params.name;
  const config = processConfigs.find(c => c.name === name);
  if (!config || !config.cwd) return res.status(404).json({ error: 'Process or CWD not found' });

  const resolvedCwd = resolveTemplate(config.cwd);
  const subPath = req.query.path || '';
  const targetDir = subPath ? path.resolve(resolvedCwd, subPath) : resolvedCwd;

  // Prevent directory traversal outside the workspace
  if (!targetDir.startsWith(resolvedCwd)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    const files = entries
      .filter(e => !e.name.startsWith('.'))
      .map(e => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        size: e.isFile() ? (fs.statSync(path.join(targetDir, e.name)).size) : null,
      }))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    res.json({ path: subPath || '.', files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/processes/:name/search', (req, res) => {
  const name = req.params.name;
  const config = processConfigs.find(c => c.name === name);
  if (!config || !config.cwd) return res.status(404).json({ error: 'Process or CWD not found' });

  const resolvedCwd = resolveTemplate(config.cwd);
  const query = (req.query.q || '').trim();
  if (!query) return res.json({ results: [] });

  const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '__pycache__', '.venv', 'vendor', 'coverage']);
  const MAX_RESULTS = 80;
  const MAX_FILE_SIZE = 512 * 1024; // skip files >512KB for content search
  const results = [];
  const queryLower = query.toLowerCase();

  function walk(dir, rel) {
    if (results.length >= MAX_RESULTS) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (results.length >= MAX_RESULTS) return;
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = rel ? rel + '/' + entry.name : entry.name;

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(fullPath, relPath);
        continue;
      }

      // File name match
      if (entry.name.toLowerCase().includes(queryLower)) {
        results.push({ path: relPath, type: 'file' });
        continue;
      }

      // Content match — only text files under size limit
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size > MAX_FILE_SIZE) continue;
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(queryLower)) {
            results.push({
              path: relPath,
              type: 'content',
              line: i + 1,
              text: lines[i].trim().substring(0, 200),
            });
            break; // one match per file
          }
        }
      } catch { /* binary or unreadable — skip */ }
    }
  }

  walk(resolvedCwd, '');
  res.json({ results });
});

app.get('/api/processes/:name/file', (req, res) => {
  const name = req.params.name;
  const config = processConfigs.find(c => c.name === name);
  if (!config || !config.cwd) return res.status(404).json({ error: 'Process or CWD not found' });

  const resolvedCwd = resolveTemplate(config.cwd);
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'path is required' });

  const fullPath = path.resolve(resolvedCwd, filePath);
  if (!fullPath.startsWith(resolvedCwd)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const stat = fs.statSync(fullPath);
    if (stat.size > 2 * 1024 * 1024) {
      return res.status(413).json({ error: 'File too large (>2MB)' });
    }
    const content = fs.readFileSync(fullPath, 'utf-8');
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/processes/:name/file', (req, res) => {
  const name = req.params.name;
  const config = processConfigs.find(c => c.name === name);
  if (!config || !config.cwd) return res.status(404).json({ error: 'Process or CWD not found' });

  const resolvedCwd = resolveTemplate(config.cwd);
  const filePath = req.body.path;
  const content = req.body.content;
  const encoding = req.body.encoding || 'utf-8';
  
  if (!filePath || content == null) return res.status(400).json({ error: 'path and content are required' });

  const fullPath = path.resolve(resolvedCwd, filePath);
  if (!fullPath.startsWith(resolvedCwd)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    fs.writeFileSync(fullPath, content, encoding);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/processes/:name/ai-command', (req, res) => {
  const name = req.params.name;
  const config = processConfigs.find(c => c.name === name);
  if (!config || !config.cwd) return res.status(404).json({ error: 'Process or CWD not found' });

  const resolvedCwd = resolveTemplate(config.cwd);
  const { prompt, files, tool } = req.body;
  if (!files || !Array.isArray(files)) {
    return res.status(400).json({ error: 'files array is required' });
  }

  let combinedContext = prompt ? `Prompt:\n${prompt}\n\nContext files:\n\n` : "Context files:\n\n";

  for (const file of files) {
    const fullPath = path.resolve(resolvedCwd, file);
    if (!fullPath.startsWith(resolvedCwd)) {
      return res.status(403).json({ error: `Access denied for file ${file}` });
    }
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      combinedContext += `--- FILE: ${file} ---\n${content}\n\n`;
    } catch (err) {
      combinedContext += `--- FILE: ${file} ---\n(Failed to read: ${err.message})\n\n`;
    }
  }

  const executable = tool === 'claude' ? 'claude' : 'gemini'; 
  
  const proc = spawn(executable, [], {
    cwd: resolvedCwd,
    env: process.env
  });

  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Transfer-Encoding', 'chunked');

  proc.stdout.on('data', (data) => res.write(data));
  proc.stderr.on('data', (data) => res.write(`[STDERR] ${data}`));
  
  proc.on('close', (code) => {
    res.end();
  });
  
  proc.on('error', (err) => {
    res.write(`\n[Error starting CLI: ${err.message}]\nEnsure '${executable}' is installed and in your PATH.`);
    res.end();
  });

  // Pass the generated context to the CLI via stdin
  proc.stdin.write(combinedContext);
  proc.stdin.end();
});

app.get('/api/processes/:name/git/branches', async (req, res) => {
  const name = req.params.name;
  const config = processConfigs.find(c => c.name === name);
  if (!config || !config.cwd) return res.status(404).json({ error: 'Process or CWD not found' });
  
  const resolvedCwd = resolveTemplate(config.cwd);
  try {
    const output = execFileSync('git', ['branch', '--format=%(refname:short)'], {
      cwd: resolvedCwd,
      encoding: 'utf-8',
      timeout: 5000
    });
    const branches = output.trim().split('\n').filter(Boolean);
    res.json({
      branches,
      current: getGitBranch(resolvedCwd)
    });
  } catch (err) {
    res.status(500).json({ error: `Failed to list branches: ${err.message}` });
  }
});

app.post('/api/processes/:name/git/checkout', async (req, res) => {
  const name = req.params.name;
  const { branch, strategy } = req.body;
  const config = processConfigs.find(c => c.name === name);
  if (!config || !config.cwd) return res.status(404).json({ error: 'Process or CWD not found' });
  if (!branch) return res.status(400).json({ error: 'Branch name is required' });

  const resolvedCwd = resolveTemplate(config.cwd);
  try {
    if (strategy === 'stash') {
      execFileSync('git', ['stash'], { cwd: resolvedCwd, encoding: 'utf-8', timeout: 10000 });
    } else if (strategy === 'discard') {
      execFileSync('git', ['reset', '--hard'], { cwd: resolvedCwd, encoding: 'utf-8', timeout: 10000 });
      execFileSync('git', ['clean', '-fd'], { cwd: resolvedCwd, encoding: 'utf-8', timeout: 10000 });
    }

    execFileSync('git', ['checkout', branch], {
      cwd: resolvedCwd,
      encoding: 'utf-8',
      timeout: 10000
    });
    res.json({ ok: true });
  } catch (err) {
    const msg = err.stderr || err.message;
    if (msg.includes('local changes to the following files would be overwritten')) {
      return res.status(409).json({ error: 'CONFLICT', message: msg });
    }
    res.status(500).json({ error: `Git checkout failed: ${msg}` });
  }
});

app.post('/api/processes/:name/git/remote-status', async (req, res) => {
  const name = req.params.name;
  const config = processConfigs.find(c => c.name === name);
  if (!config || !config.cwd) return res.status(404).json({ error: 'Process or CWD not found' });
  
  const resolvedCwd = resolveTemplate(config.cwd);
  try {
    // 1. Fetch
    try {
      execFileSync('git', ['fetch'], { cwd: resolvedCwd, timeout: 15000 });
    } catch (e) {
      // If fetch fails (no remote, network issues), we still try to compare with existing tracking info
    }
    
    // 2. Compare
    const local = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: resolvedCwd, encoding: 'utf-8' }).trim();
    let remote;
    try {
      remote = execFileSync('git', ['rev-parse', '@{u}'], { cwd: resolvedCwd, encoding: 'utf-8' }).trim();
    } catch {
      return res.json({ status: 'no-remote' });
    }
    
    if (local === remote) {
      return res.json({ status: 'up-to-date' });
    }
    
    const base = execFileSync('git', ['merge-base', 'HEAD', '@{u}'], { cwd: resolvedCwd, encoding: 'utf-8' }).trim();
    
    if (local === base) {
      return res.json({ status: 'behind' });
    } else if (remote === base) {
      return res.json({ status: 'ahead' });
    } else {
      return res.json({ status: 'diverged' });
    }
  } catch (err) {
    res.status(500).json({ error: `Git status check failed: ${err.message}` });
  }
});

app.post('/api/processes/:name/git/pull', async (req, res) => {
  const name = req.params.name;
  const { strategy } = req.body || {};
  const config = processConfigs.find(c => c.name === name);
  if (!config || !config.cwd) return res.status(404).json({ error: 'Process or CWD not found' });
  
  const resolvedCwd = resolveTemplate(config.cwd);
  try {
    if (strategy === 'stash') {
      execFileSync('git', ['stash'], { cwd: resolvedCwd, encoding: 'utf-8', timeout: 10000 });
    } else if (strategy === 'discard') {
      execFileSync('git', ['reset', '--hard'], { cwd: resolvedCwd, encoding: 'utf-8', timeout: 10000 });
      execFileSync('git', ['clean', '-fd'], { cwd: resolvedCwd, encoding: 'utf-8', timeout: 10000 });
    }

    execFileSync('git', ['pull'], { cwd: resolvedCwd, timeout: 30000 });
    res.json({ ok: true });
  } catch (err) {
    const msg = err.stderr || err.message;
    if (msg.includes('local changes to the following files would be overwritten')) {
      return res.status(409).json({ error: 'CONFLICT', message: msg });
    }
    res.status(500).json({ error: `Git pull failed: ${msg}` });
  }
});

app.post('/api/browse-directory', (req, res) => {
  const startDir = req.body.startDir || os.homedir();
  const platform = os.platform();
  let cmd, args;

  if (platform === 'darwin') {
    const script = `
      set defaultDir to POSIX file "${startDir.replace(/"/g, '\\"')}"
      try
        set chosenFolder to POSIX path of (choose folder with prompt "Select Working Directory" default location defaultDir)
        return chosenFolder
      on error
        return "__CANCELLED__"
      end try
    `;
    cmd = 'osascript';
    args = ['-e', script];
  } else if (platform === 'win32') {
    const psScript = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.SelectedPath = '${startDir.replace(/'/g, "''")}'; $f.Description = 'Select Working Directory'; if ($f.ShowDialog() -eq 'OK') { $f.SelectedPath } else { '__CANCELLED__' }`;
    cmd = 'powershell';
    args = ['-NoProfile', '-Command', psScript];
  } else {
    // Linux: try zenity, fall back to kdialog
    cmd = 'zenity';
    args = ['--file-selection', '--directory', '--title=Select Working Directory', `--filename=${startDir}/`];
  }

  try {
    const result = execFileSync(cmd, args, {
      encoding: 'utf-8',
      timeout: 60000,
    }).trim();
    if (!result || result === '__CANCELLED__') {
      return res.json({ cancelled: true });
    }
    // Remove trailing slash unless it's the root
    const dir = result.length > 1 ? result.replace(/[/\\]$/, '') : result;
    res.json({ path: dir });
  } catch (err) {
    // zenity failed on Linux — try kdialog
    if (platform === 'linux') {
      try {
        const result = execFileSync('kdialog', ['--getexistingdirectory', startDir, '--title', 'Select Working Directory'], {
          encoding: 'utf-8',
          timeout: 60000,
        }).trim();
        if (result) return res.json({ path: result });
      } catch {}
    }
    res.json({ cancelled: true });
  }
});

app.post('/api/start-all', (_req, res) => {
  const results = {};
  for (const config of processConfigs) {
    results[config.name] = startProcess(config.name);
  }
  res.json(results);
});

app.post('/api/stop-all', (_req, res) => {
  const results = {};
  for (const config of processConfigs) {
    results[config.name] = stopProcess(config.name);
  }
  res.json(results);
});

app.post('/api/config/import', (req, res) => {
  const items = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Body must be a JSON array of process configs' });
  }
  const added = [];
  const skipped = [];
  for (const item of items) {
    if (!item.name || !item.command) {
      skipped.push({ name: item.name || '(unnamed)', reason: 'missing name or command' });
      continue;
    }
    if (processConfigs.some((c) => c.name === item.name)) {
      skipped.push({ name: item.name, reason: 'already exists' });
      continue;
    }
    const entry = { name: item.name, command: item.command, args: item.args || [], type: item.type || 'service', group: item.group || 'other' };
    if (item.cwd) entry.cwd = item.cwd;
    if (item.stopCommand) entry.stopCommand = item.stopCommand;
    if (item.usePty !== undefined) entry.usePty = !!item.usePty;
    const onSuccessNormalized = normalizeOnSuccess(item.onSuccess);
    if (onSuccessNormalized !== undefined) entry.onSuccess = onSuccessNormalized;
    processConfigs.push(entry);
    added.push(item.name);
  }
  if (added.length > 0) saveConfig();
  res.json({ added, skipped });
});

app.post('/api/config', (req, res) => {
  const { name, command, args, cwd, type, group, stopCommand, usePty, onSuccess } = req.body;
  if (!name || !command) {
    return res.status(400).json({ error: 'name and command are required' });
  }
  if (processConfigs.some((c) => c.name === name)) {
    return res.status(409).json({ error: `Process "${name}" already exists` });
  }
  const entry = { name, command, args: args || [], type: type || 'service', group: group || 'other' };
  if (cwd) entry.cwd = cwd;
  if (stopCommand) entry.stopCommand = stopCommand;
  if (usePty !== undefined) entry.usePty = !!usePty;
  const onSuccessNormalized = normalizeOnSuccess(onSuccess);
  if (onSuccessNormalized !== undefined) entry.onSuccess = onSuccessNormalized;
  processConfigs.push(entry);
  saveConfig();
  res.json({ ok: true });
});

app.get('/api/config/:name', (req, res) => {
  const config = processConfigs.find((c) => c.name === req.params.name);
  if (!config) {
    return res.status(404).json({ error: `Process "${req.params.name}" not found` });
  }
  res.json(config);
});

app.put('/api/config/:name', (req, res) => {
  const oldName = req.params.name;
  const idx = processConfigs.findIndex((c) => c.name === oldName);
  if (idx === -1) {
    return res.status(404).json({ error: `Process "${oldName}" not found` });
  }
  const { name: newName, command, args, cwd, type, group, stopCommand, usePty, onSuccess } = req.body;
  if (!command) {
    return res.status(400).json({ error: 'command is required' });
  }
  const finalName = (newName && newName.trim()) ? newName.trim() : oldName;
  if (finalName !== oldName && processConfigs.some((c) => c.name === finalName)) {
    return res.status(409).json({ error: `Process "${finalName}" already exists` });
  }
  const updated = { name: finalName, command, args: args || [], type: type || 'service', group: group || 'other' };
  if (cwd) updated.cwd = cwd;
  if (stopCommand) updated.stopCommand = stopCommand;
  if (usePty !== undefined) updated.usePty = !!usePty;
  const onSuccessNormalized = normalizeOnSuccess(onSuccess);
  if (onSuccessNormalized !== undefined) updated.onSuccess = onSuccessNormalized;
  processConfigs[idx] = updated;
  saveConfig();

  if (finalName !== oldName) {
    const entry = processes.get(oldName);
    if (entry) {
      processes.delete(oldName);
      processes.set(finalName, entry);
    }
  }

  res.json({ ok: true });
});

app.delete('/api/config/:name', (req, res) => {
  const name = req.params.name;
  const idx = processConfigs.findIndex((c) => c.name === name);
  if (idx === -1) {
    return res.status(404).json({ error: `Process "${name}" not found` });
  }
  const running = processes.get(name);
  if (running && running.status === 'running') {
    stopProcess(name);
  }
  processConfigs.splice(idx, 1);
  processes.delete(name);
  saveConfig();
  res.json({ ok: true });
});

app.get('/api/env', (_req, res) => {
  res.json(envVars);
});

app.put('/api/env', (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Body must be a JSON object of key-value pairs' });
  }
  envVars = body;
  saveEnvConfig();
  res.json({ ok: true });
});

app.put('/api/system', (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Body must be a JSON object' });
  }
  const allowed = ['port', 'maxLogLines', 'logPollInterval', 'statusPollInterval', 'popoverPollInterval'];
  for (const key of allowed) {
    if (body[key] !== undefined) systemConfig[key] = body[key];
  }
  fs.writeFileSync(systemConfigPath, JSON.stringify(systemConfig, null, 2) + '\n');
  res.json({ ok: true, note: 'Restart server for port/maxLogLines changes to take effect' });
});

app.get('/api/groups', (_req, res) => {
  res.json(groupList);
});

app.put('/api/groups', (req, res) => {
  const body = req.body;
  if (!Array.isArray(body)) {
    return res.status(400).json({ error: 'Body must be a JSON array of { name, color } objects' });
  }
  const seen = new Set();
  const out = [];
  for (let i = 0; i < body.length; i++) {
    const raw = body[i];
    let name;
    let color;
    if (typeof raw === 'string') {
      name = raw.trim();
      color = DEFAULT_PALETTE[out.length % DEFAULT_PALETTE.length];
    } else if (raw && typeof raw === 'object') {
      name = String(raw.name ?? '').trim();
      color = String(raw.color ?? '').trim();
      if (!isValidHexColor(color)) {
        return res.status(400).json({ error: `Invalid color for group "${name || '(unnamed)'}" (use #RGB or #RRGGBB)` });
      }
      color = color.toLowerCase();
      if (color.length === 4) {
        color = `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
      }
    } else {
      continue;
    }
    if (!name) continue;
    if (seen.has(name)) {
      return res.status(400).json({ error: `Duplicate group name: "${name}"` });
    }
    seen.add(name);
    out.push({ name, color });
  }
  if (out.length === 0) {
    return res.status(400).json({ error: 'At least one group is required' });
  }
  groupList = out;
  saveGroupsConfig();
  res.json({ ok: true });
});

async function bootstrap() {
  if (process.env.NODE_ENV === 'development') {
    const { createServer } = require('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    // Serve index.html with Vite's HMR transformation
    app.get('*', async (req, res, next) => {
      const url = req.originalUrl;
      if (url.startsWith('/api') || url.startsWith('/ws')) return next();
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    app.use(express.static(fs.existsSync(distDir) ? distDir : publicDir));
    app.get('*', (req, res) => {
      res.sendFile(path.join(fs.existsSync(distDir) ? distDir : publicDir, 'index.html'));
    });
  }

  // ── HTTP + WebSocket Server ─────────────────
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws/terminal' });

  wss.on('connection', (ws, req) => {
    // Extract process name from query: /ws/terminal?name=<processName>
    const url = new URL(req.url, `http://${req.headers.host}`);
    const name = url.searchParams.get('name');
    if (!name) { ws.close(1008, 'Missing name param'); return; }

    const entry = processes.get(name);
    if (!entry || (entry.status !== 'running' && !entry.logs.length)) { 
      ws.close(1008, 'Process not found or not running'); 
      return; 
    }

    // Register client
    if (!wsClients.has(name)) wsClients.set(name, new Set());
    wsClients.get(name).add(ws);

    ws.on('error', () => {});  // Prevent unhandled error crashes

    // Replay raw output (PTY or non-PTY) so late-connecting terminals render faithfully
    const buffer = entry.config.usePty ? entry.ptyRawBuffer : entry.logRawBuffer;
    if (buffer && ws.readyState === 1) {
      try {
        ws.send(buffer);
      } catch {}
    }

    // Client → Process (keyboard input + resize)
    ws.on('message', (msg) => {
      try {
        const parsed = JSON.parse(msg);
        if (parsed.type === 'resize') {
          if (entry.ptyProc) {
            entry.ptyProc.resize(
              Math.min(parsed.cols, 300),
              Math.min(parsed.rows, 100)
            );
          }
        } else if (parsed.type === 'input') {
          if (entry.ptyProc) {
            entry.ptyProc.write(parsed.data);
          } else if (entry.proc && entry.proc.stdin && !entry.proc.stdin.destroyed) {
            entry.proc.stdin.write(parsed.data);
          }
        }
      } catch {
        const data = msg.toString();
        if (entry.ptyProc) {
          entry.ptyProc.write(data);
        } else if (entry.proc && entry.proc.stdin && !entry.proc.stdin.destroyed) {
          entry.proc.stdin.write(data);
        }
      }
    });

    ws.on('close', () => {
      const set = wsClients.get(name);
      if (set) { set.delete(ws); if (set.size === 0) wsClients.delete(name); }
    });
  });

  server.listen(PORT, () => {
    console.log(`xprocessmanager running at http://localhost:${PORT} [${process.env.NODE_ENV || 'production'}]`);
  });
}

bootstrap().catch(err => {
  console.error('Failed to bootstrap server:', err);
});
