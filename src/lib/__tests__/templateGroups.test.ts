import { describe, it, expect } from "vitest";
import { groupTemplates, sortTemplates, dominantMode } from "../templateGroups";

const T = (
  id: string,
  mode: "depth" | "pool" | "dry" | "general",
  useCount = 0,
  sub = "",
) => ({
  id,
  name: id,
  mode,
  useCount,
  sub,
});

describe("groupTemplates", () => {
  it("puts each mode in its own column, in a fixed order, and drops empty ones", () => {
    const g = groupTemplates([T("a", "dry"), T("b", "depth"), T("c", "depth")]);
    expect(g.map((x) => x.mode)).toEqual(["depth", "dry"]);
    expect(g[0].items.map((x) => x.id)).toEqual(["b", "c"]);
  });
  it("sorts most-used first, then by name", () => {
    expect(
      sortTemplates([
        T("z", "depth", 1),
        T("a", "depth", 1),
        T("m", "depth", 9),
      ]).map((x) => x.id),
    ).toEqual(["m", "a", "z"]);
  });
  it("searches name and the secondary line, case-insensitively", () => {
    const items = [
      T("Monday CWT", "depth", 0, "CWT"),
      T("Statics", "dry", 0, "CO₂ table"),
    ];
    expect(
      groupTemplates(items, "co₂").flatMap((g) => g.items.map((x) => x.id)),
    ).toEqual(["Statics"]);
    expect(
      groupTemplates(items, "MONDAY").flatMap((g) => g.items.map((x) => x.id)),
    ).toEqual(["Monday CWT"]);
  });
});

describe("dominantMode", () => {
  it("is the mode most sessions use", () => {
    expect(
      dominantMode([{ mode: "pool" }, { mode: "depth" }, { mode: "pool" }]),
    ).toBe("pool");
  });
  it("breaks ties toward depth, and an empty week is general", () => {
    expect(dominantMode([{ mode: "pool" }, { mode: "depth" }])).toBe("depth");
    expect(dominantMode([])).toBe("general");
  });
});
