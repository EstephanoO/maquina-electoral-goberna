import { defineConfig } from "jsrepo";

export default defineConfig({
  registries: [],
  paths: {
    component: './registry/reactbits',
    hook: './lib/hooks',
    lib: './lib/utils',
  },
});
