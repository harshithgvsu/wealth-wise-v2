import { useMemo, useState } from "react";
import { Plane, Sparkles, Loader2, MapPin, TrendingDown } from "lucide-react";
import { Expense } from "@/hooks/useExpenses";
import { UserProfile } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/apiClient";

// Cross-platform by design — no Capacitor/platform check anywhere in this file.
// Works identically in the browser, the PWA, and the iOS/Android shells since
// it's the same React tree either way.

interface Props { expenses: Expense[]; userProfile: UserProfile; }

const SEASONS = ["Winter", "Spring", "Summer", "Fall"] as const;
type Season = (typeof SEASONS)[number];

// Dec/Jan/Feb = Winter, etc. — calendar month, independent of year, so multiple
// years of history average together into one seasonal picture.
function seasonOf(month: number): Season {
  if (month === 12 || month <= 2) return "Winter";
  if (month <= 5) return "Spring";
  if (month <= 8) return "Summer";
  return "Fall";
}

async function fetchAiTripIdeas(expenses: Expense[], profile: UserProfile): Promise<string | null> {
  try {
    const res = await apiFetch("/ai/trip-ideas", {
      method: "POST",
      body: JSON.stringify({ expenses, profile }),
    });
    const data = await res.json();
    if (data.fallback || !data.reply) return null;
    return data.reply;
  } catch {
    return null;
  }
}

// Same bold-markdown convention AIChat.tsx uses for LLM replies.
function fmt(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={i} className="text-foreground font-semibold">{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>
  );
}

export function SeasonalTripPlanner({ expenses, userProfile }: Props) {
  const [aiReply, setAiReply] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTried, setAiTried] = useState(false);

  const analysis = useMemo(() => {
    const monthKeys = new Set(expenses.map((e) => e.date.slice(0, 7))); // "YYYY-MM"
    const monthsOfHistory = monthKeys.size;

    const fixed =
      userProfile.rentMortgage + userProfile.carPayment +
      userProfile.insurancePremiums + userProfile.subscriptions +
      userProfile.otherFixedExpenses;
    const disposable = userProfile.netMonthlyIncome - fixed;

    // Total spend per calendar month key ("YYYY-MM"), then averaged by season.
    const spendByMonthKey: Record<string, number> = {};
    for (const e of expenses) {
      const key = e.date.slice(0, 7);
      spendByMonthKey[key] = (spendByMonthKey[key] || 0) + e.amount;
    }

    const seasonTotals: Record<Season, { sum: number; count: number }> = {
      Winter: { sum: 0, count: 0 }, Spring: { sum: 0, count: 0 },
      Summer: { sum: 0, count: 0 }, Fall: { sum: 0, count: 0 },
    };
    for (const key of Object.keys(spendByMonthKey)) {
      const month = Number(key.slice(5, 7)); // "YYYY-MM" -> MM, already 1-indexed
      const s = seasonOf(month);
      seasonTotals[s].sum += spendByMonthKey[key];
      seasonTotals[s].count += 1;
    }

    const seasonAverages = SEASONS.map((s) => ({
      season: s,
      avgSpend: seasonTotals[s].count ? seasonTotals[s].sum / seasonTotals[s].count : null,
      monthsSampled: seasonTotals[s].count,
    }));

    const withData = seasonAverages.filter((s) => s.avgSpend !== null) as { season: Season; avgSpend: number; monthsSampled: number }[];
    const best = withData.length
      ? withData.reduce((a, b) => (disposable - b.avgSpend > disposable - a.avgSpend ? b : a))
      : null;

    const surplus = best ? Math.max(0, disposable - best.avgSpend) : Math.max(0, disposable * 0.15);
    const baseBudget = Math.max(200, surplus * 2.5);

    return {
      monthsOfHistory,
      disposable,
      seasonAverages,
      best,
      surplus,
      tiers: {
        budget: Math.round(baseBudget * 0.6),
        moderate: Math.round(baseBudget),
        comfortable: Math.round(baseBudget * 1.5),
      },
    };
  }, [expenses, userProfile]);

  const handleAskAi = async () => {
    setAiLoading(true);
    setAiTried(true);
    const reply = await fetchAiTripIdeas(expenses, userProfile);
    setAiReply(reply);
    setAiLoading(false);
  };

  if (analysis.monthsOfHistory < 2) {
    return (
      <div className="glass rounded-xl p-6 text-center space-y-2">
        <Plane size={28} className="text-muted-foreground mx-auto" />
        <p className="text-sm font-semibold">Trip budget planner</p>
        <p className="text-xs text-muted-foreground max-w-xs mx-auto">
          Log expenses across a couple more months (ideally different seasons) and
          I'll spot the cheapest time of year for you to travel.
        </p>
      </div>
    );
  }

  return (
    <div className="glass rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
            <Plane size={15} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ fontFamily: "'Syne',sans-serif" }}>Seasonal Trip Budget</p>
            <p className="text-xs text-muted-foreground">Based on {analysis.monthsOfHistory} months of your spending</p>
          </div>
        </div>
      </div>

      {analysis.best ? (
        <>
          <div className="bg-primary/10 border border-primary/20 rounded-lg px-3 py-2.5 flex items-start gap-2">
            <TrendingDown size={14} className="text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-foreground">
              <strong className="font-semibold">{analysis.best.season}</strong> has historically been your
              lightest-spending season (avg ${analysis.best.avgSpend.toFixed(0)}/mo across {analysis.best.monthsSampled} month{analysis.best.monthsSampled === 1 ? "" : "s"}) —
              the most slack in your budget to plan a trip around.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {([
              { label: "Budget", value: analysis.tiers.budget, cx: "text-muted-foreground" },
              { label: "Moderate", value: analysis.tiers.moderate, cx: "text-primary" },
              { label: "Comfortable", value: analysis.tiers.comfortable, cx: "text-amber-400" },
            ] as const).map((t) => (
              <div key={t.label} className="bg-secondary/50 rounded-lg p-2.5 text-center">
                <p className="text-[10px] text-muted-foreground">{t.label}</p>
                <p className={`text-sm font-bold ${t.cx}`}>${t.value.toLocaleString()}</p>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Estimated from your typical monthly surplus (${analysis.surplus.toFixed(0)}) saved over ~2.5 months —
            not a quote, just a starting range grounded in your own numbers.
          </p>

          <div className="grid grid-cols-4 gap-1.5">
            {analysis.seasonAverages.map((s) => (
              <div key={s.season} className={`rounded-lg p-2 text-center border ${s.season === analysis.best?.season ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                <p className="text-[10px] text-muted-foreground">{s.season}</p>
                <p className="text-xs font-semibold">{s.avgSpend !== null ? `$${s.avgSpend.toFixed(0)}` : "—"}</p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Not enough seasonal spread yet to compare — check back after a few more months.</p>
      )}

      <div className="border-t border-border pt-3">
        {!aiTried ? (
          <button
            onClick={handleAskAi}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-secondary text-xs font-medium text-foreground hover:bg-secondary/70 transition-colors"
          >
            <Sparkles size={12} className="text-primary" /> Ask AI for personalized trip ideas
          </button>
        ) : aiLoading ? (
          <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
            <Loader2 size={12} className="animate-spin" /> Thinking…
          </div>
        ) : aiReply ? (
          <div className="text-xs text-foreground leading-relaxed whitespace-pre-line flex gap-2">
            <MapPin size={13} className="text-primary shrink-0 mt-0.5" />
            <p>{fmt(aiReply)}</p>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground text-center">
            AI trip ideas aren't configured on the backend right now — the numbers above are still yours to use.
          </p>
        )}
      </div>
    </div>
  );
}
