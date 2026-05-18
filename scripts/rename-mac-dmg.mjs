import fs from "node:fs";
import path from "node:path";

const dmgDir = path.resolve("src-tauri/target/release/bundle/dmg");
const finalName = "Zirain.dmg";
const finalPath = path.join(dmgDir, finalName);

if (!fs.existsSync(dmgDir)) {
  console.log(`[rename-mac-dmg] dmg dir not found: ${dmgDir}`);
  process.exit(0);
}

const candidates = fs
  .readdirSync(dmgDir)
  .filter((name) => name.toLowerCase().endsWith(".dmg"))
  .filter((name) => name !== finalName)
  .sort((a, b) => {
    const aTime = fs.statSync(path.join(dmgDir, a)).mtimeMs;
    const bTime = fs.statSync(path.join(dmgDir, b)).mtimeMs;
    return bTime - aTime;
  });

if (candidates.length === 0) {
  console.log("[rename-mac-dmg] no dmg candidate to rename");
  process.exit(0);
}

const source = path.join(dmgDir, candidates[0]);
if (fs.existsSync(finalPath)) {
  fs.rmSync(finalPath);
}

fs.copyFileSync(source, finalPath);
console.log(`[rename-mac-dmg] created ${finalPath} from ${source}`);
