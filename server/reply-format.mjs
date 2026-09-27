export const formatReplyParagraphs = (content) => {
  const normalized = String(content || "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";

  const existingParagraphs = normalized.split(/\n\s*\n+/u).map((part) => part.trim()).filter(Boolean);
  if (existingParagraphs.length > 1) return existingParagraphs.join("\n\n");

  const sentences = normalized.match(/[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/gu)?.map((part) => part.trim()).filter(Boolean) ?? [normalized];
  if (sentences.length < 3 && normalized.length <= 180) return normalized;

  const separator = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(normalized) ? "" : " ";
  const paragraphs = [];
  let current = "";
  let sentencesInCurrent = 0;

  for (const sentence of sentences) {
    const next = current ? `${current}${separator}${sentence}` : sentence;
    if (current && (sentencesInCurrent >= 2 || next.length > 180)) {
      paragraphs.push(current);
      current = sentence;
      sentencesInCurrent = 1;
    } else {
      current = next;
      sentencesInCurrent += 1;
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs.length > 1 ? paragraphs.join("\n\n") : normalized;
};
