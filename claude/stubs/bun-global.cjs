// Polyfill for globalThis.Bun when running cli-naked.js under Node.
// Targets all Bun.* APIs referenced in Claude Code cli.js v2.1.140.
//
// Loaded via debug-loader.cjs before cli-naked.js runs.

"use strict";

const crypto = require("node:crypto");
const child_process = require("node:child_process");
const net = require("node:net");
const v8 = require("node:v8");
const fs = require("node:fs");
const path = require("node:path");

const stringWidth = require("string-width");
const stripAnsi = require("strip-ansi");
const wrapAnsi = require("wrap-ansi");
const semver = require("semver");
const YAML = require("yaml");

// ---------------------------------------------------------------------------
// Bun.stringWidth(s, opts) — visible width including wide chars / emoji.
// ---------------------------------------------------------------------------
function bunStringWidth(s, opts) {
  if (s == null) return 0;
  const str = typeof s === "string" ? s : String(s);
  try {
    return stringWidth(str, opts);
  } catch {
    return stripAnsi(str).length;
  }
}

// ---------------------------------------------------------------------------
// Bun.stripANSI(s) — strip ANSI escape codes.
// ---------------------------------------------------------------------------
function bunStripANSI(s) {
  return stripAnsi(s == null ? "" : String(s));
}

// ---------------------------------------------------------------------------
// Bun.wrapAnsi(s, cols, opts) — wrap text preserving ANSI.
// Bun signature: wrapAnsi(string, columns, options?) — options { hard, trim, wordWrap }
// ---------------------------------------------------------------------------
function bunWrapAnsi(s, cols, opts) {
  return wrapAnsi(s == null ? "" : String(s), cols, opts || {});
}

// ---------------------------------------------------------------------------
// Bun.semver — Bun's semver helper, mostly { satisfies, order }.
// We map to npm semver where possible.
// ---------------------------------------------------------------------------
const bunSemver = {
  satisfies(version, range) {
    try { return semver.satisfies(version, range, { includePrerelease: true, loose: true }); }
    catch { return false; }
  },
  order(a, b) {
    try { return semver.compare(a, b); } catch { return 0; }
  },
};

// ---------------------------------------------------------------------------
// Bun.hash — supports Bun.hash(input) → wyhash(64) as bigint by default.
// We approximate with a simple 64-bit hash from sha256 (deterministic).
// ---------------------------------------------------------------------------
function bunHash(input, seed) {
  const buf = Buffer.isBuffer(input)
    ? input
    : input instanceof Uint8Array
    ? Buffer.from(input.buffer, input.byteOffset, input.byteLength)
    : Buffer.from(String(input));
  const h = crypto.createHash("sha256").update(buf).digest();
  // Take first 8 bytes as bigint
  return h.readBigUInt64LE(0);
}
// Bun.hash also has methods: wyhash, adler32, crc32, cityHash32, cityHash64, xxHash32, xxHash64, xxHash3, murmur32v3, murmur32v2, murmur64v2
for (const m of ["wyhash", "adler32", "crc32", "cityHash32", "cityHash64", "xxHash32", "xxHash64", "xxHash3", "murmur32v3", "murmur32v2", "murmur64v2"]) {
  bunHash[m] = function (input, seed) {
    const h = bunHash(input);
    if (m.endsWith("32") || m === "adler32" || m === "crc32") return Number(h & 0xFFFFFFFFn);
    return h;
  };
}

