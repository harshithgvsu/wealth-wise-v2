import { useMemo } from "react";
import {
  TrendingUp,
  PieChart,
  BarChart2,
  Shield,
  Zap,
  Target,
  AlertTriangle,
  CheckCircle2,
  Info,
} from "lucide-react";
import { Expense, Category, localDateString, parseDateString } from "@/hooks/useExpenses";
import { UserProfile } from "@/hooks/useAuth";

interface InvestmentSuggestionsProps {
  expenses: Expense[];
  userProfile: UserProfile;
}

interface Suggestion {
  ticker: string;
  name: string;
  type: string;
  allocation: number;
  rationale: string;
  risk: "Low" | "Medium" | "High";
  expectedReturn: string;
}

function RiskBadge({ risk }: { risk: "Low" | "Medium" | "High" }) {
  const colors = {
    Low: "text-primary bg-primary/10 border-primary/20",
    Medium: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    High: "text-destructive bg-destructive/10 border-destructive/20",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${colors[risk]}`}>
      {risk}
    </span>
  );
}

export function InvestmentSuggestions({ expenses, userProfile }: InvestmentSuggestionsProps) {
  const analysis = useMemo(() => {
    const now = new Date();
    const last3Totals: number[] = [];

    for (let i = 0; i < 3; i++) {
      const m = now.getMonth() + 1 - i <= 0 ? now.getMonth() + 1 - i + 12 : now.getMonth() + 1 - i;
      const y = now.getMonth() + 1 - i <= 0 ? now.getFullYear() - 1 : now.getFullYear();
      const total = expenses
        .filter((e) => {
          const d = parseDateString(e.date);
          return d.getFullYear() === y && d.getMonth() + 1 === m;
        })
        .reduce((s, e) => s + e.amount, 0);
      last3Totals.push(total);
    }

    const avgMonthlySpend = last3Totals.reduce((s, v) => s + v, 0) / Math.max(last3Totals.filter(Boolean).length, 1);
    const spendTrend = last3Totals[1] > 0 ? (last3Totals[0] - last3Totals[1]) / last3Totals[1] : 0;

    const fixedExpenses =
      userProfile.rentMortgage +
      userProfile.carPayment +
      userProfile.insurancePremiums +
      userProfile.subscriptions +
      userProfile.otherFixedExpenses;

    const disposable = userProfile.netMonthlyIncome - fixedExpenses;
    const savingsTarget = (userProfile.savingsGoalPercent / 100) * userProfile.netMonthlyIncome;
    const monthlyInvestable = Math.max(0, disposable - avgMonthlySpend - savingsTarget * 0.5);
    const annualInvestable = monthlyInvestable * 12;

    return { avgMonthlySpend, spendTrend, disposable, savingsTarget, monthlyInvestable, annualInvestable, fixedExpenses };
  }, [expenses, userProfile]);

  // Portfolio based on risk + goal + horizon
  const portfolio = useMemo((): Suggestion[] => {
    const { riskTolerance, investmentGoal, investmentHorizonYears } = userProfile;
    const longHorizon = investmentHorizonYears > 15;

    if (riskTolerance === "conservative") {
      return [
        { ticker: "BND", name: "Vanguard Total Bond Market ETF", type: "Bond Index", allocation: 40, rationale: "Stable income, low volatility — core for conservative portfolios", risk: "Low", expectedReturn: "3–5%" },
        { ticker: "VTI", name: "Vanguard Total Stock Market ETF", type: "US Equity Index", allocation: 30, rationale: "Broad US market exposure, diversified across 4000+ stocks", risk: "Medium", expectedReturn: "7–10%" },
        { ticker: "VXUS", name: "Vanguard Total International Stock ETF", type: "International Equity", allocation: 15, rationale: "Diversification across developed and emerging markets", risk: "Medium", expectedReturn: "6–9%" },
        { ticker: "VNQ", name: "Vanguard Real Estate ETF", type: "REIT", allocation: 10, rationale: "Real estate income with inflation hedge properties", risk: "Medium", expectedReturn: "5–8%" },
        { ticker: "SGOV", name: "iShares 0-3 Month Treasury Bond ETF", type: "Cash Equivalent", allocation: 5, rationale: "Liquid emergency reserves earning 5%+ yield", risk: "Low", expectedReturn: "4–5%" },
      ];
    }

    if (riskTolerance === "aggressive") {
      return [
        { ticker: "VTI", name: "Vanguard Total Stock Market ETF", type: "US Equity Index", allocation: longHorizon ? 45 : 40, rationale: "Maximum US equity exposure for long-term growth compounding", risk: "Medium", expectedReturn: "7–10%" },
        { ticker: "QQQ", name: "Invesco QQQ (Nasdaq-100 ETF)", type: "Tech Growth", allocation: 20, rationale: "High-growth tech exposure — Apple, NVDA, Microsoft, Alphabet", risk: "High", expectedReturn: "10–15%" },
        { ticker: "VXUS", name: "Vanguard Total International", type: "International Equity", allocation: 20, rationale: "Global diversification, especially emerging market growth", risk: "Medium", expectedReturn: "6–9%" },
        { ticker: "VB", name: "Vanguard Small-Cap ETF", type: "Small Cap", allocation: 10, rationale: "Small-cap historically outperforms over long horizons", risk: "High", expectedReturn: "9–13%" },
        { ticker: "VWO", name: "Vanguard Emerging Markets ETF", type: "Emerging Markets", allocation: 5, rationale: investmentGoal === "growth" ? "High-upside developing economies (India, Brazil, Taiwan)" : "Modest EM allocation for diversification", risk: "High", expectedReturn: "8–12%" },
      ];
    }

    // Moderate (default)
    return [
      { ticker: "VTI", name: "Vanguard Total Stock Market ETF", type: "US Equity Index", allocation: 40, rationale: "Core US market exposure — the backbone of any portfolio", risk: "Medium", expectedReturn: "7–10%" },
      { ticker: "VXUS", name: "Vanguard Total International Stock ETF", type: "International Equity", allocation: 20, rationale: "Developed markets provide stability and currency diversification", risk: "Medium", expectedReturn: "6–9%" },
      { ticker: "BND", name: "Vanguard Total Bond Market ETF", type: "Bond Index", allocation: 20, rationale: "Fixed income cushion, reduces portfolio volatility during downturns", risk: "Low", expectedReturn: "3–5%" },
      { ticker: "VNQ", name: "Vanguard Real Estate ETF", type: "REIT", allocation: 10, rationale: investmentGoal === "property" ? "Real estate alignment with your property goal" : "Inflation hedge and dividend income from real estate", risk: "Medium", expectedReturn: "5–8%" },
      { ticker: "QQQ", name: "Invesco QQQ ETF", type: "Tech Growth", allocation: 10, rationale: "Growth kicker via top-100 NASDAQ companies", risk: "High", expectedReturn: "10–15%" },
    ];
  }, [userProfile]);

  const futureValue = (monthly: number, years: number, rate = 0.07) => {
    if (monthly <= 0 || years <= 0) return 0;
    const n = years * 12;
    const r = rate / 12;
    return monthly * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
  };

  const fv10 = futureValue(analysis.monthlyInvestable, 10);
  const fv20 = futureValue(analysis.monthlyInvestable, 20);
  const fvHorizon = futureValue(analysis.monthlyInvestable, userProfile.investmentHorizonYears);

  const spendingHealthy = analysis.avgMonthlySpend < analysis.disposable * 0.8;
  const savingsOnTrack = analysis.monthlyInvestable > 0;

  const riskIcon = { conservative: Shield, moderate: BarChart2, aggressive: Zap }[userProfile.riskTolerance];
  const RiskIcon = riskIcon;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center">
            <TrendingUp size={18} className="text-primary" />
          </div>
          <div>
            <h2 className="text-foreground font-bold">Investment Analysis</h2>
            <p className="text-xs text-muted-foreground capitalize">
              {userProfile.riskTolerance} risk · {userProfile.investmentHorizonYears}yr horizon · {userProfile.investmentGoal} goal
            </p>
          </div>
        </div>

        {/* Health indicators */}
        <div className="grid grid-cols-2 gap-3">
          <div className={`rounded-xl p-3 border ${spendingHealthy ? "border-primary/20 bg-primary/5" : "border-destructive/20 bg-destructive/5"}`}>
            <div className="flex items-center gap-1.5 mb-1">
              {spendingHealthy ? <CheckCircle2 size={13} className="text-primary" /> : <AlertTriangle size={13} className="text-destructive" />}
              <span className={`text-xs font-medium ${spendingHealthy ? "text-primary" : "text-destructive"}`}>Spending Health</span>
            </div>
            <p className="text-foreground font-bold text-sm">${analysis.avgMonthlySpend.toFixed(0)}<span className="text-muted-foreground text-xs font-normal">/mo avg</span></p>
            <p className="text-xs text-muted-foreground mt-0.5">{spendingHealthy ? "Under 80% disposable ✓" : "Exceeds budget target"}</p>
          </div>
          <div className={`rounded-xl p-3 border ${savingsOnTrack ? "border-amber-400/20 bg-amber-400/5" : "border-muted"}`}>
            <div className="flex items-center gap-1.5 mb-1">
              <Target size={13} className="text-amber-400" />
              <span className="text-xs font-medium text-amber-400">Monthly Investable</span>
            </div>
            <p className="text-foreground font-bold text-sm">${analysis.monthlyInvestable.toFixed(0)}<span className="text-muted-foreground text-xs font-normal">/mo</span></p>
            <p className="text-xs text-muted-foreground mt-0.5">${analysis.annualInvestable.toFixed(0)}/year potential</p>
          </div>
        </div>

        {/* Trend alert */}
        {Math.abs(analysis.spendTrend) > 0.05 && (
          <div className={`mt-3 rounded-lg p-2.5 border text-xs flex gap-2 ${analysis.spendTrend > 0 ? "border-destructive/20 bg-destructive/5 text-destructive" : "border-primary/20 bg-primary/5 text-primary"}`}>
            <Info size={13} className="shrink-0 mt-0.5" />
            <span>
              Your spending is{" "}
              <strong>{analysis.spendTrend > 0 ? `up ${(analysis.spendTrend * 100).toFixed(0)}%` : `down ${(Math.abs(analysis.spendTrend) * 100).toFixed(0)}%`}</strong>{" "}
              vs. last month.{" "}
              {analysis.spendTrend > 0 ? "Reducing spending increases your investable amount." : "Great — redirect savings into investments!"}
            </span>
          </div>
        )}
      </div>

      {/* Growth projections */}
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <PieChart size={16} className="text-amber-400" />
          <h3 className="text-foreground font-semibold text-sm">Wealth Projections</h3>
          <span className="text-xs text-muted-foreground">(at 7% avg annual return)</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "10 Years", value: fv10, color: "text-primary" },
            { label: "20 Years", value: fv20, color: "text-amber-400" },
            { label: `${userProfile.investmentHorizonYears} Yrs (Goal)`, value: fvHorizon, color: "text-primary" },
          ].map((item) => (
            <div key={item.label} className="bg-muted rounded-xl p-3 text-center">
              <p className={`text-lg font-bold ${item.color}`}>
                {item.value >= 1_000_000
                  ? `$${(item.value / 1_000_000).toFixed(1)}M`
                  : item.value >= 1_000
                  ? `$${(item.value / 1_000).toFixed(0)}K`
                  : `$${item.value.toFixed(0)}`}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.label}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Based on investing ${analysis.monthlyInvestable.toFixed(0)}/mo. Projections are estimates, not guarantees.
        </p>
      </div>

      {/* Portfolio */}
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <RiskIcon size={16} className="text-primary" />
          <h3 className="text-foreground font-semibold text-sm capitalize">
            {userProfile.riskTolerance} Portfolio — Suggested Allocation
          </h3>
        </div>
        <div className="space-y-2.5">
          {portfolio.map((s) => (
            <div key={s.ticker} className="bg-muted rounded-xl p-3">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-primary font-bold text-sm">{s.ticker}</span>
                    <RiskBadge risk={s.risk} />
                    <span className="text-xs text-muted-foreground">{s.type}</span>
                  </div>
                  <p className="text-xs text-foreground mt-0.5">{s.name}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-foreground font-bold text-sm">{s.allocation}%</p>
                  <p className="text-xs text-primary">{s.expectedReturn}/yr</p>
                </div>
              </div>
              {/* Allocation bar */}
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-1.5">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${s.allocation}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{s.rationale}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="rounded-xl border border-border p-3 text-xs text-muted-foreground flex gap-2">
        <AlertTriangle size={13} className="shrink-0 mt-0.5 text-amber-400" />
        <span>
          These suggestions are for educational purposes only. Consult a licensed financial advisor before investing. Past performance doesn't guarantee future results.
        </span>
      </div>
    </div>
  );
}
