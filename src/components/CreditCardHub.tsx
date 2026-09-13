import { useState, useEffect, useRef } from "react";
import {
  CreditCard, Plus, Trash2, Star, Zap, ShieldCheck,
  TrendingUp, AlertTriangle, ChevronDown, ChevronUp,
  Sparkles, Gift, X, ChevronRight,
} from "lucide-react";
import type { Expense } from "@/hooks/useExpenses";
import type { UserProfile } from "@/hooks/useAuth";
import { usePresetCards, type PresetCard } from "@/hooks/usePresetCards";

interface UserCard {
  presetId?: string; name: string; issuer: string; network: string;
  annualFee: number; rewardType: "points" | "cashback" | "miles";
  baseReward: number; rewards: { [category: string]: number };
  centsPerPoint: number; cardBg: string; color: string;
  creditLimit?: number; currentBalance?: number;
  signupBonus?: string; signupSpend?: number; spentTowardBonus?: number;
  id: string;
  cardType?: "credit" | "debit";
}

// Backend is the source of truth (see /cards in wealthwise-backend) — this used
// to read/write localStorage directly and never synced across devices.
// migrateLocalData() still pushes any pre-existing localStorage cards to the
// API once on login; this file talks to the API from here on.
//
// getExpenseCardOptions() in useExpenses.ts (used by ExpenseForm and AIChat for
// reward calculation) still reads this same key *synchronously*, so it's kept
// as a same-shape read cache on every successful fetch/add/remove below — a
// mirror of the backend, not a second source of truth. If that synchronous
// reward-calc path is ever made async, this mirror can be deleted.
const CARDS_CACHE_KEY = (userId?: string) => `ww_cards_${userId || "anon"}`;
function cacheCards(cards: UserCard[], userId?: string) {
  try { localStorage.setItem(CARDS_CACHE_KEY(userId), JSON.stringify(cards)); } catch {}
}

const API = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

async function fetchCards(): Promise<UserCard[]> {
  try {
    const res = await apiFetch("/cards");
    if (!res.ok) return [];
    const data = await res.json();
    return data.success && Array.isArray(data.cards) ? data.cards : [];
  } catch {
    console.warn("Cards fetch failed");
    return [];
  }
}
function createCard(card: UserCard): Promise<Response> {
  return apiFetch("/cards", { method: "POST", body: JSON.stringify(card) });
}
function deleteCardRemote(id: string): Promise<Response> {
  return apiFetch(`/cards/${id}`, { method: "DELETE" });
}

const CATEGORY_MATCH: Record<string, string[]> = {
  "Food & Dining": ["food","dining","restaurant","eat","lunch","dinner","breakfast","cafe","coffee"],
  Groceries: ["grocery","groceries","supermarket","market","whole foods","costco"],
  Travel: ["travel","flight","hotel","airbnb","uber","lyft","taxi","airline","air"],
  Gas: ["gas","fuel","shell","chevron","bp","exxon"],
  Streaming: ["netflix","spotify","hulu","disney","streaming","apple tv","hbo"],
  Shopping: ["amazon","shop","store","target","walmart","retail"],
  Entertainment: ["entertainment","movie","concert","show","ticket"],
};
function mapCategory(cat: string): string {
  const lower = cat.toLowerCase();
  for (const [c, keys] of Object.entries(CATEGORY_MATCH)) {
    if (keys.some(k => lower.includes(k))) return c;
  }
  return cat;
}
function getCardRate(card: UserCard, cat: string): number {
  const mapped = mapCategory(cat);
  return card.rewards[mapped] ?? card.rewards[cat] ?? card.baseReward;
}
function getEffectiveCashback(card: UserCard, cat: string, amount: number): number {
  return (getCardRate(card, cat) * card.centsPerPoint * amount) / 100;
}
function getBestCard(cards: UserCard[], cat: string): UserCard | null {
  if (!cards.length) return null;
  return cards.reduce((best, card) =>
    getCardRate(card, cat) * card.centsPerPoint > getCardRate(best, cat) * best.centsPerPoint ? card : best
  );
}
function recommendNextCard(owned: UserCard[], expenses: Expense[], presets: PresetCard[]): { card: PresetCard; reason: string } | null {
  const ownedIds = new Set(owned.map(c => c.presetId).filter(Boolean));
  const available = presets.filter(c => !ownedIds.has(c.id));
  if (!available.length || !expenses.length) return null;
  const catTotals: Record<string, number> = {};
  for (const e of expenses) { const c = mapCategory(e.category); catTotals[c] = (catTotals[c] || 0) + e.amount; }
  let best: PresetCard | null = null, bestLift = 0, bestReason = "";
  for (const preset of available) {
    let lift = 0, topCat = "", topLift = 0;
    for (const [cat, spend] of Object.entries(catTotals)) {
      const newRate = (preset.rewards[cat] ?? preset.baseReward) * preset.centsPerPoint;
      const cur = owned.length ? Math.max(...owned.map(c => getCardRate(c, cat) * c.centsPerPoint)) : 0;
      const catLift = ((newRate - cur) / 100) * spend;
      lift += catLift;
      if (catLift > topLift) { topLift = catLift; topCat = cat; }
    }
    const net = lift * 12 - preset.annualFee;
    if (net > bestLift) {
      bestLift = net; best = preset;
      bestReason = topCat
        ? `Adds ${(preset.rewards[topCat] ?? preset.baseReward) * preset.centsPerPoint}% on ${topCat}. Est. +$${Math.max(0, net).toFixed(0)}/yr net of the $${preset.annualFee} annual fee.`
        : `Best overall lift (+$${Math.max(0, net).toFixed(0)}/yr net).`;
    }
  }
  return best ? { card: best, reason: bestReason } : null;
}

