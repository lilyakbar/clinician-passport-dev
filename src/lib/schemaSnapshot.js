// Builds a portable schema snapshot from the actual base44/entities/*.jsonc
// source files (the source of truth), using Vite raw imports. The backend
// function has no filesystem access and the SDK exposes no .schema() method,
// so this runs client-side where Vite can read repo files.
//
// Returns { schemas, errors } where schemas[entity] is the parsed JSONC object
// (fields, types, required, defaults, enums, rls) and errors lists any parse
// failures. Missing files are simply absent from the map (no build break).

const modules = import.meta.glob("../../base44/entities/*.jsonc", {
  query: "?raw",
  import: "default",
  eager: true,
});

// Strip JSONC comments (// line and /* block */) without corrupting quoted
// strings — important because URL values contain "//".
function stripJsonc(raw) {
  let out = "";
  let i = 0;
  const n = raw.length;
  while (i < n) {
    const ch = raw[i];
    // String literal (double or single quoted) — copy verbatim, including any
    // "//" or "/*" that appears inside it (e.g. https://).
    if (ch === '"' || ch === "'") {
      const quote = ch;
      out += ch;
      i++;
      while (i < n) {
        const c = raw[i];
        out += c;
        if (c === "\\" && i + 1 < n) {
          out += raw[i + 1];
          i += 2;
          continue;
        }
        i++;
        if (c === quote) break;
      }
      continue;
    }
    // Line comment
    if (ch === "/" && raw[i + 1] === "/") {
      i += 2;
      while (i < n && raw[i] !== "\n") i++;
      continue;
    }
    // Block comment
    if (ch === "/" && raw[i + 1] === "*") {
      i += 2;
      while (i < n && !(raw[i] === "*" && raw[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

export function buildSchemaSnapshot() {
  const schemas = {};
  const errors = [];
  for (const [path, raw] of Object.entries(modules)) {
    const name = path.split("/").pop().replace(/\.jsonc$/, "");
    if (typeof raw !== "string") continue;
    try {
      schemas[name] = JSON.parse(stripJsonc(raw));
    } catch (e) {
      errors.push({
        stage: "schema",
        entity: name,
        message: e?.message || "JSONC parse failed",
      });
    }
  }
  return { schemas, errors };
}