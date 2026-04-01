# Initial setup

## Prerequisites

- **Node.js** (LTS recommended; includes `npm`)
- **Git** (if you are cloning the repository)

## Install

From the project root:

```bash
npm install
```

## Configuration

### `processes.config.json` (required)

The server reads this file at startup. It must exist and contain valid JSON: an **array** of process definitions.

Each entry typically includes:

| Field | Required | Description |
|--------|----------|-------------|
| `name` | Yes | Unique identifier used in URLs and the UI |
| `command` | Yes | Executable (e.g. `node`, `npm`, `docker`) |
| `args` | No | Array of arguments |
| `cwd` | No | Working directory; supports `{KEY}` placeholders from `env.config.json` |
| `group` | No | UI grouping (`backend`, `frontend`, `infra`, `other`); defaults to `other` |
| `stopCommand` | No | Optional `{ command, args }` for graceful shutdown |

You can start with an empty list:

```json
[]
```

Add processes via the dashboard (**+ Add Process**) or **Import** a JSON file in the same array format.

### `env.config.json` (optional)

If present, it must be a JSON object of string key-value pairs. Those values are merged into the environment for spawned processes and can be referenced in `cwd` and `args` as `{KEY}`.

If the file is missing, the app runs with an empty env map until you add variables in the **Environment** modal (which creates or updates `env.config.json`).

## Run

```bash
npm start
```

Open **http://localhost:1337** in a browser.

The UI is served from `public/`; the API and static files are handled by `server.js` (default port **1337**).

## Troubleshooting

- **Server exits on start** — Ensure `processes.config.json` exists and parses as JSON (a top-level array).
- **Port in use** — Change `PORT` in `server.js` or stop the other process using that port.
