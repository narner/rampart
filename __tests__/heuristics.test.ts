import { describe, expect, it } from "vitest";
import { detectHeuristics } from "../src/heuristics";

describe("SSN detection across separator variants", () => {
  // The core requirement: every separator form collapses to one rule.
  const variants = ["888-12-3456", "888 12 3456", "888.12.3456", "888123456"];
  for (const variant of variants) {
    it(`detects ${variant} as SSN`, () => {
      const found = detectHeuristics(`my ssn is ${variant}.`);
      const ssn = found.find((s) => s.label === "SSN");
      expect(ssn).toBeDefined();
      // The raw span covers the human-readable form whole, separators included.
      expect(ssn?.text).toBe(variant);
    });
  }

  it("rejects structurally invalid SSNs (000 area)", () => {
    const found = detectHeuristics("000-12-3456");
    expect(found.some((s) => s.label === "SSN")).toBe(false);
  });
});

describe("credit card detection", () => {
  it("matches a Luhn-valid 16-digit card with spaces", () => {
    const found = detectHeuristics("card 4111 1111 1111 1111 ok");
    expect(found.some((s) => s.label === "CREDIT_CARD")).toBe(true);
  });

  it("ignores a 16-digit run that fails Luhn", () => {
    const found = detectHeuristics("1234 5678 1234 5678");
    expect(found.some((s) => s.label === "CREDIT_CARD")).toBe(false);
  });
});

describe("IPv4, IPv6, and MAC detection", () => {
  it("detects IPv4 addresses", () => {
    expect(detectHeuristics("server 10.0.0.1 ok").find((s) => s.label === "IP_ADDRESS")?.text).toBe("10.0.0.1");
  });

  it("detects full and compressed IPv6 addresses", () => {
    for (const form of ["2001:0db8:85a3:0000:0000:8a2e:0370:7334", "2001:db8::1", "fe80::1ff:fe23:4567:890a", "::1"]) {
      const found = detectHeuristics(`host ${form} up`);
      expect(found.find((s) => s.label === "IP_ADDRESS")?.text, form).toBe(form);
    }
  });

  it("detects MAC addresses with colon and dash separators", () => {
    expect(detectHeuristics("mac 00:1B:44:11:3A:B7").find((s) => s.label === "IP_ADDRESS")?.text).toBe("00:1B:44:11:3A:B7");
    expect(detectHeuristics("mac 00-1B-44-11-3A-B7").find((s) => s.label === "IP_ADDRESS")?.text).toBe("00-1B-44-11-3A-B7");
  });

  it("does not fire IPv6 on clock times or short hex sequences", () => {
    expect(detectHeuristics("meet at 12:34:56 sharp").some((s) => s.label === "IP_ADDRESS")).toBe(false);
    expect(detectHeuristics("opcode ff:00 set").some((s) => s.label === "IP_ADDRESS")).toBe(false);
  });
});

describe("email detection", () => {
  it("detects a plain email", () => {
    expect(detectHeuristics("reach me at a@b.com ok").find((s) => s.label === "EMAIL")?.text).toBe("a@b.com");
  });

  it("detects plus-addressing and sub-domains", () => {
    expect(detectHeuristics("send to alex+housing@sub.example.gov today").find((s) => s.label === "EMAIL")?.text).toBe(
      "alex+housing@sub.example.gov",
    );
  });

  it("detects dotted local parts", () => {
    expect(detectHeuristics("mail maria.backup@example.org now").find((s) => s.label === "EMAIL")?.text).toBe(
      "maria.backup@example.org",
    );
  });
});

describe("url detection", () => {
  it("detects http(s) URLs with a path", () => {
    expect(detectHeuristics("see https://files.example.com/private/alex for the file").find((s) => s.label === "URL")?.text).toBe(
      "https://files.example.com/private/alex",
    );
  });

  it("detects schemeless www URLs", () => {
    expect(detectHeuristics("visit www.example.org/private/maya please").find((s) => s.label === "URL")?.text).toBe(
      "www.example.org/private/maya",
    );
  });

  it("does not fire URL on a bare domain word or sentence", () => {
    expect(detectHeuristics("the e.g. case, see U.S. law").some((s) => s.label === "URL")).toBe(false);
  });
});

describe("detectors deferred to the model (no heuristic span)", () => {
  // Heuristics emit structured + text-shaped PII: SSN, CREDIT_CARD, IP_ADDRESS,
  // EMAIL, URL. Names, phone, and address components are left to the NER model.
  it("does not detect phone or street address", () => {
    const found = detectHeuristics("call 415-555-2671, 31 Birchwood Avenue Old Lyme CT 06371");
    const labels = new Set(found.map((s) => s.label));
    for (const absent of ["PHONE", "STREET_ADDRESS"]) {
      expect(labels.has(absent as never), absent).toBe(false);
    }
  });

  it("does not detect government ids, passports, licenses, accounts, or secrets", () => {
    const found = detectHeuristics(
      "case AGY-2026-009871 passport X12345678 license D1234567 " +
        "bank account number is 123456789012 token sk-test-1234567890abcdef",
    );
    const labels = new Set(found.map((s) => s.label));
    for (const absent of ["GOVERNMENT_ID", "PASSPORT", "DRIVERS_LICENSE", "BANK_ACCOUNT", "SECRET"]) {
      expect(labels.has(absent as never), absent).toBe(false);
    }
  });
});
