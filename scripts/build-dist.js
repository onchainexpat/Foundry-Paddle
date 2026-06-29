import { cpSync, existsSync, mkdirSync, rmSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dist = join(root, "dist");
const fullsiteRoot = join(root, "fullsite");
const fullsiteDist = join(fullsiteRoot, "dist");

function run(cmd, args, cwd = root) {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: false });
  const code = result.status ?? 1;
  if (code !== 0) {
    console.error(`Command failed: ${cmd} ${args.join(" ")} (exit ${code})`);
    process.exit(code);
  }
}

console.log("Installing fullsite dependencies (npm ci)…");
run("npm", ["ci"], fullsiteRoot);

console.log("Building fullsite…");
run("npm", ["run", "build"], fullsiteRoot);

if (existsSync(dist)) rmSync(dist, { recursive: true });
mkdirSync(dist, { recursive: true });

if (!existsSync(fullsiteDist)) {
  console.error("fullsite/dist missing after build.");
  process.exit(1);
}
cpSync(fullsiteDist, dist, { recursive: true });
console.log("Copied fullsite/dist -> dist/");

console.log("dist/ ready for production.");
