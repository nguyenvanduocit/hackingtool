// Stub for /$bunfs/root/*.node native modules when running cli.js under Node.
// Returns a Proxy that throws on any access — feature unavailable in debug mode.

module.exports = new Proxy({}, {
  get(_, prop) {
    return () => {
      throw new Error(`[native stub] /$bunfs/root/*.node ${String(prop)}() unavailable in debug mode (native module not extracted)`);
    };
  },
});
