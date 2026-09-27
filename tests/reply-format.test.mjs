import { describe, expect, it } from "vitest";
import { formatReplyParagraphs } from "../server/reply-format.mjs";

describe("formatReplyParagraphs", () => {
  it("preserves explicit paragraph breaks and normalizes line endings", () => {
    expect(formatReplyParagraphs("First beat.\r\n\r\nSecond beat. 😊")).toBe("First beat.\n\nSecond beat. 😊");
  });

  it("breaks longer unformatted replies into readable paragraphs", () => {
    expect(formatReplyParagraphs("She smiles at the familiar joke. She sets two mugs on the table. Then she asks what you want to watch."))
      .toBe("She smiles at the familiar joke. She sets two mugs on the table.\n\nThen she asks what you want to watch.");
  });

  it("keeps short replies compact", () => {
    expect(formatReplyParagraphs("Sure, I saved you the last cookie 😊")).toBe("Sure, I saved you the last cookie 😊");
  });
});
