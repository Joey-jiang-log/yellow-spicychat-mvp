const sceneRules = [
  { intent: "cinema", pattern: /\b(cinema|movie theater|movie theatre|popcorn|watch(?:ing)? a movie)\b|电影院|影院|爆米花|看电影|电影/i },
  { intent: "bookstore", pattern: /\b(bookstore|bookshop|library|reading|read a book)\b|书店|图书馆|看书|读书/i },
  { intent: "study", pattern: /\b(study|studying|homework|assignment|desk|laptop|work together)\b|学习|作业|写作|办公|工作|笔记本电脑/i },
  { intent: "cozy_home", pattern: /\b(at home|go home|sofa|couch|blanket|remote|watch tv|relaxing at home)\b|回家|在家|家里|沙发|毯子|遥控器|看电视|休息|抱枕|居家/i },
  { intent: "cafe", pattern: /\b(coffee|cafe|café|latte|coffee shop|tea shop)\b|咖啡馆|咖啡|拿铁|茶馆/i },
];

export function detectImageIntent(text = "") {
  for (const rule of sceneRules) if (rule.pattern.test(String(text))) return rule.intent;
  return null;
}

const userTurnCount = (messages) => messages.filter((message) => message.role === "user").length;

function lastImageTurn(messages, imageId = null) {
  let turns = 0;
  let result = null;
  for (const message of messages) {
    if (message.role === "user") turns += 1;
    else if (message.role === "assistant" && message.imageId && (!imageId || message.imageId === imageId)) result = turns;
  }
  return result;
}

function intentMatches(image, intent, text) {
  if (image.triggerType === "round") return false;
  const configuredIntent = String(image.triggerCondition?.intent || "").toLowerCase();
  if (intent && (image.tags.some((tag) => tag.toLowerCase() === intent) || configuredIntent === intent)) return true;
  if (image.triggerType !== "keyword") return false;
  const keywords = Array.isArray(image.triggerCondition?.keywords) ? image.triggerCondition.keywords : [];
  return keywords.some((keyword) => keyword && String(text).toLowerCase().includes(String(keyword).toLowerCase()));
}

export function selectTriggeredImage({ images, character, conversation, userText, explicitIntent }) {
  const messages = conversation?.messages || [];
  const policy = {
    enabled: character.imageUnlockEnabled !== false,
    minTurns: Math.max(1, Number(character.imageUnlockMinTurns) || 2),
    cooldownTurns: Math.max(0, Number(character.imageUnlockCooldownTurns) || 0),
    maxImages: Math.max(0, Number.isFinite(Number(character.imageUnlockMaxImagesPerConversation)) ? Number(character.imageUnlockMaxImagesPerConversation) : 3),
  };
  const turn = userTurnCount(messages) + 1;
  const sentImages = messages.filter((message) => message.role === "assistant" && message.imageId).length;
  // Scene cards should follow the user's lead, not a scene the model happened
  // to mention while replying to an unrelated message.
  const intent = explicitIntent || detectImageIntent(userText) || null;
  const status = (reason, extra = {}) => ({ image: null, intent, unlock: { unlocked: false, reason, turn, minTurns: policy.minTurns, sentImages, maxImages: policy.maxImages, ...extra } });

  if (!policy.enabled) return status("disabled");
  if (turn < policy.minTurns) return status("locked_until_min_turns", { remainingTurns: policy.minTurns - turn });
  if (sentImages >= policy.maxImages) return status("conversation_limit_reached");

  const previousImageTurn = lastImageTurn(messages);
  const turnCooldown = policy.cooldownTurns;
  if (previousImageTurn !== null && turn - previousImageTurn < turnCooldown) {
    return status("cooldown", { remainingTurns: turnCooldown - (turn - previousImageTurn) });
  }

  const candidates = images.filter((image) => {
    if (image.characterId !== character.id || !image.enabled) return false;
    if (image.triggerType === "round") {
      const from = Math.max(1, Number(image.triggerCondition?.fromTurn) || 1);
      const to = Math.max(from, Number(image.triggerCondition?.toTurn) || from);
      return turn >= from && turn <= to;
    }
    return intentMatches(image, intent, userText || "");
  }).filter((image) => {
    const sentTurn = lastImageTurn(messages, image.id);
    return sentTurn === null;
  }).sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0));

  const image = candidates[0] || null;
  return image
    ? { image, intent: image.triggerType === "round" ? `round_${turn}` : (intent || null), unlock: { unlocked: true, reason: "image_matched", turn, minTurns: policy.minTurns, sentImages, maxImages: policy.maxImages } }
    : status("no_scene_match");
}
