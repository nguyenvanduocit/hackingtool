// debug-loader.cjs — preload via `node --require ./debug-loader.cjs cli-naked.js`
//
// Intercepts:
//   1. `require("bun:ffi")`              → no-op stub (bun-only API)
//   2. `require("/$bunfs/root/*.node")`  → no-op native module stub
//   3. globalThis.Bun                    → Node polyfill (string-width, spawn, hash, …)
//
// These resolve fail when running cli.js OUTSIDE the bun single-file-executable.
// Stubs let us at least load the module graph; touching a stubbed feature at
// runtime will throw a descriptive error instead of crashing on require.

const Module = require("node:module");
const path = require("node:path");

const STUB_BUN_FFI = path.join(__dirname, "stubs", "bun-ffi.cjs");
const STUB_NATIVE = path.join(__dirname, "stubs", "native-noop.cjs");

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === "bun:ffi") return STUB_BUN_FFI;
  if (request.startsWith("/$bunfs/root/") && request.endsWith(".node")) {
    return STUB_NATIVE;
  }
  return origResolve.call(this, request, parent, ...rest);
};

// Install globalThis.Bun polyfill (must run before cli-naked.js evaluates).
require(path.join(__dirname, "stubs", "bun-global.cjs"));
