import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, CheckCircle2, CreditCard, Sparkles, X } from "lucide-react";
import { creditPacks, getPlanPrice, plans, type BillingPeriod } from "./pricing-data";
import "./pricing-create.css";

type Props = { onBack: () => void };

export default function PricingPage({ onBack }: Props) {
  const [period, setPeriod] = useState<BillingPeriod>("yearly");
  const [selected, setSelected] = useState("Plus");
  const [checkout, setCheckout] = useState<{ title: string; details: string } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!checkout) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openerRef.current = opener;
    closeRef.current?.focus();
    const key = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") setCheckout(null); };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      requestAnimationFrame(() => openerRef.current?.focus());
    };
  }, [Boolean(checkout)]);
  const trapCheckoutTab = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button, [href], input, textarea, select, [tabindex]:not([tabindex=\"-1\"])")).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !event.currentTarget.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !event.currentTarget.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  };
  const closeCheckout = () => setCheckout(null);
  return <>
    <div className="pricing-wrap">
      <div className="pricing-heading"><span className="eyebrow"><Sparkles size={13} /> LUREVA MEMBERSHIP</span><h1>Choose your plan</h1><p>Upgrade your experience with more conversations and thoughtful extras.</p>
        <p className="pricing-preview-notice" role="note">Plan preview only — billing and paid benefits are not connected in this demo.</p>
        <div className="billing-switch" role="group" aria-label="Billing period"><button className={period === "monthly" ? "active" : ""} aria-pressed={period === "monthly"} onClick={() => setPeriod("monthly")}>Monthly</button><button className={period === "yearly" ? "active" : ""} aria-pressed={period === "yearly"} onClick={() => setPeriod("yearly")}>Yearly <span>Save up to 50%</span></button></div>
      </div>
      <div className="pricing-grid">{plans.map((plan) => { const price = getPlanPrice(plan, period); return <article key={plan.name} className={`pricing-card ${selected === plan.name ? "is-selected" : ""} ${"recommended" in plan && plan.recommended ? "is-recommended" : ""}`} onClick={() => setSelected(plan.name)}>
        {"recommended" in plan && plan.recommended && <div className="recommended-ribbon">BEST VALUE</div>}
        <div className="pricing-card-head"><div><span className="plan-icon"><Sparkles size={15} /></span><h2>{plan.name}</h2></div><span className="saving-badge">{period === "yearly" ? `Save ${price.discountPercent}%` : "Monthly billing"}</span></div>
        <p className="plan-description">{plan.description}</p><div className="plan-price"><strong>${price.monthlyEquivalent.toFixed(2)}</strong><span> / month</span></div><div className="billing-detail">{period === "yearly" ? `$${price.total.toFixed(2)} billed yearly` : `$${price.total.toFixed(2)} billed monthly`}{period === "yearly" && <s>${plan.monthly.toFixed(2)}/mo</s>}</div>
        <button className={`plan-cta ${selected === plan.name ? "selected" : ""}`} onClick={(event) => { event.stopPropagation(); setSelected(plan.name); setCheckout({ title: `${plan.name} membership`, details: period === "yearly" ? `$${price.total.toFixed(2)} billed yearly · $${price.monthlyEquivalent.toFixed(2)} per month` : `$${price.total.toFixed(2)} billed monthly` }); }}>{selected === plan.name ? "Preview this plan" : `Preview ${plan.name}`}</button>
        <div className="plan-feature-title">What’s included</div><ul className="plan-features">{plan.features.map((feature) => <li key={feature}><Check size={15} />{feature}</li>)}{plan.excluded.map((feature) => <li className="not-included" key={feature}><span>−</span>{feature}</li>)}</ul>
      </article>; })}</div>
      <section className="credits-section"><div className="credits-heading"><div><span className="eyebrow">CREDIT PACK PREVIEW</span><h2>Buy credits</h2><p>Illustrative packs for future image features. Demo credits are not issued.</p></div><span className="credit-note">Preview only</span></div><div className="credits-grid">{creditPacks.map((pack) => { const popular = "popular" in pack && pack.popular; return <article className={`credit-card ${popular ? "popular" : ""}`} key={pack.credits}>{popular && <span className="credit-popular">POPULAR</span>}<div className="credit-icon"><CreditCard size={17} /></div><h3>{pack.credits} <small>credits</small></h3><p>{pack.output}</p><div className="credit-buy-row"><strong>{pack.price}</strong><button onClick={() => setCheckout({ title: `${pack.credits} credits`, details: `${pack.price} · one-time payment preview` })}>Preview pack</button></div></article>; })}</div></section>
      <p className="pricing-footnote"><CheckCircle2 size={14} /> Demo pricing only. Checkout does not charge a card or enable real paid features.</p>
    </div>
    {checkout && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCheckout(); }}><section className="checkout-placeholder" role="dialog" aria-modal="true" aria-labelledby="checkout-title" onKeyDown={trapCheckoutTab}><button ref={closeRef} className="modal-close" onClick={closeCheckout} aria-label="Close"><X size={18} /></button><div className="checkout-placeholder-icon"><CreditCard size={23} /></div><span className="eyebrow">CHECKOUT PREVIEW · DEMO</span><h2 id="checkout-title">{checkout.title}</h2><strong className="checkout-selected-price">{checkout.details}</strong><p>This is a payment preview. No payment method is connected, no charge will be made, and your account will not be upgraded.</p><div className="checkout-placeholder-status">Payment integration not configured</div><button className="primary-button full" onClick={() => { closeCheckout(); onBack(); }}>Return to your story</button></section></div>}
  </>;
}
