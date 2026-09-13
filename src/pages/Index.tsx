import { useState, useEffect } from "react";
import { migrateLocalData } from "@/utils/migrateLocalData";
import {
  Wallet, TrendingUp, BarChart3, CalendarDays,
  ChevronLeft, ChevronRight, LayoutDashboard, LineChart,
  Settings, LogOut, CreditCard, Sparkles, AlertTriangle, Zap, PiggyBank, X,
} from "lucide-react";
import { getExpenseCardOptions, useExpenses } from "@/hooks/useExpenses";
import { useAuth } from "@/hooks/useAuth";
import { StatCard } from "@/components/StatCard";
import { ExpenseForm } from "@/components/ExpenseForm";
import { ExpenseList } from "@/components/ExpenseList";
import { SpendingChart } from "@/components/SpendingChart";
import { AIInsights } from "@/components/AIInsights";
import { AIChat } from "@/components/AIChat";
import { QuickLogOverlay } from "@/components/QuickLogOverlay";
import { AuthPage } from "@/components/AuthPage";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { InvestmentSuggestions } from "@/components/InvestmentSuggestions";
import { SeasonalTripPlanner } from "@/components/SeasonalTripPlanner";
import { ProfileSettings } from "@/components/ProfileSettings";
import { CreditCardHub } from "@/components/CreditCardHub";
import { BankConnect } from "@/components/BankConnect";
import { usePlaid } from "@/hooks/usePlaid";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

type Tab = "dashboard" | "investments" | "cards" | "settings";

function getMonthBudget(user: ReturnType<typeof useAuth>["user"], year: number, month: number) {
  if (!user) return null;
  const paychecks = (user.paychecks || []).filter((p) => {
    const d = new Date(p.date);
    return d.getFullYear() === year && d.getMonth() + 1 === month;
  });
  const monthlyIncome = paychecks.reduce((s, p) => s + p.amount, 0);
  const savingsAccounts = user.savingsAccounts || [];
  const totalSavingsPerPaycheck = savingsAccounts.reduce((s, a) => s + a.amountPerPaycheck, 0);
  const monthlySavings = totalSavingsPerPaycheck * paychecks.length;
  const expenseLimit = monthlyIncome - monthlySavings;

  if (paychecks.length === 0) {
    const fixed = user.rentMortgage + user.carPayment + user.insurancePremiums + user.subscriptions + user.otherFixedExpenses;
    return {
      paychecks: [] as { id: string; amount: number; date: string }[],
      monthlyIncome: user.netMonthlyIncome,
      monthlySavings: (user.savingsGoalPercent / 100) * user.netMonthlyIncome,
      expenseLimit: Math.max(0, user.netMonthlyIncome - fixed),
      usingFallback: true,
    };
  }
  return { paychecks, monthlyIncome, monthlySavings, expenseLimit: Math.max(0, expenseLimit), usingFallback: false };
}

