import { access, cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

// Copies the Drizzle migrations into the build output so they ship alongside
// the Worker and can be applied with `npm run db:migrate` after a deploy.
export function packageMigrations(): Plugin {
  let root = process.cwd();

  return {
    name: "package-migrations",
    apply: "build",
    configResolved(config) {
      root = config.root;
    },
    async closeBundle() {
      const outputDirectory = resolve(root, "dist", "migrations");
      const drizzleSource = resolve(root, "drizzle");

      await rm(outputDirectory, { recursive: true, force: true });

      if (await exists(drizzleSource)) {
        await mkdir(outputDirectory, { recursive: true });
        await cp(drizzleSource, outputDirectory, { recursive: true });
      }
    },
  };
}
