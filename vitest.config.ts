import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          coverage: {
            provider: "v8",
            include: ["src/**/*.ts"],
            exclude: ["src/**/*.test.ts", "src/**/*.workers-test.ts"],
          },
        },
        resolve: {
          alias: { "@": "./src" },
        },
      },
      defineWorkersConfig({
        test: {
          name: "workers",
          include: ["src/**/*.workers-test.ts"],
          poolOptions: {
            workers: {
              wrangler: {
                configPath: "./wrangler.toml",
              },
            },
          },
        },
      }),
    ],
  },
})
