import { describe, expect, it } from "vitest";
import { premask, projectMaskedSpan, sentinelFor } from "../src/premask";
import { ChatGuard } from "../src/guard";
import type { Span } from "../src/types";

function heur(start: number, end: number, label: Span["label"], text: string): Span {
  return { start, end, label, score: 1, source: "heuristic", text };
}

describe("premask", () => {
  it("substitutes heuristic spans with label sentinels", () => {
    const raw = "my ssn is 472-81-0094 ok";
    const spans = [heur(10, 21, "SSN", "472-81-0094")];
    const { masked } = premask(raw, spans);
    expect(masked).toBe("my ssn is [SSN] ok");
  });

  it("maps verbatim text 1:1 back to raw offsets", () => {
    const raw = "card 4111 1111 1111 1111 here";
    const spans = [heur(5, 24, "CREDIT_CARD", "4111 1111 1111 1111")];
    const map = premask(raw, spans);
    // "here" appears after the sentinel in masked; project it back.
    const hereMasked = map.masked.indexOf("here");
    const projected = projectMaskedSpan(
      { start: hereMasked, end: hereMasked + 4, label: "CITY", score: 0.9, source: "ner", text: "here" },
      raw,
      map,
    );
    expect(projected).not.toBeNull();
    expect(raw.slice(projected!.start, projected!.end)).toBe("here");
  });

  it("projects a span landing inside a sentinel back onto the source span range", () => {
    const raw = "ip 10.0.0.1 done";
    const spans = [heur(3, 11, "IP_ADDRESS", "10.0.0.1")];
    const map = premask(raw, spans);
    const sentinelAt = map.masked.indexOf(sentinelFor("IP_ADDRESS"));
    const projected = projectMaskedSpan(
      { start: sentinelAt, end: sentinelAt + 4, label: "CITY", score: 0.5, source: "ner", text: "" },
      raw,
      map,
    );
    expect(projected).not.toBeNull();
    expect(projected!.start).toBe(3);
    expect(projected!.end).toBe(11);
  });

  it("handles multiple spans and preserves order", () => {
    const raw = "ssn 472-81-0094 and ip 10.0.0.1";
    const spans = [heur(4, 15, "SSN", "472-81-0094"), heur(23, 31, "IP_ADDRESS", "10.0.0.1")];
    const { masked } = premask(raw, spans);
    expect(masked).toBe("ssn [SSN] and ip [IP_ADDRESS]");
  });
});

describe("pipeline premask integration", () => {
  it("feeds the model masked text and merges projected spans onto raw", async () => {
    const raw = "Maya at 472-81-0094 lives in Reno";
    let sawByModel = "";
    // Mock NER: record what it received, and label "Maya" (offsets into masked).
    const ner = async (text: string): Promise<Span[]> => {
      sawByModel = text;
      const at = text.indexOf("Maya");
      return [{ start: at, end: at + 4, label: "GIVEN_NAME", score: 0.95, source: "ner", text: "Maya" }];
    };
    const guard = new ChatGuard({ ner });
    const { text } = await guard.protect(raw);

    // The model must never have seen the raw SSN.
    expect(sawByModel).not.toContain("472-81-0094");
    expect(sawByModel).toContain("[SSN]");
    // Both the heuristic SSN and the model's name are redacted with raw offsets.
    expect(text).toContain("[SSN_1]");
    expect(text).toContain("[GIVEN_NAME_1]");
    expect(text).not.toContain("472-81-0094");
    expect(text).not.toContain("Maya");
    // Kept geography stays.
    expect(text).toContain("Reno");
  });
});
