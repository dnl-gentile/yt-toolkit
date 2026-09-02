/*
 * PRIVACY.md is a privacy policy that will back a Chrome Web Store listing, and it says of
 * itself that it is written to match the code. That claim needs a gate, because it silently
 * stopped being true once: a whole additional host was added to the manifest while the policy
 * still described a YouTube-only extension.
 *
 * These tests do not check prose. They check the two lists that must not drift: every host the
 * extension runs on, and every storage key it uses.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const PRIVACY = fs.readFileSync(path.join(ROOT, "PRIVACY.md"), "utf8");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

/** Every origin the extension is granted or injects into. */
function manifestHosts() {
  const hosts = new Set(MANIFEST.host_permissions || []);
  for (const script of MANIFEST.content_scripts || [])
    for (const match of script.matches || []) hosts.add(match);
  return [...hosts];
}

test("every host in the manifest is disclosed in PRIVACY.md", () => {
  for (const host of manifestHosts()) {
    // Compare on the bare domain: the policy writes hosts both as match patterns
    // and as prose, and the domain is the part that must appear either way.
    const domain = host.replace(/^https?:\/\//, "").replace(/\/\*?$/, "");
    assert.ok(
      PRIVACY.includes(domain),
      `manifest grants ${host} but PRIVACY.md never mentions ${domain} — ` +
        `a policy that omits a host the extension runs on is wrong, not merely incomplete`,
    );
  }
});

test("every storage key the code uses is disclosed in PRIVACY.md", () => {
  const sources = [
    "background.js",
    "content_script_youtube.js",
    "content_script_searchapp.js",
    "options.js",
    ...fs.readdirSync(path.join(ROOT, "content")).map((f) => path.join("content", f)),
    ...fs.readdirSync(path.join(ROOT, "lib")).map((f) => path.join("lib", f)),
  ].filter((f) => f.endsWith(".js"));

  const keys = new Set();
  for (const rel of sources) {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    for (const m of src.matchAll(/\b(qt_[a-zA-Z0-9_]+|noDistractionsEnabled|ga_client_id)\b/g))
      keys.add(m[1]);
  }

  const missing = [...keys].filter((k) => !PRIVACY.includes(k)).sort();
  assert.deepEqual(
    missing,
    [],
    `stored but undisclosed: ${missing.join(", ")}. Every key the extension writes belongs in ` +
      `the storage table, so a reader can see the complete set rather than a sample.`,
  );
});

/*
 * Storage the extension touches that is NOT its own. The course-player adapter writes into the
 * host site's localStorage, which no amount of reading chrome.storage would reveal — the first
 * version of the third-party section in PRIVACY.md claimed the adapter touched "six settings and
 * nothing else" precisely because it had only been checked that way.
 */
test("host-page localStorage keys are disclosed too", () => {
  const adapters = ["content/videojs.js", "content/videojs-main.js", "lib/videojs.js"].filter((f) =>
    fs.existsSync(path.join(ROOT, f)),
  );
  const keys = new Set();
  for (const rel of adapters) {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    for (const m of src.matchAll(/localStorage\.(?:get|set)Item\(\s*["']([^"']+)["']/g))
      keys.add(m[1]);
  }

  const missing = [...keys].filter((k) => !PRIVACY.includes(k)).sort();
  assert.deepEqual(
    missing,
    [],
    `the adapter touches host-page localStorage keys PRIVACY.md does not mention: ${missing.join(", ")}`,
  );
});

test("PRIVACY.md lists exactly the telemetry events analytics.js can send", () => {
  const analytics = fs.readFileSync(path.join(ROOT, "analytics.js"), "utf8");
  const events = new Set();
  for (const m of analytics.matchAll(/sendEvent\(\s*['"]([a-z_]+)['"]/g)) events.add(m[1]);

  const missing = [...events].filter((e) => !PRIVACY.includes(e)).sort();
  assert.deepEqual(
    missing,
    [],
    `analytics.js can send ${missing.join(", ")}, which PRIVACY.md does not list`,
  );
});
