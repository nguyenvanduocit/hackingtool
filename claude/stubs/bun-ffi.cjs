// Stub for bun:ffi when running cli.js under Node.
// API surface: dlopen, FFIType, suffix, ptr, toBuffer, CString, JSCallback, read.
// All return inert values. Calling them at runtime throws via getter Proxy.

const stubFn = (name) => () => {
  throw new Error(`[bun:ffi stub] ${name}() not available under Node — feature unavailable in debug mode`);
};

module.exports = new Proxy({
  FFIType: new Proxy({}, { get: () => 0 }),
  suffix: process.platform === "darwin" ? "dylib" : process.platform === "win32" ? "dll" : "so",
  ptr: stubFn("ptr"),
  toBuffer: stubFn("toBuffer"),
  CString: class CString { constructor() { throw new Error("[bun:ffi stub] CString unavailable under Node"); } },
  JSCallback: class JSCallback { constructor() { throw new Error("[bun:ffi stub] JSCallback unavailable under Node"); } },
  read: new Proxy({}, { get: (_, k) => stubFn(`read.${String(k)}`) }),
  dlopen: stubFn("dlopen"),
}, {
  get(target, prop) {
    if (prop in target) return target[prop];
    return stubFn(`bun:ffi.${String(prop)}`);
  },
});
