/**
 * redact — an Ollama-style interactive terminal for the redaction engine.
 *
 * You type a message; it prints the locally-redacted text (what would be safe
 * to send to a model) and how long the redaction took. The NER model is pulled
 * from Hugging Face on first run, then cached locally for on-device inference.
 *
 *   > My name is Jane Doe and my card is 4111 1111 1111 1111
 *   My name is [GIVEN_NAME_1] [SURNAME_1] and my card is [CREDIT_CARD_1]
 *   redacted in 6.9 ms · 3 placeholder(s)
 *
 * Run:  bun run redact
 *   env: HF_TOKEN (optional) — Hugging Face token if the model repo is private.
 */

import { createInterface } from "node:readline";

import { createGuard, RAMPART_MODEL_ID } from "../index";

const ESC = "\x1b[";
const reset = `${ESC}0m`;
const dim = (s: string): string => `${ESC}2m${s}${reset}`;
const bold = (s: string): string => `${ESC}1m${s}${reset}`;

function ms(duration: number): string {
  return duration >= 100 ? `${duration.toFixed(0)} ms` : `${duration.toFixed(1)} ms`;
}

async function main(): Promise<void> {
  process.stdout.write(dim(`loading ${RAMPART_MODEL_ID}…\n`));
  const started = performance.now();
  const guard = await createGuard({ device: "cpu" });

  process.stdout.write(`${bold("rampart")} ${dim("· interactive redactor")}\n`);
  process.stdout.write(dim(`ready in ${ms(performance.now() - started)} · Ctrl-C to quit\n\n`));

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "> " });

  const handleLine = async (line: string): Promise<void> => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }
    const t0 = performance.now();
    const out = await guard.protect(input);
    const elapsed = performance.now() - t0;

    const count = out.placeholders.length;
    process.stdout.write(`${out.text}\n`);
    process.stdout.write(dim(`redacted in ${ms(elapsed)} · ${count} placeholder${count === 1 ? "" : "s"}\n\n`));
    rl.prompt();
  };

  let chain: Promise<void> = Promise.resolve();
  rl.on("line", (line) => {
    chain = chain.then(() => handleLine(line));
  });
  rl.on("close", () => {
    void chain.then(() => {
      process.stdout.write(dim("\nbye\n"));
      process.exit(0);
    });
  });
  rl.prompt();
}

void main();
