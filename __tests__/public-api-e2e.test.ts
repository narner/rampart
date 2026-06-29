import { describe, expect, it } from "vitest";
import { PUBLIC_E2E_CASES, type EvalTerm } from "../eval/public-cases";
import { createGuard } from "../src/guard";
import type { Span } from "../src/types";

function spansForTerm(text: string, term: EvalTerm): Span[] {
  const spans: Span[] = [];
  let start = text.indexOf(term.text);
  while (start >= 0) {
    spans.push({
      start,
      end: start + term.text.length,
      label: term.label,
      score: 0.99,
      source: "ner",
      text: term.text,
    });
    start = text.indexOf(term.text, start + term.text.length);
  }
  return spans;
}

function fixtureNerFor(privateTerms: readonly EvalTerm[]) {
  return async (text: string): Promise<Span[]> => privateTerms.flatMap((term) => spansForTerm(text, term));
}

describe("public API end-to-end redaction cases", () => {
  it.each(PUBLIC_E2E_CASES)("$id", async (testCase) => {
    const guard = await createGuard({ ner: fixtureNerFor(testCase.privateTerms) });
    const result = await guard.protect(testCase.input);

    for (const term of testCase.privateTerms) {
      expect(result.text).not.toContain(term.text);
    }
    for (const term of testCase.publicTerms) {
      expect(result.text).toContain(term);
    }

    const roundTrip = guard.reveal(result.placeholders.join(" "));
    for (const term of testCase.privateTerms) {
      expect(roundTrip).toContain(term.text);
    }
  });
});
