import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const outputDir = parseOutputDir(Bun.argv.slice(2));

const files = [
  // Hugging Face renders README.md as the model card and requires its YAML
  // front matter, so ship MODEL_CARD.md (which carries the metadata) as the
  // repo README. The plain GitHub README has no front matter and would trip
  // the "empty or missing yaml metadata" warning.
  ["MODEL_CARD.md", "README.md"],
  ["model/config.json", "config.json"],
  ["model/tokenizer.json", "tokenizer.json"],
  ["model/tokenizer_config.json", "tokenizer_config.json"],
  ["model/special_tokens_map.json", "special_tokens_map.json"],
  ["model/vocab.txt", "vocab.txt"],
  ["model/onnx/model_q4.onnx", "onnx/model_q4.onnx"],
  ["LICENSE", "LICENSE"],
  ["MODEL_CARD.md", "MODEL_CARD.md"],
  ["WHITEPAPER.md", "WHITEPAPER.md"],
  ["examples/basic-chat.ts", "examples/basic-chat.ts"],
] as const;

await rm(outputDir, { recursive: true, force: true });

for (const [source, destination] of files) {
  const target = join(outputDir, destination);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}

await writeFile(join(outputDir, ".gitattributes"), ["*.onnx filter=lfs diff=lfs merge=lfs -text", ""].join("\n"));

console.log(`Wrote Hugging Face export to ${outputDir}`);

function parseOutputDir(args: readonly string[]): string {
  const outArg = args.find((arg) => arg.startsWith("--out="));
  return outArg?.slice("--out=".length) || "hf-export";
}
