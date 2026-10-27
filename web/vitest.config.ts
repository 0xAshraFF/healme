import { defineConfig } from "vitest/config";
import os from "node:os";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["src/**/*.test.ts"],
    // Test files share one data folder, so run them one at a time.
    fileParallelism: false,
    // Tests write cases to a throwaway folder, never to web/data.
    env: { HEALME_DATA_DIR: path.join(os.tmpdir(), `healme-test-${process.pid}-${Date.now()}`) },
  },
});