export default function Index() {
  const { user, isLoggedIn, login, signup, logout, updateProfile, resetPassword } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [paycheckInput, setPaycheckInput] = useState("");
  const [dismissedPaycheckPrompt, setDismissedPaycheckPrompt] = useState(false);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { expenses, addExpense, deleteExpense, resetExpenses, getMonthExpenses, getTotalByCategory } =
    useExpenses(user?.id);
  const cardOptions = getExpenseCardOptions(user?.id);

  const {
    configured: plaidConfigured,
    connections: plaidConnections,
    transactions: plaidTransactions,
    holdings: plaidHoldings,
    accounts: plaidAccounts,
    loadingConnections: plaidLoadingConnections,
    loadingTransactions: plaidLoadingTransactions,
    loadingInvestments: plaidLoadingInvestments,
    getLinkToken,
    onSuccess: onPlaidSuccess,
    fetchTransactions: fetchPlaidTransactions,
    fetchInvestments: fetchPlaidInvestments,
    disconnect: plaidDisconnect,
  } = usePlaid(user?.id);

  const handleImportTransactions = (txs: import("@/hooks/usePlaid").PlaidTransaction[]) => {
    for (const tx of txs) {
      addExpense({
        amount: tx.amount,
        category: tx.category as import("@/hooks/useExpenses").Category,
        description: tx.description,
        date: tx.date,
      });
    }
  };

  // ── Migration: push any localStorage data to MongoDB on first login ──────
  useEffect(() => {
    if (isLoggedIn && user) {
      migrateLocalData(user.id);
    }
  }, [isLoggedIn, user?.id]);

  if (!isLoggedIn) return <AuthPage onLogin={login} onSignup={signup} onResetPassword={resetPassword} />;

  if (user && user.netMonthlyIncome === 0) {
    return <OnboardingWizard userName={user.name} onComplete={(profile) => updateProfile(profile)} />;
  }

  const monthExpenses = getMonthExpenses(year, month);
  const totalByCategory = getTotalByCategory(monthExpenses);
  const monthTotal = monthExpenses.reduce((s, e) => s + e.amount, 0);

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevExpenses = getMonthExpenses(prevYear, prevMonth);
  const prevTotal = prevExpenses.reduce((s, e) => s + e.amount, 0);
  const trend = prevTotal > 0 ? ((monthTotal - prevTotal) / prevTotal) * 100 : 0;

  const topCategory = Object.entries(totalByCategory).sort(([, a], [, b]) => b - a)[0];
  const uniqueDays = new Set(monthExpenses.map((e) => e.date)).size;
  const avgDaily = uniqueDays > 0 ? monthTotal / uniqueDays : 0;

  const goBack = () => {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const goForward = () => {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  // Paycheck prompt logic
  const allPaychecks = user?.paychecks || [];
  const sortedPaychecks = [...allPaychecks].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const lastPaycheck = sortedPaychecks[0] ?? null;
  const daysSinceLast = lastPaycheck
    ? Math.floor((Date.now() - new Date(lastPaycheck.date).getTime()) / 86_400_000)
    : null;
  const needsPaycheckSetup = allPaychecks.length === 0;
  const needsPaycheckUpdate = !needsPaycheckSetup && daysSinceLast !== null && daysSinceLast >= 13;
  const showPaycheckBanner = isCurrentMonth && !dismissedPaycheckPrompt && (needsPaycheckSetup || needsPaycheckUpdate);

  const handleAddPaycheck = () => {
    const amount = parseFloat(paycheckInput);
    if (!amount || amount <= 0 || !user) return;
    const today = now.toISOString().split("T")[0];
    const newEntry = { id: crypto.randomUUID(), amount, date: today };
    updateProfile({ paychecks: [...allPaychecks, newEntry] });
    setPaycheckInput("");
    setDismissedPaycheckPrompt(true);
  };

  const budget = getMonthBudget(user, year, month);

  const NAV_ITEMS: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "investments", label: "Invest", icon: LineChart },
    { id: "cards", label: "Cards", icon: CreditCard },
    { id: "settings", label: "Profile", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      {/* Logout confirm */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass rounded-2xl p-6 w-full max-w-xs space-y-4 animate-in-up border border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                <AlertTriangle size={18} className="text-destructive" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm" style={{fontFamily:"'Syne',sans-serif"}}>Sign Out?</p>
                <p className="text-xs text-muted-foreground">Your data is saved locally</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-border text-muted-foreground hover:bg-secondary transition-colors">
                Cancel
              </button>
              <button onClick={() => { logout(); setShowLogoutConfirm(false); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-destructive text-white hover:opacity-90 transition-colors">
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center pulse-glow"
              style={{background:"linear-gradient(135deg,hsl(185,100%,40%),hsl(195,100%,55%))"}}>
              <Zap size={14} className="text-black" />
            </div>
            <span className="font-bold text-lg tracking-tight" style={{fontFamily:"'Syne',sans-serif"}}>
              Wealth<span className="text-gradient-primary">Wise</span>
            </span>
          </div>

          <nav className="hidden sm:flex items-center gap-1">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === id
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {activeTab === "dashboard" && (
              <>
                <button onClick={goBack} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <ChevronLeft size={15} />
                </button>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-secondary border border-border min-w-[130px] justify-center">
                  <CalendarDays size={12} className="text-muted-foreground" />
                  <span className="text-sm font-medium">{MONTH_NAMES[month - 1].slice(0, 3)} {year}</span>
                </div>
                <button onClick={goForward} disabled={isCurrentMonth}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                  <ChevronRight size={15} />
                </button>
              </>
            )}
            <button onClick={() => setShowLogoutConfirm(true)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-muted-foreground hover:text-destructive transition-colors text-sm">
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5">

        {/* DASHBOARD */}
        {activeTab === "dashboard" && (
          <div className="space-y-5">
            <div>
              <h1 className="text-xl font-bold">
                Hey, <span className="text-gradient-primary">{user?.name.split(" ")[0]}</span> ⚡
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {MONTH_NAMES[month - 1]} {year} · spending overview
              </p>
            </div>

            {/* Paycheck prompt banner */}
            {showPaycheckBanner && (
              <div className="glass rounded-xl p-4 border border-emerald-500/25 bg-emerald-500/5 animate-in-up">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <PiggyBank size={16} className="text-emerald-400 shrink-0" />
                    <p className="text-sm font-semibold text-foreground">
                      {needsPaycheckSetup ? "Set up paycheck tracking" : "New paycheck?"}
                    </p>
                  </div>
                  <button onClick={() => setDismissedPaycheckPrompt(true)} className="text-muted-foreground hover:text-foreground p-0.5">
                    <X size={14} />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  {needsPaycheckSetup
                    ? "Enter your most recent paycheck to calculate your monthly expense limit."
                    : `It's been ${daysSinceLast} days since your last paycheck entry. Enter the new amount to update your budget.`}
                </p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-mono">$</span>
                    <input
                      type="number" min={0} placeholder="Paycheck amount"
                      value={paycheckInput}
                      onChange={(e) => setPaycheckInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddPaycheck()}
                      className="w-full bg-secondary border border-border rounded-xl pl-8 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                    />
                  </div>
                  <button
                    onClick={handleAddPaycheck}
                    disabled={!paycheckInput || parseFloat(paycheckInput) <= 0}
                    className="px-4 py-2 rounded-xl text-black text-sm font-semibold disabled:opacity-40 shrink-0"
                    style={{background:"linear-gradient(135deg,hsl(185,100%,40%),hsl(195,100%,55%))"}}>
                    Update
                  </button>
                </div>
                {(user?.savingsAccounts || []).length > 0 && paycheckInput && parseFloat(paycheckInput) > 0 && (
                  <p className="text-[11px] text-emerald-400 mt-2">
                    Expense limit: ${Math.max(0, parseFloat(paycheckInput) - (user?.savingsAccounts || []).reduce((s, a) => s + a.amountPerPaycheck, 0)).toLocaleString()} after ${(user?.savingsAccounts || []).reduce((s, a) => s + a.amountPerPaycheck, 0).toLocaleString()} in savings
                  </p>
                )}
              </div>
            )}

            {expenses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-6 animate-fade-in">
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center pulse-glow"
                  style={{background:"linear-gradient(135deg,hsl(185,100%,40%),hsl(195,100%,55%))"}}>
                  <Sparkles size={32} className="text-black" />
                </div>
                <div className="text-center space-y-2 max-w-sm">
                  <h2 className="text-xl font-bold">Dashboard ready</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Log your first expense and your charts, insights, and spending overview will appear automatically.
                  </p>
                </div>
                <div className="glass rounded-xl p-5 w-full max-w-sm space-y-3 border-primary/10">
                  <p className="text-xs font-semibold text-primary uppercase tracking-wider">Quick start</p>
                  {[
                    { icon: "💬", text: 'Type "add $12 lunch" in the AI chat' },
                    { icon: "🎙️", text: "Use voice input for hands-free logging" },
                    { icon: "✏️", text: "Use the form below" },
                  ].map((tip) => (
                    <div key={tip.text} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                      <span>{tip.icon}</span><span>{tip.text}</span>
                    </div>
                  ))}
                </div>
                <div className="w-full max-w-sm">
                  <ExpenseForm onAdd={addExpense} userId={user?.id} cardOptions={cardOptions} />
                </div>
              </div>
            ) : (
              <>
                {/* Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <StatCard title="Month Total" value={`$${monthTotal.toFixed(2)}`} trend={trend} icon={<Wallet size={15} />} variant="primary" delay={0} />
                  <StatCard title="Daily Avg" value={`$${avgDaily.toFixed(2)}`} subtitle={`${uniqueDays} active days`} icon={<BarChart3 size={15} />} variant="default" delay={60} />
                  <StatCard title="Top Category" value={topCategory ? `$${topCategory[1].toFixed(0)}` : "$0"} subtitle={topCategory ? topCategory[0] : "—"} icon={<TrendingUp size={15} />} variant="gold" delay={120} />
                  <StatCard title="Transactions" value={String(monthExpenses.length)} subtitle={`${prevExpenses.length} last month`} icon={<CalendarDays size={15} />} variant="default" delay={180} />
                </div>

                {/* Budget bar */}
                {budget && (() => {
                  const pct = budget.expenseLimit > 0 ? Math.min(100, (monthTotal / budget.expenseLimit) * 100) : 0;
                  const savingsAccounts = user?.savingsAccounts || [];
                  const totalSavingsPerPaycheck = savingsAccounts.reduce((s, a) => s + a.amountPerPaycheck, 0);
                  const investable = Math.max(0, budget.expenseLimit - monthTotal);
                  const barColor = pct > 90 ? "bg-destructive" : pct > 70 ? "bg-amber-400" : "bg-primary";
                  return (
                    <div className="glass rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Monthly Budget</span>
                        <span className={`text-xs font-medium ${pct > 90 ? "text-destructive" : pct > 70 ? "text-amber-400" : "text-primary"}`}>
                          ${monthTotal.toFixed(0)} / ${budget.expenseLimit.toFixed(0)}
                        </span>
                      </div>
                      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>💰 Investable: <strong className="text-primary">${investable.toFixed(0)}</strong></span>
                        <span>{pct.toFixed(0)}% used</span>
                      </div>
                      {budget.paychecks.length > 0 && (
                        <div className="border-t border-border pt-2.5 grid grid-cols-3 gap-2">
                          <div className="text-center">
                            <p className="text-[10px] text-muted-foreground">Paychecks</p>
                            <p className="text-xs font-bold text-foreground">${budget.monthlyIncome.toLocaleString()}</p>
                            <p className="text-[10px] text-muted-foreground">{budget.paychecks.length} this month</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-muted-foreground">Savings</p>
                            <p className="text-xs font-bold text-amber-400">−${budget.monthlySavings.toLocaleString()}</p>
                            <p className="text-[10px] text-muted-foreground">${totalSavingsPerPaycheck}/paycheck</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-muted-foreground">Expense Limit</p>
                            <p className="text-xs font-bold text-primary">${budget.expenseLimit.toLocaleString()}</p>
                            <p className="text-[10px] text-muted-foreground">to spend</p>
                          </div>
                        </div>
                      )}
                      {budget.usingFallback && (
                        <p className="text-[10px] text-muted-foreground">
                          Add a paycheck in Profile to enable paycheck-based budgeting
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Main grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-1 space-y-4">
                    <ExpenseForm onAdd={addExpense} userId={user?.id} cardOptions={cardOptions} />
                    <ExpenseList expenses={monthExpenses} onDelete={deleteExpense} />
                  </div>
                  <div className="lg:col-span-2 space-y-4">
                    <SpendingChart expenses={expenses} totalByCategory={totalByCategory} />
                    <AIInsights expenses={monthExpenses} totalByCategory={totalByCategory} monthTotal={monthTotal} />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "investments" && user && (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-bold">Investment <span className="text-gradient-primary">Suggestions</span></h1>
              <p className="text-sm text-muted-foreground">Personalised based on your spending trends & goals</p>
            </div>
            {plaidHoldings.length > 0 && (
              <div className="glass rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Your Portfolio</p>
                  <span className="text-xs text-muted-foreground">
                    {plaidConnections.filter((c) => c.accountTypes.includes("investment")).map((c) => c.institutionName).join(", ")}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {plaidHoldings.slice(0, 6).map((h, i) => {
                    const gain = h.costBasis != null ? h.institutionValue - h.costBasis : null;
                    const gainPct = gain != null && h.costBasis ? (gain / h.costBasis) * 100 : null;
                    return (
                      <div key={i} className="bg-secondary/50 rounded-lg px-3 py-2 text-xs">
                        <p className="font-mono font-bold text-primary">{h.ticker || h.name.slice(0, 6)}</p>
                        <p className="font-semibold">${h.institutionValue.toFixed(2)}</p>
                        {gainPct != null && (
                          <p className={gainPct >= 0 ? "text-emerald-400" : "text-destructive"}>
                            {gainPct >= 0 ? "+" : ""}{gainPct.toFixed(1)}%
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <InvestmentSuggestions expenses={expenses} userProfile={user} />
            <SeasonalTripPlanner expenses={expenses} userProfile={user} />
          </div>
        )}

        {activeTab === "cards" && user && (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-bold">Credit Card <span className="text-gradient-gold">Hub</span></h1>
              <p className="text-sm text-muted-foreground">Maximise rewards · track utilisation · find your next card</p>
            </div>
            <CreditCardHub expenses={expenses} userProfile={user} />
          </div>
        )}

        {activeTab === "settings" && user && (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-bold">Financial <span className="text-gradient-primary">Profile</span></h1>
              <p className="text-sm text-muted-foreground">Update your income, expenses & investment goals</p>
            </div>
            <ProfileSettings user={user} onUpdate={updateProfile} onLogout={() => setShowLogoutConfirm(true)} onResetExpenses={resetExpenses} expenseCount={expenses.length} />
            <div>
              <h2 className="text-base font-bold mb-3">Bank & <span className="text-gradient-primary">Investment Accounts</span></h2>
              <BankConnect
                connections={plaidConnections}
                configured={plaidConfigured}
                loadingConnections={plaidLoadingConnections}
                loadingTransactions={plaidLoadingTransactions}
                loadingInvestments={plaidLoadingInvestments}
                transactions={plaidTransactions}
                holdings={plaidHoldings}
                accounts={plaidAccounts}
                getLinkToken={getLinkToken}
                onSuccess={onPlaidSuccess}
                fetchTransactions={fetchPlaidTransactions}
                fetchInvestments={fetchPlaidInvestments}
                disconnect={plaidDisconnect}
                onImportTransactions={handleImportTransactions}
                existingExpenses={expenses}
              />
            </div>
          </div>
        )}
      </main>

      {/* Bottom nav mobile */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border">
        <div className="flex items-center justify-around px-2 py-2 safe-bottom">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-colors ${
                activeTab === id ? "text-primary" : "text-muted-foreground"
              }`}>
              <Icon size={18} />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          ))}
          <button onClick={() => setShowLogoutConfirm(true)}
            className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl text-muted-foreground">
            <LogOut size={18} />
            <span className="text-[10px] font-medium">Out</span>
          </button>
        </div>
      </nav>

      {user && <AIChat expenses={expenses} userProfile={user} onAddExpense={addExpense} />}
      {user && <QuickLogOverlay onAddExpense={addExpense} />}
    </div>
  );
}