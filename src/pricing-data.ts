export type BillingPeriod = "monthly" | "yearly";

export const plans = [
  { name: "Basic", monthly: 7.5, yearly: 4.5, description: "A little more room for your favorite stories.", features: ["2,000 messages / month", "Chat with every character", "Standard response speed", "Conversation history"], excluded: ["Advanced model", "Long-term memory", "Priority access"] },
  { name: "Plus", monthly: 16, yearly: 8, description: "For the stories you want to keep going.", features: ["8,000 messages / month", "Everything in Basic", "Advanced model", "Long-term memory", "Faster responses"], excluded: ["Priority access to new features"], recommended: true },
  { name: "Studio", monthly: 36, yearly: 18, description: "More space to explore every possibility.", features: ["20,000 messages / month", "Everything in Plus", "Image messages", "Extended context", "Priority access to new features"], excluded: [] },
] as const;

export const creditPacks = [
  { credits: "1,000", output: "About 100 image generations", price: "$4" },
  { credits: "5,000", output: "About 500 image generations", price: "$16", popular: true },
  { credits: "12,000", output: "About 1,200 image generations", price: "$32" },
] as const;

export function getPlanPrice(plan: (typeof plans)[number], period: BillingPeriod) {
  const monthlyEquivalent = period === "yearly" ? plan.yearly : plan.monthly;
  const total = monthlyEquivalent * (period === "yearly" ? 12 : 1);
  const discountPercent = period === "yearly" ? Math.round((1 - plan.yearly / plan.monthly) * 100) : 0;
  return { monthlyEquivalent, total, discountPercent };
}