// ─── Card Visual ──────────────────────────────────────────────────────────────
function CardVisual({ card, small = false }: { card: UserCard | PresetCard; small?: boolean }) {
  return (
    <div className={`relative rounded-xl bg-gradient-to-br ${card.cardBg} overflow-hidden ${small ? "h-16 w-28" : "h-40 w-full"} flex flex-col justify-between p-3 shadow-lg`}>
      <div className={`flex justify-between items-start ${small ? "text-[8px]" : "text-xs"} text-white/80`}>
        <span className="font-bold">{card.issuer}</span>
        <span>{card.network}</span>
      </div>
      {!small && (
        <>
          <div className="text-white/40 text-xs tracking-widest font-mono">•••• •••• •••• ••••</div>
          <div className="flex justify-between items-end">
            <span className="text-white text-xs font-medium truncate max-w-[70%]">{card.name}</span>
            <span className="text-white/70 text-[10px]">{card.rewardType}</span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Shared input/label styles ────────────────────────────────────────────────
const inp = "w-full bg-secondary text-foreground rounded-xl px-3 py-3 border border-border placeholder:text-muted-foreground focus:outline-none focus:border-primary/50";
const lbl = "text-xs text-muted-foreground mb-1.5 block font-medium";

// ─── Add Card Sheet — fully rebuilt for iOS PWA ───────────────────────────────
function AddCardSheet({ onAdd, onClose, presetCards }: { onAdd: (card: UserCard) => void; onClose: () => void; presetCards: PresetCard[] }) {
  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [selected, setSelected] = useState<PresetCard | null>(null);
  const [creditLimit, setCreditLimit] = useState("");
  const [balance, setBalance] = useState("");
  const [spentBonus, setSpentBonus] = useState("");

  // custom fields
  const [customCardType, setCustomCardType] = useState<"credit" | "debit">("credit");
  const [customName, setCustomName] = useState("");
  const [customIssuer, setCustomIssuer] = useState("");
  const [customNetwork, setCustomNetwork] = useState<"Visa" | "Mastercard" | "Amex" | "Discover">("Visa");
  const [customFee, setCustomFee] = useState("0");
  const [customBase, setCustomBase] = useState("1");
  const [customRewardType, setCustomRewardType] = useState<"cashback" | "points" | "miles">("cashback");
  const [customCPP, setCustomCPP] = useState("1");
  const [customRewards, setCustomRewards] = useState<{ category: string; rate: string }[]>([]);
  const [customBonus, setCustomBonus] = useState("");
  const [customBonusSpend, setCustomBonusSpend] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);

  // Prevent body scroll while sheet is open (iOS PWA fix)
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const NETWORK_COLORS: Record<string, { cardBg: string; color: string }> = {
    Visa: { cardBg:"from-blue-900 via-blue-800 to-blue-600", color:"#2563EB" },
    Mastercard: { cardBg:"from-red-900 via-orange-800 to-orange-600", color:"#EA580C" },
    Amex: { cardBg:"from-cyan-900 via-teal-800 to-teal-600", color:"#0D9488" },
    Discover: { cardBg:"from-orange-800 via-orange-600 to-orange-400", color:"#F97316" },
  };

  const canAdd = mode === "preset" ? !!selected : !!(customName.trim() && customIssuer.trim());

  const handleAdd = () => {
    if (!canAdd) return;
    if (mode === "preset" && selected) {
      onAdd({
        id: crypto.randomUUID(), presetId: selected.id,
        name: selected.name, issuer: selected.issuer, network: selected.network,
        annualFee: selected.annualFee, rewardType: selected.rewardType,
        baseReward: selected.baseReward, rewards: selected.rewards,
        centsPerPoint: selected.centsPerPoint, cardBg: selected.cardBg, color: selected.color,
        creditLimit: creditLimit ? Number(creditLimit) : undefined,
        currentBalance: balance ? Number(balance) : undefined,
        signupBonus: selected.signupBonus, signupSpend: selected.signupSpend,
        spentTowardBonus: spentBonus ? Number(spentBonus) : 0,
        cardType: "credit",
      });
    } else {
      const isDebit = customCardType === "debit";
      const rewards: Record<string, number> = {};
      if (!isDebit) {
        for (const r of customRewards) { if (r.category && r.rate) rewards[r.category] = Number(r.rate) || 1; }
      }
      const nc = NETWORK_COLORS[customNetwork];
      onAdd({
        id: crypto.randomUUID(), name: customName, issuer: customIssuer,
        network: customNetwork, annualFee: isDebit ? 0 : (Number(customFee) || 0),
        rewardType: isDebit ? "cashback" : customRewardType,
        baseReward: isDebit ? 0 : (Number(customBase) || 1),
        rewards, centsPerPoint: isDebit ? 1 : (Number(customCPP) || 1),
        cardBg: nc.cardBg, color: nc.color,
        creditLimit: creditLimit ? Number(creditLimit) : undefined,
        currentBalance: balance ? Number(balance) : undefined,
        signupBonus: isDebit ? undefined : (customBonus || undefined),
        signupSpend: isDebit ? undefined : (customBonusSpend ? Number(customBonusSpend) : undefined),
        cardType: customCardType,
      });
    }
  };

  return (
    /*
      OVERLAY covers the full screen including safe areas so the dark
      scrim is wall-to-wall. Tap outside the sheet to close.
    */
    <div
      className="fixed inset-0 z-[200] bg-black/70"
      onClick={onClose}
    >
      {/*
        SHEET anchored to the bottom of the screen.
        — No paddingBottom on this wrapper (would shrink the flex scroll area)
        — max-height: 92dvh keeps the sheet from covering the full screen
        — dvh = dynamic viewport height, which on iOS already accounts for
          the collapsible address bar and notch
      */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-card rounded-t-2xl flex flex-col"
        style={{ maxHeight: "92dvh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex-shrink-0 flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Header — never scrolls */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 pt-2 pb-3 border-b border-border">
          <h2 className="text-base font-bold" style={{fontFamily:"'Syne',sans-serif"}}>{mode === "custom" && customCardType === "debit" ? "Add a Debit Card" : "Add a Credit Card"}</h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground active:opacity-60"
          >
            <X size={18} />
          </button>
        </div>

        {/* Mode toggle — never scrolls */}
        <div className="flex-shrink-0 flex bg-secondary rounded-xl mx-5 mt-3 mb-2 p-1 gap-1">
          {(["preset", "custom"] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors active:opacity-70 ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {m === "preset" ? "Choose from list" : "Custom card"}
            </button>
          ))}
        </div>

        {/*
          SCROLLABLE CONTENT AREA
          min-h-0 is essential — without it flex children won't shrink
          below their natural height and overflow-y-auto won't activate on iOS.
          -webkit-overflow-scrolling: touch enables momentum scroll.
          overscrollBehavior: contain stops the background page from scrolling.
        */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto px-5 pt-2 pb-4"
          style={{
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
          } as React.CSSProperties}
        >
          {/* ── PRESET MODE ── */}
          {mode === "preset" && (
            <>
              <div className="grid grid-cols-2 gap-2.5 mb-4">
                {presetCards.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelected(selected?.id === p.id ? null : p)}
                    className={`rounded-xl p-2.5 border-2 transition-all text-left active:scale-95 ${
                      selected?.id === p.id ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <CardVisual card={p} small />
                    <p className="text-[11px] font-semibold text-foreground mt-2 leading-tight">{p.issuer} {p.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">${p.annualFee}/yr · {p.baseReward}{p.rewardType === "cashback" ? "%" : "x"}</p>
                  </button>
                ))}
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Credit limit ($)</label>
                    <input type="number" inputMode="decimal" className={inp} placeholder="Optional" value={creditLimit} onChange={e => setCreditLimit(e.target.value)} />
                  </div>
                  <div>
                    <label className={lbl}>Current balance ($)</label>
                    <input type="number" inputMode="decimal" className={inp} placeholder="Optional" value={balance} onChange={e => setBalance(e.target.value)} />
                  </div>
                </div>
                {selected?.signupBonus && (
                  <div>
                    <label className={lbl}>Already spent toward signup bonus ($)</label>
                    <input type="number" inputMode="decimal" className={inp} placeholder="0" value={spentBonus} onChange={e => setSpentBonus(e.target.value)} />
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── CUSTOM MODE ── */}
          {mode === "custom" && (
            <div className="space-y-4">
              {/* Card type toggle */}
              <div>
                <label className={lbl}>Card type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["credit", "debit"] as const).map(t => (
                    <button key={t} type="button" onClick={() => setCustomCardType(t)}
                      className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${
                        customCardType === t ? "bg-primary/15 border-primary/40 text-primary" : "bg-secondary border-border text-muted-foreground"
                      }`}>
                      {t === "credit" ? "Credit" : "Debit"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={lbl}>Card name</label>
                <input className={inp} placeholder="e.g. My Chase Visa" value={customName} onChange={e => setCustomName(e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Issuer (bank)</label>
                <input className={inp} placeholder="e.g. Chase, Capital One, Citi" value={customIssuer} onChange={e => setCustomIssuer(e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Network</label>
                <select className={inp} value={customNetwork} onChange={e => setCustomNetwork(e.target.value as any)}>
                  {(["Visa","Mastercard","Amex","Discover"] as const).map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              {customCardType === "credit" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>Reward type</label>
                      <select className={inp} value={customRewardType} onChange={e => setCustomRewardType(e.target.value as any)}>
                        {(["cashback","points","miles"] as const).map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>Annual fee ($)</label>
                      <input type="number" inputMode="decimal" className={inp} placeholder="0" value={customFee} onChange={e => setCustomFee(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>Base reward (%/x)</label>
                      <input type="number" inputMode="decimal" step="0.5" className={inp} placeholder="1" value={customBase} onChange={e => setCustomBase(e.target.value)} />
                    </div>
                    {customRewardType !== "cashback" && (
                      <div>
                        <label className={lbl}>Cents per point / mile</label>
                        <input type="number" inputMode="decimal" step="0.1" className={inp} placeholder="1.0" value={customCPP} onChange={e => setCustomCPP(e.target.value)} />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className={lbl + " mb-0"}>Bonus categories</label>
                      <button
                        type="button"
                        onClick={() => setCustomRewards(r => [...r, { category: "", rate: "" }])}
                        className="text-xs text-primary font-medium flex items-center gap-1 py-1.5 px-3 rounded-lg bg-primary/10 active:opacity-60"
                      >
                        <Plus size={12} /> Add
                      </button>
                    </div>
                    {customRewards.map((r, i) => (
                      <div key={i} className="flex gap-2 mb-2.5 items-center">
                        <input
                          className="flex-1 bg-secondary text-foreground rounded-xl px-3 py-3 border border-border placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                          placeholder="e.g. Travel"
                          value={r.category}
                          onChange={e => setCustomRewards(rows => rows.map((row, idx) => idx === i ? {...row, category: e.target.value} : row))}
                        />
                        <input
                          type="number" inputMode="decimal" step="0.5"
                          className="w-20 bg-secondary text-foreground rounded-xl px-3 py-3 border border-border focus:outline-none focus:border-primary/50"
                          placeholder="3x"
                          value={r.rate}
                          onChange={e => setCustomRewards(rows => rows.map((row, idx) => idx === i ? {...row, rate: e.target.value} : row))}
                        />
                        <button
                          type="button"
                          onClick={() => setCustomRewards(rows => rows.filter((_, idx) => idx !== i))}
                          className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl bg-destructive/10 text-destructive active:opacity-60"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>Signup bonus</label>
                      <input className={inp} placeholder="e.g. 60,000 pts" value={customBonus} onChange={e => setCustomBonus(e.target.value)} />
                    </div>
                    <div>
                      <label className={lbl}>Required spend ($)</label>
                      <input type="number" inputMode="decimal" className={inp} placeholder="Optional" value={customBonusSpend} onChange={e => setCustomBonusSpend(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>Credit limit ($)</label>
                      <input type="number" inputMode="decimal" className={inp} placeholder="Optional" value={creditLimit} onChange={e => setCreditLimit(e.target.value)} />
                    </div>
                    <div>
                      <label className={lbl}>Current balance ($)</label>
                      <input type="number" inputMode="decimal" className={inp} placeholder="Optional" value={balance} onChange={e => setBalance(e.target.value)} />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          {/* Breathing room so last field clears sticky footer */}
          <div className="h-2" />
        </div>

        {/*
          STICKY FOOTER — outside the scroll area, always visible.
          paddingBottom: max(1rem, safe-area-inset-bottom) clears the home
          indicator on iPhone 13/14/15/16 and all Pro/Plus/Max variants.
          max() ensures at least 16px even on phones with no home indicator.
        */}
        <div
          className="flex-shrink-0 flex gap-3 px-5 pt-3 border-t border-border bg-card"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <button
            onClick={onClose}
            className="flex-1 py-3.5 rounded-2xl bg-secondary text-muted-foreground text-sm font-semibold active:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!canAdd}
            className="flex-1 py-3.5 rounded-2xl text-black text-sm font-semibold disabled:opacity-35 active:opacity-70"
            style={{background:"linear-gradient(135deg,hsl(185,100%,40%),hsl(195,100%,55%))"}}
          >
            Add Card
          </button>
        </div>
      </div>
    </div>
  );
}
// ─── Main CreditCardHub Component ────────────────────────────────────────────
interface Props { expenses: Expense[]; userProfile: UserProfile; }

export function CreditCardHub({ expenses, userProfile }: Props) {
  const { presets, stale } = usePresetCards();
  const [cards, setCards] = useState<UserCard[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"cards" | "optimizer" | "next">("cards");

  // Fetch from the backend on mount / user change — same pattern as useExpenses.
  useEffect(() => {
    if (!userProfile?.id) return;
    let cancelled = false;
    fetchCards().then(remote => {
      if (cancelled) return;
      setCards(remote);
      cacheCards(remote, userProfile.id);
    });
    return () => { cancelled = true; };
  }, [userProfile?.id]);

  const persistAdd = (card: UserCard) => {
    setCards(prev => {
      const next = [...prev, card]; // optimistic
      cacheCards(next, userProfile?.id);
      return next;
    });
    setShowAdd(false);
    createCard(card).catch(() => console.warn("Card sync failed — saved locally only"));
  };
  const removeCard = (id: string) => {
    setCards(prev => {
      const next = prev.filter(c => c.id !== id); // optimistic
      cacheCards(next, userProfile?.id);
      return next;
    });
    deleteCardRemote(id).catch(() => console.warn("Card delete sync failed"));
  };

  const allCategories = [...new Set(expenses.map(e => mapCategory(e.category)))];
  const categoryTotals: Record<string, number> = {};
  for (const e of expenses) { const c = mapCategory(e.category); categoryTotals[c] = (categoryTotals[c] || 0) + e.amount; }

  const totalRewards = expenses.reduce((sum, e) => {
    const best = getBestCard(cards, e.category);
    return best ? sum + getEffectiveCashback(best, e.category, e.amount) : sum;
  }, 0);
  const totalFees = cards.reduce((s, c) => s + c.annualFee / 12, 0);
  const netRewards = totalRewards - totalFees;
  const recommendation = recommendNextCard(cards, expenses, presets);
  const utilizationAlerts = cards
    .filter(c => c.creditLimit && c.currentBalance)
    .map(c => ({ card: c, pct: (c.currentBalance! / c.creditLimit!) * 100 }))
    .filter(a => a.pct > 30);

  return (
    <div className="space-y-4 animate-in-up">
      {stale && (
        <div className="text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-1.5">
          Showing cached card benefits — live update unavailable
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Credit Card <span className="text-gradient-gold">Hub</span></h2>
          <p className="text-xs text-muted-foreground">Maximise every swipe</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 text-black text-xs font-semibold px-4 py-2.5 rounded-xl active:opacity-70"
          style={{background:"linear-gradient(135deg,hsl(185,100%,40%),hsl(195,100%,55%))"}}
        >
          <Plus size={13} /> Add Card
        </button>
      </div>

      {/* Summary */}
      {cards.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label:"Est. Rewards", value:`$${totalRewards.toFixed(2)}`, sub:"this period", cx:"text-primary" },
            { label:"Annual Fees", value:`$${(totalFees*12).toFixed(0)}/yr`, sub:`$${totalFees.toFixed(2)}/mo`, cx:"text-amber-400" },
            { label:"Net Value", value:`$${netRewards.toFixed(2)}`, sub:"rewards − fees", cx:netRewards>=0?"text-primary":"text-destructive" },
          ].map(s => (
            <div key={s.label} className="glass rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-sm font-bold ${s.cx}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Section tabs */}
      <div className="flex bg-secondary rounded-xl p-1 gap-1">
        {([
          { id:"cards", label:"My Cards", icon:CreditCard },
          { id:"optimizer", label:"Optimizer", icon:Zap },
          { id:"next", label:"Next Card", icon:Sparkles },
        ] as const).map(({ id, label, icon:Icon }) => (
          <button key={id} onClick={() => setActiveSection(id)}
            className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium rounded-lg transition-colors ${activeSection===id ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
            <Icon size={12} /> {label}
          </button>
        ))}
      </div>

      {/* MY CARDS */}
      {activeSection === "cards" && (
        <div className="space-y-3">
          {cards.length === 0 ? (
            <div className="glass rounded-xl p-8 text-center">
              <CreditCard size={32} className="text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No cards added yet.</p>
              <button onClick={() => setShowAdd(true)} className="mt-3 text-primary text-sm font-medium underline underline-offset-2">Add your first card →</button>
            </div>
          ) : (
            cards.map(card => {
              const util = card.creditLimit && card.currentBalance ? (card.currentBalance / card.creditLimit) * 100 : null;
              const bonusPct = card.signupBonus && card.signupSpend ? Math.min(100, ((card.spentTowardBonus || 0) / card.signupSpend) * 100) : null;
              const isExpanded = expandedCard === card.id;
              return (
                <div key={card.id} className="glass rounded-xl overflow-hidden">
                  <div className="p-3">
                    <div className="flex gap-3 items-start">
                      <div className="w-28 shrink-0"><CardVisual card={card} /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1">
                          <div>
                            <p className="text-sm font-bold leading-tight">{card.issuer} {card.name}</p>
                            <p className="text-xs text-muted-foreground">{card.network} · ${card.annualFee}/yr</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => setExpandedCard(isExpanded ? null : card.id)} className="p-2.5 rounded-xl text-muted-foreground active:bg-secondary">
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                            <button onClick={() => removeCard(card.id)} className="p-2.5 rounded-xl text-muted-foreground active:text-destructive">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          <span className="text-[10px] bg-primary/15 text-primary px-2 py-0.5 rounded-full font-medium">{card.baseReward}{card.rewardType==="cashback"?"%":"x"} base</span>
                          {Object.entries(card.rewards).slice(0,2).map(([cat,rate]) => (
                            <span key={cat} className="text-[10px] bg-amber-400/15 text-amber-400 px-2 py-0.5 rounded-full font-medium">{rate}x {cat}</span>
                          ))}
                        </div>
                        {util !== null && (
                          <div className="mt-2">
                            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                              <span>Utilization</span>
                              <span className={util>30?"text-destructive":"text-primary"}>{util.toFixed(0)}%</span>
                            </div>
                            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${util>30?"bg-destructive":"bg-primary"}`} style={{width:`${Math.min(100,util)}%`}} />
                            </div>
                          </div>
                        )}
                        {bonusPct !== null && (
                          <div className="mt-2">
                            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                              <span className="flex items-center gap-0.5"><Gift size={9} /> Signup bonus</span>
                              <span className="text-amber-400">{bonusPct.toFixed(0)}%</span>
                            </div>
                            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-amber-400" style={{width:`${bonusPct}%`}} />
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{card.signupBonus}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-border px-3 py-3 space-y-2">
                      <p className="text-xs font-semibold">All Reward Categories</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {Object.entries(card.rewards).map(([cat, rate]) => (
                          <div key={cat} className="bg-secondary rounded-lg px-2 py-1.5 flex justify-between">
                            <span className="text-xs">{cat}</span>
                            <span className="text-xs font-bold text-amber-400">{rate}{card.rewardType==="cashback"?"%":"x"}</span>
                          </div>
                        ))}
                        <div className="bg-secondary rounded-lg px-2 py-1.5 flex justify-between">
                          <span className="text-xs">Everything else</span>
                          <span className="text-xs font-bold text-primary">{card.baseReward}{card.rewardType==="cashback"?"%":"x"}</span>
                        </div>
                      </div>
                      {card.signupBonus && (
                        <div className="bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2 mt-1">
                          <p className="text-xs font-semibold text-amber-400 flex items-center gap-1"><Star size={10} /> Signup Bonus</p>
                          <p className="text-xs text-muted-foreground">{card.signupBonus}</p>
                          {card.signupSpend && <p className="text-[10px] text-muted-foreground">Spend ${card.signupSpend.toLocaleString()} to unlock</p>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
          {utilizationAlerts.length > 0 && (
            <div className="glass rounded-xl p-4 border border-destructive/30 space-y-2">
              <p className="text-sm font-semibold text-destructive flex items-center gap-1.5"><AlertTriangle size={14} /> High Utilization Alert</p>
              {utilizationAlerts.map(({ card, pct }) => (
                <div key={card.id} className="text-xs text-muted-foreground">
                  <span className="text-foreground font-medium">{card.issuer} {card.name}</span> is at{" "}
                  <span className="text-destructive font-bold">{pct.toFixed(0)}%</span>.{" "}
                  {pct<=50 ? "Pay down below 30% to protect your credit score." : "High utilization hurts your score. Pay down ASAP."}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* OPTIMIZER */}
      {activeSection === "optimizer" && (
        <div className="space-y-3">
          {cards.length === 0 ? (
            <div className="glass rounded-xl p-8 text-center"><Zap size={32} className="text-muted-foreground mx-auto mb-3" /><p className="text-sm text-muted-foreground">Add your cards first.</p></div>
          ) : allCategories.length === 0 ? (
            <div className="glass rounded-xl p-8 text-center"><p className="text-sm text-muted-foreground">Add expenses to see card suggestions.</p></div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Use these cards to maximise rewards by category:</p>
              {allCategories.sort((a,b)=>(categoryTotals[b]||0)-(categoryTotals[a]||0)).map(cat => {
                const best = getBestCard(cards, cat);
                if (!best) return null;
                const rate = getCardRate(best, cat);
                const effectiveRate = rate * best.centsPerPoint;
                const spend = categoryTotals[cat] || 0;
                const earned = getEffectiveCashback(best, cat, spend);
                return (
                  <div key={cat} className="glass rounded-xl p-4 flex items-center gap-3">
                    <div className="w-20 shrink-0"><CardVisual card={best} small /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <p className="text-sm font-semibold">{cat}</p>
                        <span className="text-[10px] bg-primary/15 text-primary px-2 py-0.5 rounded-full font-bold shrink-0">{effectiveRate.toFixed(1)}%</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Use <span className="text-foreground font-medium">{best.issuer} {best.name}</span> for {rate}{best.rewardType==="cashback"?"%":"x"}</p>
                      <p className="text-xs text-primary font-medium mt-1">+${earned.toFixed(2)} on ${spend.toFixed(0)} spent</p>
                    </div>
                  </div>
                );
              })}
              <div className="glass rounded-xl p-4 space-y-2 border border-primary/20">
                <p className="text-sm font-semibold flex items-center gap-1.5"><ShieldCheck size={14} className="text-primary" /> Interest Tips</p>
                <ul className="space-y-1.5">
                  {["Pay your full statement balance monthly to avoid 20–29% APR interest.","Set up autopay for at least the minimum to never miss a payment.","If carrying a balance, pay the highest APR card first (avalanche method).",
                    cards.some(c=>c.annualFee>0) ? `Paid cards cost $${cards.filter(c=>c.annualFee>0).reduce((s,c)=>s+c.annualFee,0)}/yr — ensure rewards exceed fees.` : "All your cards are no-fee. Great for building credit at zero cost!"
                  ].map((tip,i) => (
                    <li key={i} className="text-xs text-muted-foreground flex gap-2"><span className="text-primary font-bold shrink-0 mt-0.5">·</span>{tip}</li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      )}

      {/* NEXT CARD */}
      {activeSection === "next" && (
        <div className="space-y-3">
          {recommendation ? (
            <>
              <div className="glass rounded-xl overflow-hidden">
                <div className="p-4">
                  <p className="text-xs font-semibold text-amber-400 flex items-center gap-1 mb-3"><Sparkles size={11} /> Recommended Next Card</p>
                  <div className="flex gap-3 items-start">
                    <div className="w-28 shrink-0"><CardVisual card={recommendation.card as any} /></div>
                    <div className="flex-1">
                      <p className="text-sm font-bold">{recommendation.card.issuer} {recommendation.card.name}</p>
                      <p className="text-xs text-muted-foreground">{recommendation.card.network} · ${recommendation.card.annualFee}/yr</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {Object.entries(recommendation.card.rewards).slice(0,3).map(([cat,rate]) => (
                          <span key={cat} className="text-[10px] bg-amber-400/15 text-amber-400 px-2 py-0.5 rounded-full">{rate}x {cat}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
                    <p className="text-xs font-medium flex items-center gap-1.5"><TrendingUp size={11} className="text-primary" /> Why this card?</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{recommendation.reason}</p>
                  </div>
                  {recommendation.card.signupBonus && (
                    <div className="mt-2 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2">
                      <p className="text-xs text-amber-400 font-medium flex items-center gap-1.5"><Gift size={11} /> Signup Bonus</p>
                      <p className="text-xs text-muted-foreground">{recommendation.card.signupBonus}</p>
                      {recommendation.card.signupSpend && <p className="text-[10px] text-muted-foreground mt-0.5">Spend ${recommendation.card.signupSpend.toLocaleString()} in first few months</p>}
                    </div>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground font-medium">Other cards you don't have yet</p>
              <div className="grid grid-cols-2 gap-2">
                {presets.filter(p => !cards.some(c=>c.presetId===p.id) && p.id!==recommendation.card.id).slice(0,4).map(p => (
                  <div key={p.id} className="glass rounded-xl p-3">
                    <CardVisual card={p} small />
                    <p className="text-xs font-semibold mt-1.5 leading-tight">{p.issuer} {p.name}</p>
                    <p className="text-[10px] text-muted-foreground">${p.annualFee}/yr · {p.baseReward}{p.rewardType==="cashback"?"%":"x"}</p>
                    {p.signupBonus && <p className="text-[10px] text-amber-400 mt-0.5">🎁 {p.signupBonus}</p>}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="glass rounded-xl p-8 text-center">
              <Sparkles size={32} className="text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {cards.length === 0 ? "Add your existing cards first so we can recommend your next one." : "You already have all the top cards in our catalogue! 🎉"}
              </p>
            </div>
          )}
        </div>
      )}

      {showAdd && <AddCardSheet onAdd={persistAdd} onClose={() => setShowAdd(false)} presetCards={presets} />}
    </div>
  );
}
