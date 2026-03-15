import "dotenv/config";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "..", "output");

const FIGMA_TOKEN = process.env.FIGMA_TOKEN;
const FIGMA_FILE_KEY = process.env.FIGMA_FILE_KEY;
const isSummary = process.argv.includes("--summary");

if (!FIGMA_TOKEN || !FIGMA_FILE_KEY) {
  console.error("Error: FIGMA_TOKEN and FIGMA_FILE_KEY must be set in .env");
  process.exit(1);
}

const headers = { "X-Figma-Token": FIGMA_TOKEN };
const API_BASE = "https://api.figma.com/v1";

async function fetchFigmaFile() {
  console.log(`Fetching Figma file: ${FIGMA_FILE_KEY}...`);

  const res = await fetch(`${API_BASE}/files/${FIGMA_FILE_KEY}`, { headers });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Figma API error (${res.status}): ${text}`);
    process.exit(1);
  }

  const data = await res.json();
  return data;
}

function extractNodes(node, depth = 0) {
  const indent = "  ".repeat(depth);
  const lines = [];

  const type = node.type || "UNKNOWN";
  const name = node.name || "";
  const chars = node.characters ? ` | text: "${node.characters}"` : "";

  lines.push(`${indent}[${type}] ${name}${chars}`);

  if (node.children) {
    for (const child of node.children) {
      lines.push(...extractNodes(child, depth + 1));
    }
  }

  return lines;
}

function extractSummary(data) {
  const summary = {
    name: data.name,
    lastModified: data.lastModified,
    version: data.version,
    pages: [],
  };

  const document = data.document;
  if (document?.children) {
    for (const page of document.children) {
      const pageInfo = {
        name: page.name,
        type: page.type,
        childCount: page.children?.length || 0,
        nodeTree: extractNodes(page),
      };
      summary.pages.push(pageInfo);
    }
  }

  return summary;
}

async function main() {
  const data = await fetchFigmaFile();

  // Save raw JSON
  const rawPath = join(OUTPUT_DIR, "figma-raw.json");
  writeFileSync(rawPath, JSON.stringify(data, null, 2), "utf-8");
  console.log(`Raw data saved: ${rawPath}`);

  // Save summary
  const summary = extractSummary(data);
  const summaryPath = join(OUTPUT_DIR, "figma-summary.json");
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf-8");
  console.log(`Summary saved: ${summaryPath}`);

  // Save node tree as text
  const treeLines = [];
  treeLines.push(`# Figma File: ${data.name}`);
  treeLines.push(`# Last Modified: ${data.lastModified}`);
  treeLines.push("");
  for (const page of summary.pages) {
    treeLines.push(...page.nodeTree);
    treeLines.push("");
  }
  const treePath = join(OUTPUT_DIR, "figma-tree.txt");
  writeFileSync(treePath, treeLines.join("\n"), "utf-8");
  console.log(`Node tree saved: ${treePath}`);

  // Console output
  if (isSummary) {
    console.log("\n=== Summary ===");
    console.log(`File: ${summary.name}`);
    console.log(`Pages: ${summary.pages.length}`);
    for (const page of summary.pages) {
      console.log(`  - ${page.name} (${page.childCount} children)`);
    }
  } else {
    console.log("\n=== Node Tree ===");
    console.log(treeLines.join("\n"));
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
