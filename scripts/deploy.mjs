// Copies the built plugin into a local Obsidian vault so it can be tested
// without manual copy-pasting. Run via `npm run deploy` (which builds first).
//
// The vault location comes from deploy.config.json at the repo root:
//   { "vaultPath": "D:\\ObsidianData\\MyVault" }
// or from the OBSIDIAN_VAULT environment variable, which takes precedence.

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "deploy.config.json");

let vaultPath = process.env.OBSIDIAN_VAULT;
if (!vaultPath && existsSync(configPath)) {
	vaultPath = JSON.parse(readFileSync(configPath, "utf8")).vaultPath;
}
if (!vaultPath) {
	console.error(`No vault configured. Create ${configPath} with:`);
	console.error('  { "vaultPath": "D:\\\\ObsidianData\\\\MyVault" }');
	console.error("or set the OBSIDIAN_VAULT environment variable.");
	process.exit(1);
}
if (!existsSync(vaultPath)) {
	console.error(`Vault directory not found: ${vaultPath}`);
	process.exit(1);
}

const { id } = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8"));
const pluginDir = path.join(vaultPath, ".obsidian", "plugins", id);
mkdirSync(pluginDir, { recursive: true });

for (const file of ["main.js", "manifest.json", "styles.css"]) {
	cpSync(path.join(root, file), path.join(pluginDir, file));
	console.log(`  ${file} -> ${pluginDir}`);
}

// If the community "Hot Reload" plugin is installed, this marker makes it
// reload the plugin automatically after each deploy.
writeFileSync(path.join(pluginDir, ".hotreload"), "");

console.log("Done. Reload the plugin (or Obsidian) to pick up the changes.");
