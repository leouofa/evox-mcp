import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: false,
    clean: true,
    sourcemap: true,
    target: "node18",
    shims: true,
    banner: {
      js: "#!/usr/bin/env node\n",
    },
  },
  {
    entry: ["src/server.ts"],
    format: ["esm"],
    dts: true,
    clean: false,
    sourcemap: true,
    target: "node18",
    shims: true,
  },
]);
