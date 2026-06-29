import { describe, expect, it } from "vitest";
import { applyPolicy, mergeSpans } from "../src/policy";
import { ChatGuard } from "../src/guard";
import { SessionEntityTable } from "../src/session";
import { KEEP_LABELS, resolveKeepLabels, shouldRedact, type Span } from "../src/types";

function span(start: number, end: number, label: Span["label"], score: number, source: Span["source"] = "ner"): Span {
  return { start, end, label, score, source, text: "x".repeat(end - start) };
}

describe("policy default-deny", () => {
  it("keeps city/state/zip, redacts the rest", () => {
    const spans = [
      span(0, 5, "CITY", 1),
      span(6, 10, "GIVEN_NAME", 0.9),
      span(11, 14, "STATE", 1),
      span(15, 20, "ZIP_CODE", 1),
      span(21, 30, "STREET_NAME", 1),
    ];
    const redactable = applyPolicy(spans);
    expect(redactable.map((s) => s.label).sort()).toEqual(["GIVEN_NAME", "STREET_NAME"]);
  });

  it("merges overlaps preferring higher confidence", () => {
    const merged = mergeSpans([span(0, 10, "GIVEN_NAME", 0.6), span(2, 8, "SURNAME", 0.95)]);
    expect(merged).toHaveLength(1);
    expect(merged[0].label).toBe("SURNAME");
  });

  it("returns redactable spans sorted right-to-left", () => {
    const out = applyPolicy([span(0, 3, "GIVEN_NAME", 1), span(10, 13, "SSN", 1)]);
    expect(out[0].start).toBeGreaterThan(out[1].start);
  });

  it("honors a custom keep-set", () => {
    const spans = [span(0, 5, "CITY", 1), span(6, 10, "GIVEN_NAME", 0.9), span(11, 14, "STATE", 1)];
    const strict = resolveKeepLabels([]);
    expect(applyPolicy(spans, strict).map((s) => s.label).sort()).toEqual(["CITY", "GIVEN_NAME", "STATE"]);
  });

  it("defaults to KEEP_LABELS when keep-set is omitted", () => {
    expect(shouldRedact("CITY")).toBe(false);
    expect(shouldRedact("GIVEN_NAME")).toBe(true);
    expect(resolveKeepLabels()).toBe(KEEP_LABELS);
  });
});

describe("session entity table", () => {
  it("assigns stable placeholders per value", () => {
    const t = new SessionEntityTable();
    expect(t.placeholderFor("GIVEN_NAME", "John")).toBe("[GIVEN_NAME_1]");
    expect(t.placeholderFor("GIVEN_NAME", "john")).toBe("[GIVEN_NAME_1]"); // case-folded reuse
    expect(t.placeholderFor("GIVEN_NAME", "Jane")).toBe("[GIVEN_NAME_2]");
    expect(t.placeholderFor("SSN", "888-12-3456")).toBe("[SSN_1]");
  });

  it("rehydrates placeholders back to raw values", () => {
    const t = new SessionEntityTable();
    const token = t.placeholderFor("GIVEN_NAME", "John");
    expect(t.rehydrate(`Hello ${token}, how are you?`)).toBe("Hello John, how are you?");
  });
});

describe("configurable keepLabels", () => {
  it("redacts geography when keep-set is empty", async () => {
    const ner = async () => [
      { start: 0, end: 6, label: "CITY" as const, score: 1, source: "ner" as const, text: "Austin" },
      { start: 7, end: 9, label: "STATE" as const, score: 1, source: "ner" as const, text: "TX" },
      { start: 10, end: 15, label: "ZIP_CODE" as const, score: 1, source: "ner" as const, text: "78701" },
      { start: 16, end: 20, label: "GIVEN_NAME" as const, score: 0.9, source: "ner" as const, text: "John" },
    ];
    const guard = new ChatGuard({ ner, keepLabels: [] });
    const { text } = await guard.protect("Austin TX 78701 John");
    expect(text).toBe("[CITY_1] [STATE_1] [ZIP_CODE_1] [GIVEN_NAME_1]");
  });

  it("keeps extra labels when caller widens the keep-set", () => {
    const spans: Span[] = [
      { start: 0, end: 3, label: "BUILDING_NUMBER", score: 1, source: "ner", text: "123" },
      { start: 4, end: 8, label: "STREET_NAME", score: 1, source: "ner", text: "Pine" },
      { start: 9, end: 15, label: "CITY", score: 1, source: "ner", text: "Austin" },
    ];
    const keep = resolveKeepLabels(["CITY", "STATE", "ZIP_CODE", "BUILDING_NUMBER", "STREET_NAME"]);
    expect(applyPolicy(spans, keep)).toEqual([]);
  });

  it("threads keepLabels through SessionEntityTable", () => {
    const table = new SessionEntityTable({}, resolveKeepLabels(["CITY"]));
    const { text } = table.scrub("Austin John", [
      { start: 0, end: 6, label: "CITY", score: 1, source: "ner", text: "Austin" },
      { start: 7, end: 11, label: "GIVEN_NAME", score: 1, source: "ner", text: "John" },
    ]);
    expect(text).toBe("Austin [GIVEN_NAME_1]");
  });
});

describe("pipeline end-to-end (heuristics only)", () => {
  it("scrubs structured PII but keeps the surrounding text", async () => {
    const guard = new ChatGuard();
    const { text } = await guard.protect("My ssn is 888 12 3456 and income is 50000.");
    expect(text).not.toContain("888 12 3456");
    expect(text).toContain("[SSN_1]");
    expect(text).toContain("50000"); // income is kept
  });

  it("round-trips placeholders through a model reply", async () => {
    const guard = new ChatGuard();
    await guard.protect("My ssn is 888-12-3456 please");
    const reply = guard.reveal("I used [SSN_1] for you.");
    expect(reply).toBe("I used 888-12-3456 for you.");
  });
});
