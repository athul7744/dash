/// <reference types="vitest/globals" />

import { buildActionVocabulary, caseKey, editDistance, rankActionMatches, stemKey } from "@/lib/events/actions";

describe("caseKey", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(caseKey("  Repaired ")).toBe("repaired");
    expect(caseKey("Filter   Cleaned")).toBe("filter cleaned");
    expect(caseKey("")).toBe("");
  });
});

describe("stemKey", () => {
  it("collapses inflections of the same verb", () => {
    const k = stemKey("Repaired");
    expect(stemKey("repairing")).toBe(k);
    expect(stemKey("repairs")).toBe(k);
    expect(stemKey("repair")).toBe(k);
  });

  it("collapses the call and service families", () => {
    expect(stemKey("called")).toBe(stemKey("calling"));
    expect(stemKey("called")).toBe(stemKey("call"));
    expect(stemKey("serviced")).toBe(stemKey("servicing"));
    expect(stemKey("serviced")).toBe(stemKey("service"));
  });

  it("guards -ss words and short tokens", () => {
    expect(stemKey("address")).toBe("address"); // not "addres"
    expect(stemKey("addresses")).toBe("address");
    expect(stemKey("ran")).toBe("ran"); // <= 3 chars, untouched
  });

  it("stems each token of a multi-word action", () => {
    expect(stemKey("Filter cleaned")).toBe(stemKey("filter cleaning"));
  });
});

describe("editDistance", () => {
  it("measures single edits", () => {
    expect(editDistance("serviced", "serviced")).toBe(0);
    expect(editDistance("serviec", "servic")).toBeLessThanOrEqual(2);
    expect(editDistance("cat", "dog")).toBe(3);
  });
});

describe("buildActionVocabulary", () => {
  it("dedupes by caseKey and picks the most-used surface form", () => {
    const v = buildActionVocabulary([
      { action: "Repaired", count: 3 },
      { action: "repaired", count: 1 },
      { action: "Called", count: 2 },
    ]);
    const repaired = v.find((e) => e.caseKey === "repaired")!;
    expect(repaired.display).toBe("Repaired"); // higher count wins
    expect(repaired.count).toBe(4); // counts summed
    expect(v.map((e) => e.display)).toContain("Called");
  });

  it("keeps stem-siblings as separate entries (never merges tense)", () => {
    const v = buildActionVocabulary([
      { action: "Repaired", count: 2 },
      { action: "Repairing", count: 1 },
    ]);
    expect(v).toHaveLength(2);
  });

  it("ignores blank actions", () => {
    expect(buildActionVocabulary([{ action: "   ", count: 5 }])).toEqual([]);
  });
});

describe("rankActionMatches", () => {
  const vocab = buildActionVocabulary([
    { action: "Repaired", count: 5 },
    { action: "Serviced", count: 3 },
    { action: "Cleaned", count: 2 },
  ]);

  it("marks an exact case-key match", () => {
    const m = rankActionMatches("repaired", vocab);
    expect(m[0].kind).toBe("exact");
    expect(m[0].entry.display).toBe("Repaired");
  });

  it("offers a fuzzy typo as didYouMean, not exact", () => {
    const m = rankActionMatches("serviec", vocab);
    const hit = m.find((r) => r.entry.display === "Serviced");
    expect(hit?.kind).toBe("didYouMean");
  });

  it("treats a substring as reuse", () => {
    const m = rankActionMatches("clean", vocab);
    expect(m.find((r) => r.entry.display === "Cleaned")?.kind).toBe("reuse");
  });

  it("returns the whole vocabulary for an empty query", () => {
    expect(rankActionMatches("", vocab)).toHaveLength(vocab.length);
  });
});
