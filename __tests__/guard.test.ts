import { describe, expect, it } from "vitest";
import { createGuard } from "../src/guard";
import { StreamingReveal, createRevealTransform } from "../src/streaming";
import { SessionEntityTable } from "../src/session";

describe("placeholder aliases", () => {
  // Heuristics-only (no NER model in tests): use structured PII the heuristic
  // layer detects. Name detection is covered by the NER eval, not unit tests.
  it("mints aliased placeholders and hides the raw value", async () => {
    const guard = await createGuard({ heuristicsOnly: true });
    const { text } = await guard.protect("my ssn is 888-12-3456");
    expect(text).toContain("[SSN_1]");
    expect(text).not.toContain("888-12-3456");
  });

  it("round-trips a placeholder back to the real value", async () => {
    const guard = await createGuard({ heuristicsOnly: true });
    await guard.protect("my ssn is 472-81-0094");
    expect(guard.reveal("Your record [SSN_1] is updated.")).toBe("Your record 472-81-0094 is updated.");
  });

  it("aliases GIVEN_NAME to NAME in minted tokens", () => {
    const table = new SessionEntityTable({ GIVEN_NAME: "NAME" });
    expect(table.placeholderFor("GIVEN_NAME", "Alex")).toBe("[NAME_1]");
    expect(table.placeholderFor("GIVEN_NAME", "alex")).toBe("[NAME_1]"); // case-folded reuse
    expect(table.placeholderFor("GIVEN_NAME", "Maya")).toBe("[NAME_2]");
    expect(table.rehydrate("[NAME_2] called")).toBe("Maya called");
  });
});

describe("StreamingReveal with split placeholders", () => {
  function resolverFor(map: Record<string, string>) {
    return (token: string): string | null => map[token] ?? null;
  }

  it("reveals a placeholder split across two chunks", () => {
    const reveal = new StreamingReveal(resolverFor({ "[NAME_1]": "Alex" }));
    let out = reveal.push("thanks [NA");
    out += reveal.push("ME_1] for waiting");
    out += reveal.flush();
    expect(out).toBe("thanks Alex for waiting");
  });

  it("reveals a placeholder split character-by-character", () => {
    const reveal = new StreamingReveal(resolverFor({ "[SSN_1]": "XXX" }));
    let out = "";
    for (const ch of "ref [SSN_1] end") out += reveal.push(ch);
    out += reveal.flush();
    expect(out).toBe("ref XXX end");
  });

  it("passes through a lone bracket that never becomes a token", () => {
    const reveal = new StreamingReveal(resolverFor({}));
    let out = reveal.push("array[0] is fine");
    out += reveal.flush();
    expect(out).toBe("array[0] is fine");
  });

  it("leaves unknown placeholders intact", () => {
    const reveal = new StreamingReveal(resolverFor({}));
    const out = reveal.push("[NAME_9] unknown") + reveal.flush();
    expect(out).toBe("[NAME_9] unknown");
  });
});

describe("createRevealTransform", () => {
  it("reveals across a chunked ReadableStream", async () => {
    const table = new SessionEntityTable({ GIVEN_NAME: "NAME" });
    table.placeholderFor("GIVEN_NAME", "Maya");
    const transform = createRevealTransform((t) => (table.knows(t) ? table.rehydrate(t) : null));

    const source = new ReadableStream<string>({
      start(controller) {
        controller.enqueue("hi [NA");
        controller.enqueue("ME_1]!");
        controller.close();
      },
    });

    const reader = source.pipeThrough(transform).getReader();
    let out = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      out += value;
    }
    expect(out).toBe("hi Maya!");
  });
});
