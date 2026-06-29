import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const outputDir = parseOutputDir(Bun.argv.slice(2));
const failures: string[] = [];

const requiredFiles = [
  ".gitattributes",
  "README.md",
  "MODEL_CARD.md",
  "WHITEPAPER.md",
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "special_tokens_map.json",
  "vocab.txt",
  "onnx/model_q4.onnx",
  "LICENSE",
  "examples/basic-chat.ts",
];

const forbiddenPublicDocText = [
  "## Known Behavior",
  "## Bias and Fairness Considerations",
  "## Contact",
  "Cases: 51",
  "48/48",
  "100.0%",
  "--n 50",
];

for (const file of requiredFiles) {
  await requireFile(file);
}

await requireIncludes("README.md", [
  "library_name: transformers.js",
  "pipeline_tag: token-classification",
  "license: cc-by-4.0",
  "ai4privacy/pii-masking-openpii-1.5m",
  "98.85%",
  "6.6 ms",
  "createGuard",
]);

await requireIncludes("MODEL_CARD.md", ["ai4privacy/pii-masking-openpii-1.5m", "98.85%", "6.6 ms"]);
await requireIncludes(".gitattributes", ["*.onnx filter=lfs diff=lfs merge=lfs -text"]);
await requireIncludes("LICENSE", ["Attribution 4.0 International", "Copyright 2026 National Design Studio"]);
await requireIncludes("examples/basic-chat.ts", ["createGuard"]);
await requireNotIncludes("README.md", forbiddenPublicDocText);
await requireNotIncludes("MODEL_CARD.md", forbiddenPublicDocText);

await requireMinimumSize("onnx/model_q4.onnx", 10_000_000);

if (failures.length > 0) {
  console.error(`Hugging Face export verification failed for ${outputDir}:`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Verified Hugging Face export at ${outputDir}`);

async function requireFile(file: string): Promise<void> {
  try {
    const fileStats = await stat(join(outputDir, file));
    if (!fileStats.isFile()) {
      failures.push(`${file} is not a file`);
    }
    if (fileStats.size === 0) {
      failures.push(`${file} is empty`);
    }
  } catch {
    failures.push(`${file} is missing`);
  }
}

async function requireMinimumSize(file: string, minimumBytes: number): Promise<void> {
  try {
    const fileStats = await stat(join(outputDir, file));
    if (fileStats.size < minimumBytes) {
      failures.push(`${file} is ${fileStats.size} bytes; expected at least ${minimumBytes}`);
    }
  } catch {
    failures.push(`${file} is missing`);
  }
}

async function requireIncludes(file: string, snippets: readonly string[]): Promise<void> {
  const content = await readText(file);
  if (content === null) {
    return;
  }
  for (const snippet of snippets) {
    if (!content.includes(snippet)) {
      failures.push(`${file} does not contain "${snippet}"`);
    }
  }
}

async function requireNotIncludes(file: string, snippets: readonly string[]): Promise<void> {
  const content = await readText(file);
  if (content === null) {
    return;
  }
  for (const snippet of snippets) {
    if (content.includes(snippet)) {
      failures.push(`${file} still contains "${snippet}"`);
    }
  }
}

async function readText(file: string): Promise<string | null> {
  try {
    return await readFile(join(outputDir, file), "utf8");
  } catch {
    failures.push(`${file} could not be read`);
    return null;
  }
}

function parseOutputDir(args: readonly string[]): string {
  const outArg = args.find((arg) => arg.startsWith("--out="));
  return outArg?.slice("--out=".length) || "hf-export";
}
