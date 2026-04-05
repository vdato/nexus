const express = require('express');
const { spawn, execFileSync } = require('child_process');
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

function appendLog(entry, source, data) {
  const rawData = data.toString();
  const lines = rawData.split('\n');

  for (const line of lines) {
    if (line.length === 0) continue;
    entry.logs.push({ ts: Date.now(), source, text: line });
    if (entry.logs.length > MAX_LOG_LINES) entry.logs.shift();
  }
}

function startProcess(name) {
  const config = processConfigs.find((c) => c.name === name);
  if (!config) return { error: `Unknown process: ${name}` };

  const existing = processes.get(name);
  if (existing && existing.status === 'running') {
    return { error: `${name} is already running` };
  }

  const resolvedCwd = resolveTemplate(config.cwd);
  const resolvedArgs = (config.args || []).map(resolveTemplate);

  const env = { ...process.env, PYTHONUNBUFFERED: '1', ...envVars };
  let proc;
  const entry = {
    status: 'running',
    logs: [{ ts: Date.now(), source: 'system', text: `Spawning: ${config.command} ${resolvedArgs.join(' ')}` }],
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
      });

      proc.onExit(({ exitCode }) => {
        if (entry.status !== 'stopping') {
          entry.status = exitCode === 0 ? 'stopped' : 'errored';
        } else {
          entry.status = 'stopped';
        }
        appendLog(entry, 'system', `Exited with code ${exitCode}`);
        entry.proc = null;
      });
    } else {
      console.log(`[xpm] Spawning: ${config.command} ${JSON.stringify(resolvedArgs)} cwd=${resolvedCwd || '(none)'}`);
      proc = spawn(config.command, resolvedArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: resolvedCwd || undefined,
        env
      });

      proc.stdout.on('data', (data) => appendLog(entry, 'stdout', data));
      proc.stderr.on('data', (data) => appendLog(entry, 'stderr', data));

      proc.on('error', (err) => {
        entry.status = 'errored';
        appendLog(entry, 'system', `Process error: ${err.message}`);
      });

      proc.on('close', (code) => {
        if (entry.status !== 'stopping') {
          entry.status = code === 0 ? 'stopped' : 'errored';
        } else {
          entry.status = 'stopped';
        }
        appendLog(entry, 'system', `Exited with code ${code}`);
        entry.proc = null;
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
app.use(express.static(fs.existsSync(distDir) ? distDir : publicDir));
app.use(express.json());

app.get('/api/processes', (_req, res) => {
  const result = processConfigs.map((config) => {
    const state = getState(config.name);
    const resolvedCwd = resolveTemplate(config.cwd);
    return {
      name: config.name,
      group: config.group,
      command: `${config.command} ${(config.args || []).map(resolveTemplate).join(' ')}`.trim(),
      cwd: config.cwd || null,
      resolvedCwd: resolvedCwd || null,
      branch: getGitBranch(resolvedCwd),
      usePty: !!config.usePty,
      status: state.status,
      pid: state.pid,
      startedAt: state.startedAt,
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
  const input = req.body.input !== undefined ? req.body.input : (typeof req.body === 'string' ? req.body : '');
  // Send exactly \r (Return key payload) because Raw mode drops \n and \r\n can confuse TUI prompts
  entry.proc.stdin.write(input + '\r');
  appendLog(entry, 'stdin', input);
  res.json({ ok: true });
});

app.post('/api/processes/:name/start', (req, res) => {
  res.json(startProcess(req.params.name));
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
    const entry = { name: item.name, command: item.command, args: item.args || [], group: item.group || 'other' };
    if (item.cwd) entry.cwd = item.cwd;
    if (item.stopCommand) entry.stopCommand = item.stopCommand;
    if (item.usePty !== undefined) entry.usePty = !!item.usePty;
    processConfigs.push(entry);
    added.push(item.name);
  }
  if (added.length > 0) saveConfig();
  res.json({ added, skipped });
});

app.post('/api/config', (req, res) => {
  const { name, command, args, cwd, group, stopCommand, usePty } = req.body;
  if (!name || !command) {
    return res.status(400).json({ error: 'name and command are required' });
  }
  if (processConfigs.some((c) => c.name === name)) {
    return res.status(409).json({ error: `Process "${name}" already exists` });
  }
  const entry = { name, command, args: args || [], group: group || 'other' };
  if (cwd) entry.cwd = cwd;
  if (stopCommand) entry.stopCommand = stopCommand;
  if (usePty !== undefined) entry.usePty = !!usePty;
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
  const { name: newName, command, args, cwd, group, stopCommand, usePty } = req.body;
  if (!command) {
    return res.status(400).json({ error: 'command is required' });
  }
  const finalName = (newName && newName.trim()) ? newName.trim() : oldName;
  if (finalName !== oldName && processConfigs.some((c) => c.name === finalName)) {
    return res.status(409).json({ error: `Process "${finalName}" already exists` });
  }
  const updated = { name: finalName, command, args: args || [], group: group || 'other' };
  if (cwd) updated.cwd = cwd;
  if (stopCommand) updated.stopCommand = stopCommand;
  if (usePty !== undefined) updated.usePty = !!usePty;
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

// ── HTTP + WebSocket Server ─────────────────
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/terminal' });

wss.on('connection', (ws, req) => {
  // Extract process name from query: /ws/terminal?name=<processName>
  const url = new URL(req.url, `http://${req.headers.host}`);
  const name = url.searchParams.get('name');
  if (!name) { ws.close(1008, 'Missing name param'); return; }

  const entry = processes.get(name);
  if (!entry || !entry.ptyProc) { ws.close(1008, 'Not a PTY process'); return; }

  // Register client
  if (!wsClients.has(name)) wsClients.set(name, new Set());
  wsClients.get(name).add(ws);

  ws.on('error', () => {});  // Prevent unhandled error crashes

  // Send buffered log text as a single batch so the terminal isn't blank on connect
  if (entry.logs.length && ws.readyState === 1) {
    try {
      const batch = entry.logs.filter(l => l.source === 'stdout').map(l => l.text).join('');
      ws.send(batch);
    } catch {}
  }

  // Client → PTY (keyboard input + resize)
  ws.on('message', (msg) => {
    if (!entry.ptyProc) return;
    try {
      const parsed = JSON.parse(msg);
      if (parsed.type === 'resize') {
        entry.ptyProc.resize(
          Math.min(parsed.cols, 300),
          Math.min(parsed.rows, 100)
        );
      } else if (parsed.type === 'input') {
        entry.ptyProc.write(parsed.data);
      }
    } catch {
      entry.ptyProc.write(msg.toString());
    }
  });

  ws.on('close', () => {
    const set = wsClients.get(name);
    if (set) { set.delete(ws); if (set.size === 0) wsClients.delete(name); }
  });
});

server.listen(PORT, () => {
  console.log(`xprocessmanager running at http://localhost:${PORT}`);
});
