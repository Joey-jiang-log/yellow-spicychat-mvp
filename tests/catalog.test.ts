import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../src/data";

describe("public discovery catalog", () => {
  it("contains all 23 public demo characters with unique IDs", () => {
    expect(CHARACTERS).toHaveLength(23);
    expect(new Set(CHARACTERS.map(({ id }) => id)).size).toBe(23);
  });

  it("uses versioned optimized portrait paths for every catalog character", () => {
    for (const character of CHARACTERS) {
      expect(character.image).toMatch(/^\/characters\/optimized\/[a-z0-9-]+-900-v1\.jpg$/);
    }
  });
});
