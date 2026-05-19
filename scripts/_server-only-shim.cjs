/**
 * CommonJS require shim — neuters `server-only` so sub-agent code can run
 * under `tsx` outside the Next.js runtime (smoke tests, REPL).
 *
 * Usage: NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm tsx <file.ts>
 */
const Module = require("node:module");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") return require.resolve("./_server-only-noop.cjs");
  return origResolve.call(this, request, ...rest);
};
