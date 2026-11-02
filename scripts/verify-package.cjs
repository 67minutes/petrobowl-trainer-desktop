const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const asar = require("@electron/asar");
const root = path.resolve(__dirname, "..");
const packaged = process.argv[2] || path.join(root, "release/win-unpacked");
const archive = path.join(packaged, "resources/app.asar");
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const mismatches = [];
let checked = 0;
const packagedFiles = new Set(
  asar
    .listPackage(archive)
    .map((name) =>
      name.replaceAll(String.fromCharCode(92), "/").replace(/^\/+/, ""),
    ),
);
function verifyFolder(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const local = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      verifyFolder(local);
      continue;
    }
    const rel = path
      .relative(root, local)
      .replaceAll(String.fromCharCode(92), "/");
    checked++;
    if (
      !packagedFiles.has(rel) ||
      sha(fs.readFileSync(local)) !==
        sha(asar.extractFile(archive, path.normalize(rel)))
    )
      mismatches.push(rel);
  }
}
verifyFolder(path.join(root, "dist"));
for (const name of ["bank.json", "manifest.json"]) {
  checked++;
  if (
    sha(fs.readFileSync(path.join(root, "content", name))) !==
    sha(fs.readFileSync(path.join(packaged, "resources/content", name)))
  )
    mismatches.push(`content/${name}`);
}
const facts = JSON.parse(
  fs.readFileSync(path.join(root, "content/bank.json"), "utf8"),
);
for (const image of new Set(facts.map((f) => f.image).filter(Boolean))) {
  checked++;
  const packedFile = path.join(packaged, "resources/content/media", image);
  if (
    !fs.existsSync(packedFile) ||
    sha(fs.readFileSync(path.join(root, "content/media", image))) !==
      sha(fs.readFileSync(packedFile))
  )
    mismatches.push(`media/${image}`);
}
if (checked < 6) throw new Error("Packaged application files were not found.");
console.log(JSON.stringify({ checked, mismatches }, null, 2));
if (mismatches.length) process.exitCode = 1;
