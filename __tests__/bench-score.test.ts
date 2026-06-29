import { describe, expect, it } from "vitest";
import { wilsonCi, iou, matchSpans, f1, redactText, termPresence, expectedCalibrationError, Stratum } from "../eval/bench/score";

describe("wilsonCi matches the committed bench output", () => {
  it("reproduces the published headline CI (k=129625, n=131707)", () => {
    // eval/bench/runs/m06-v3-30k/summary.json:
    //   private_recall 0.98419218, wilson95 [0.98350428, 0.98485184]
    const [lo, hi] = wilsonCi(131707 - 2082, 131707);
    expect(lo).toBeCloseTo(0.9835043, 6);
    expect(hi).toBeCloseTo(0.9848518, 6);
  });

  it("returns [0,1] for n=0", () => {
    expect(wilsonCi(0, 0)).toEqual([0, 1]);
  });
});

describe("span IoU + greedy matching", () => {
  it("computes IoU as intersection over union", () => {
    expect(iou({ label: "PERSON", start: 0, end: 10 }, { label: "PERSON", start: 0, end: 10 })).toBe(1);
    expect(iou({ label: "PERSON", start: 0, end: 10 }, { label: "PERSON", start: 5, end: 15 })).toBeCloseTo(5 / 15, 9);
    expect(iou({ label: "PERSON", start: 0, end: 5 }, { label: "PERSON", start: 5, end: 9 })).toBe(0);
  });

  it("matches one-to-one, highest score first, label-aware", () => {
    const gold = [
      { label: "PERSON", start: 0, end: 5 },
      { label: "PERSON", start: 10, end: 15 },
    ];
    const pred = [
      { label: "PERSON", start: 0, end: 5, score: 0.9 }, // exact -> TP at IoU=1
      { label: "PERSON", start: 10, end: 14, score: 0.8 }, // partial -> FP at IoU=1
      { label: "EMAIL", start: 10, end: 15, score: 1 }, // wrong label -> FP
    ];
    const strict = matchSpans(gold, pred, 1);
    expect(strict).toEqual({ tp: 1, fp: 2, fn: 1 });
    expect(f1(strict.tp, strict.fp, strict.fn).f1).toBeCloseTo((2 * (1 / 3) * (1 / 2)) / (1 / 3 + 1 / 2), 9);
    // at IoU>=0.5 the partial PERSON now counts
    expect(matchSpans(gold, pred, 0.5)).toEqual({ tp: 2, fp: 1, fn: 0 });
  });
});

describe("term presence", () => {
  it("counts leaks and over-redactions against the redacted text", () => {
    const raw = "Jose Nunez lives in Austin";
    const redacted = redactText(raw, [{ label: "PERSON", start: 0, end: 10 }]); // "[PERSON] lives in Austin"
    const r = termPresence(redacted, ["Jose Nunez"], ["Austin"]);
    expect(r).toEqual({ leaked: 0, protectedCount: 1, over: 0, retained: 1 });

    const leakedRow = termPresence("Jose Nunez lives in Austin", ["Jose Nunez"], ["Austin"]);
    expect(leakedRow.leaked).toBe(1);
    expect(leakedRow.over).toBe(0);
  });
});

describe("ECE", () => {
  it("is ~0 for perfectly-calibrated bins and large for over-confident wrong predictions", () => {
    expect(expectedCalibrationError([[0.97, true], [0.95, true]])).toBeLessThan(0.06);
    expect(expectedCalibrationError([[1, false], [1, false]])).toBeCloseTo(1, 6);
  });
});

describe("Stratum aggregation", () => {
  it("aggregates term results into the summary.json shape", () => {
    const s = new Stratum();
    s.addTerm({ leaked: 0, protectedCount: 3, over: 1, retained: 4 });
    s.addTerm({ leaked: 1, protectedCount: 2, over: 0, retained: 2 });
    const r = s.report() as Record<string, number>;
    expect(r.rows).toBe(2);
    expect(r.private_total).toBe(6); // 3 + 2 + 1 leaked
    expect(r.leaked).toBe(1);
    expect(r.private_recall).toBeCloseTo(5 / 6, 9);
    expect(r.public_total).toBe(7);
    expect(r.over_redacted).toBe(1);
    expect(r.public_retained).toBeCloseTo(6 / 7, 9);
  });
});
