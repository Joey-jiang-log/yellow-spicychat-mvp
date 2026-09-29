export function detectImageIntent(text?: string): string | null;
export function selectTriggeredImage(input: {
  images: Array<Record<string, any>>;
  character: Record<string, any>;
  conversation: { messages?: Array<Record<string, any>> };
  userText: string;
  reply?: string;
  explicitIntent: string | null;
}): {
  image: Record<string, any> | null;
  intent: string | null;
  unlock: { unlocked: boolean; reason: string; turn: number; minTurns: number; sentImages: number; maxImages: number; remainingTurns?: number };
};