// ---------------------------------------------------------------------------
// Bun.which(cmd, opts) — find executable in PATH; returns absolute path or null.
// ---------------------------------------------------------------------------
function bunWhich(cmd, opts) {
  if (!cmd) return null;
  const exts = process.platform === "win32" ? (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";") : [""];
  const PATH = (opts?.PATH ?? process.env.PATH ?? "").split(path.delimiter);
  for (const dir of PATH) {
    if (!dir) continue;
    for (const ext of exts) {
      const full = path.join(dir, cmd + ext);
      try {
        const st = fs.statSync(full);
        if (st.isFile() && (process.platform === "win32" || (st.mode & 0o111))) return full;
      } catch {}
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Bun.spawn(args, opts) — Bun spawn API, returns a Subprocess.
// We map to child_process.spawn with promise-friendly fields.
// ---------------------------------------------------------------------------
function bunSpawn(args, opts) {
  // Bun.spawn({cmd: [...], cwd, env, stdin, stdout, stderr, onExit})
  // OR Bun.spawn(["cmd", ...args], opts)
  let cmd, cmdOpts;
  if (Array.isArray(args)) {
    cmd = args;
    cmdOpts = opts || {};
  } else {
    cmd = args.cmd || [];
    cmdOpts = args;
  }
  const [exe, ...rest] = cmd;
  const stdio = ["pipe", "pipe", "pipe"];
  if (cmdOpts.stdin === "inherit") stdio[0] = "inherit";
  if (cmdOpts.stdin === "ignore") stdio[0] = "ignore";
  if (cmdOpts.stdout === "inherit") stdio[1] = "inherit";
  if (cmdOpts.stdout === "ignore") stdio[1] = "ignore";
  if (cmdOpts.stderr === "inherit") stdio[2] = "inherit";
  if (cmdOpts.stderr === "ignore") stdio[2] = "ignore";

  const cp = child_process.spawn(exe, rest, {
    cwd: cmdOpts.cwd,
    env: cmdOpts.env || process.env,
    stdio,
  });

  const exitedPromise = new Promise((resolve) => {
    cp.on("exit", (code, signal) => {
      try { if (cmdOpts.onExit) cmdOpts.onExit(proc, code, signal, null); } catch {}
      resolve(code ?? 0);
    });
    cp.on("error", (err) => {
      try { if (cmdOpts.onExit) cmdOpts.onExit(proc, null, null, err); } catch {}
      resolve(1);
    });
  });

  const proc = {
    pid: cp.pid,
    stdin: cp.stdin,
    stdout: cp.stdout,
    stderr: cp.stderr,
    exited: exitedPromise,
    get exitCode() { return cp.exitCode; },
    get signalCode() { return cp.signalCode; },
    get killed() { return cp.killed; },
    kill(sig) { return cp.kill(sig); },
    ref() { return cp.ref?.(); },
    unref() { return cp.unref?.(); },
  };
  return proc;
}

// ---------------------------------------------------------------------------
// Bun.listen(opts) — TCP listen. Map to net.createServer.
// ---------------------------------------------------------------------------
function bunListen(opts) {
  const server = net.createServer((socket) => {
    if (opts?.socket?.open) opts.socket.open(socket);
    socket.on("data", (chunk) => { if (opts?.socket?.data) opts.socket.data(socket, chunk); });
    socket.on("close", () => { if (opts?.socket?.close) opts.socket.close(socket); });
    socket.on("error", (err) => { if (opts?.socket?.error) opts.socket.error(socket, err); });
  });
  server.listen(opts.port, opts.hostname || "0.0.0.0");
  return {
    hostname: opts.hostname || "0.0.0.0",
    port: opts.port,
    stop() { server.close(); },
    ref() { server.ref(); },
    unref() { server.unref(); },
  };
}

// ---------------------------------------------------------------------------
// Bun.gc(force) — trigger GC if Node was started with --expose-gc.
// ---------------------------------------------------------------------------
function bunGc(force) {
  if (typeof globalThis.gc === "function") {
    globalThis.gc();
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Bun.generateHeapSnapshot() — JSON heap snapshot.
// ---------------------------------------------------------------------------
function bunGenerateHeapSnapshot() {
  try {
    return v8.getHeapSnapshot();
  } catch {
    return { type: "heap-snapshot-unavailable" };
  }
}

// ---------------------------------------------------------------------------
// Bun.JSONL — newline-delimited JSON parser.
// ---------------------------------------------------------------------------
const bunJSONL = {
  parse(text) {
    return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  },
  stringify(arr) {
    return arr.map((o) => JSON.stringify(o)).join("\n") + "\n";
  },
};

// ---------------------------------------------------------------------------
// Bun.YAML — YAML parser. Map to npm `yaml`.
// ---------------------------------------------------------------------------
const bunYAML = {
  parse(text) { return YAML.parse(text); },
  stringify(obj) { return YAML.stringify(obj); },
};

// ---------------------------------------------------------------------------
// Bun.Transpiler — JS/TS transpiler. We provide a no-op passthrough.
// ---------------------------------------------------------------------------
class BunTranspiler {
  constructor(opts) { this.opts = opts || {}; }
  transformSync(code) { return String(code); }
  transform(code) { return Promise.resolve(String(code)); }
  scan(code) { return { exports: [], imports: [] }; }
  scanImports(code) { return []; }
}

// ---------------------------------------------------------------------------
// Bun.Terminal — terminal info. Stub.
// ---------------------------------------------------------------------------
const bunTerminal = {
  cols: process.stdout.columns || 80,
  rows: process.stdout.rows || 24,
  isTTY: !!process.stdout.isTTY,
};

// ---------------------------------------------------------------------------
// Bun.embeddedFiles — Always empty in non-SFA mode.
// ---------------------------------------------------------------------------
const bunEmbeddedFiles = [];

// ---------------------------------------------------------------------------
// Assemble & install the Bun global.
// ---------------------------------------------------------------------------
const Bun = {
  version: "1.3.14",
  revision: "node-polyfill",
  stringWidth: bunStringWidth,
  stripANSI: bunStripANSI,
  wrapAnsi: bunWrapAnsi,
  semver: bunSemver,
  hash: bunHash,
  which: bunWhich,
  spawn: bunSpawn,
  listen: bunListen,
  gc: bunGc,
  generateHeapSnapshot: bunGenerateHeapSnapshot,
  JSONL: bunJSONL,
  YAML: bunYAML,
  Transpiler: BunTranspiler,
  Terminal: bunTerminal,
  embeddedFiles: bunEmbeddedFiles,
  // Convenience hooks Bun ships
  inspect(value) { return require("node:util").inspect(value); },
  argv: process.argv,
  env: process.env,
  main: require.main?.filename || "",
};

if (typeof globalThis.Bun === "undefined") {
  Object.defineProperty(globalThis, "Bun", {
    value: new Proxy(Bun, {
      get(target, prop) {
        if (prop in target) return target[prop];
        // Unknown Bun.x accesses → throwing stub so we notice
        return () => {
          throw new Error(`[Bun-polyfill] Bun.${String(prop)} not implemented under Node`);
        };
      },
    }),
    writable: false,
    configurable: false,
  });
}

module.exports = globalThis.Bun;
