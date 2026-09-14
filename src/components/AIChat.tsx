import { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Send, Mic, MicOff, Bot, User, Loader2 } from "lucide-react";
import { Expense, CATEGORIES, Category, getExpenseCardOptions, localDateString, parseDateString } from "@/hooks/useExpenses";
import { UserProfile } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/apiClient";

interface Message { id: string; role: "user" | "assistant"; content: string; timestamp: number; }
interface AIChatProps { expenses: Expense[]; userProfile: UserProfile; onAddExpense?: (expense: Omit<Expense, "id" | "createdAt">) => void; }

const API = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

// Diagnostic only — fires once, doesn't change behavior. If you're seeing
// canned/generic replies instead of real AI answers, open devtools console:
// this tells you whether it's a build-time config issue (no API URL) before
// you go check the backend's ANTHROPIC_API_KEY.
if (!API && import.meta.env.DEV === false) {
  console.warn(
    "[WealthWise AI] VITE_API_BASE_URL is empty in this build — /ai/chat and " +
    "/ai/parse-expense will fetch a relative path and fail, silently falling " +
    "back to local canned responses. Set VITE_API_BASE_URL before `npm run build`."
  );
}

async function aiChat(message: string, expenses: Expense[], profile: UserProfile, history: Message[]): Promise<string | null> {
  try {
    const res = await apiFetch("/ai/chat", {
      method: "POST",
      body: JSON.stringify({ message, expenses, profile, history: history.slice(-8) }),
    });
    const data = await res.json();
    if (data.fallback || !data.reply) return null;
    return data.reply;
  } catch (err) {
    if (import.meta.env.DEV) console.warn("[WealthWise AI] /ai/chat request failed, using local fallback:", err);
    return null;
  }
}

async function aiParseExpense(text: string): Promise<{ amount: number; category: Category; description: string; date: string } | null> {
  try {
    const res = await apiFetch("/ai/parse-expense", {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (data.fallback || !data.parsed) return null;
    const validCategories: Category[] = ["Food & Dining","Transport","Shopping","Health","Entertainment","Bills & Utilities","Education","Other"];
    const cat: Category = validCategories.includes(data.parsed.category) ? data.parsed.category : "Other";
    return { ...data.parsed, category: cat };
  } catch {
    return null;
  }
}

function generateAIResponse(msg: string, expenses: Expense[], profile: UserProfile): string {
  const m = msg.toLowerCase();
  const now = new Date();
  const cm = now.getMonth() + 1, cy = now.getFullYear();
  const monthExp = expenses.filter(e => { const d = parseDateString(e.date); return d.getFullYear() === cy && d.getMonth() + 1 === cm; });
  const total = monthExp.reduce((s, e) => s + e.amount, 0);
  const byCat: Partial<Record<Category, number>> = {};
  for (const e of monthExp) byCat[e.category] = (byCat[e.category] || 0) + e.amount;
  const sorted = Object.entries(byCat).sort(([, a], [, b]) => b - a);
  const fixed = profile.rentMortgage + profile.carPayment + profile.insurancePremiums + profile.subscriptions + profile.otherFixedExpenses;
  const disposable = profile.netMonthlyIncome - fixed;
  const remaining = disposable - total;

  if (m.includes("spend") || m.includes("spent") || m.includes("how much")) {
    if (m.includes("food") || m.includes("dining")) {
      const amt = byCat["Food & Dining"] || 0;
      return `You've spent **$${amt.toFixed(2)}** on Food & Dining this month (${total > 0 ? ((amt/total)*100).toFixed(0) : 0}% of total). ${amt > 300 ? "💡 Cooking at home a few more times/week could save $100–$200/month." : "Looks reasonable!"}`;
    }
    if (m.includes("total") || m.includes("month")) {
      return `This month: **$${total.toFixed(2)}** across ${monthExp.length} transactions. ${remaining > 0 ? `**$${remaining.toFixed(2)}** remaining in your disposable budget. 💪` : `You've exceeded budget by **$${Math.abs(remaining).toFixed(2)}**. Consider cutting back.`}`;
    }
    const top = sorted[0];
    return `This month: **$${total.toFixed(2)}** total. Top category: **${top?.[0] || "—"}** at $${(top?.[1]||0).toFixed(2)}. $${remaining.toFixed(2)} left in budget.`;
  }

  if (m.includes("save") || m.includes("cut") || m.includes("reduce")) {
    const tips: string[] = [];
    const food = byCat["Food & Dining"] || 0;
    const ent = byCat["Entertainment"] || 0;
    const shop = byCat["Shopping"] || 0;
    if (food > 400) tips.push(`🍽 Food ($${food.toFixed(0)}) — meal prep 3× could save ~$120/month.`);
    if (ent > 100) tips.push(`🎬 Entertainment ($${ent.toFixed(0)}) — audit unused streaming services.`);
    if (shop > 200) tips.push(`🛍 Shopping ($${shop.toFixed(0)}) — try a 48-hour rule before buying.`);
    if (!tips.length) return "Your spending looks well-managed! Keep building that savings buffer.";
    const potential = (food>400?120:0)+(ent>100?30:0)+(shop>200?60:0);
    return `Top savings opportunities:\n\n${tips.join("\n\n")}\n\n💰 **Potential savings: ~$${potential}/mo** = $${(potential*12)}/year!`;
  }

  if (m.includes("invest") || m.includes("stock") || m.includes("etf") || m.includes("portfolio")) {
    const investable = Math.max(0, disposable - total - (profile.savingsGoalPercent / 100) * profile.netMonthlyIncome * 0.5);
    const alloc = { conservative: "70% BND, 20% VTI, 10% VXUS", moderate: "60% VTI, 20% VXUS, 15% BND, 5% VNQ", aggressive: "70% VTI, 20% VXUS, 5% VB, 5% VWO" }[profile.riskTolerance];
    return `Based on your **${profile.riskTolerance}** risk profile & **${profile.investmentHorizonYears}-yr** horizon:\n\n**Allocation:** ${alloc}\n\n**Monthly investable:** ~$${investable.toFixed(0)}\n\nAt 7% avg return → **~$${(investable*12*((Math.pow(1.07,profile.investmentHorizonYears)-1)/0.07/12)).toFixed(0)}** after ${profile.investmentHorizonYears} years.`;
  }

  if (m.includes("budget") || m.includes("income")) {
    return `**Snapshot:**\n\n💵 Gross: $${profile.grossMonthlyIncome.toFixed(0)}/mo\n🏠 Take-home: $${profile.netMonthlyIncome.toFixed(0)}/mo\n🔒 Fixed: $${fixed.toFixed(0)}/mo\n💡 Disposable: $${disposable.toFixed(0)}/mo\n📊 Spent: $${total.toFixed(0)} this month\n✅ Remaining: $${remaining.toFixed(0)}`;
  }

  if (m.includes("hello") || m.includes("hi") || m.includes("hey") || m.length < 10) {
    return `Hi ${profile.name.split(" ")[0]}! ⚡ Ask me:\n• "How much did I spend this month?"\n• "Where can I save money?"\n• "What should I invest in?"\n• "Add $15 lunch" to log an expense`;
  }

  return `I can help with spending analysis, savings tips, investment advice, and budget overviews. Try: "How much did I spend this month?"`;
}

function parseExpense(text: string, userId?: string): Omit<Expense, "id" | "createdAt"> | null {
  const lower = text.toLowerCase();
  const m = lower.match(/\$?([\d]+(?:\.[\d]{1,2})?)/);
  if (!m) return null;
  const amount = parseFloat(m[1]);
  if (!amount || amount <= 0) return null;

  let category: Category = "Other";
  if (/food|lunch|dinner|coffee|restaurant|grocery|groceries|eat|breakfast|brunch/.test(lower)) category = "Food & Dining";
  else if (/uber|taxi|bus|gas|transport|commute/.test(lower)) category = "Transport";
  else if (/shop|amazon|cloth|buy/.test(lower)) category = "Shopping";
  else if (/doctor|pharmacy|health|gym|medicine/.test(lower)) category = "Health";
  else if (/movie|netflix|entertainment|concert|game/.test(lower)) category = "Entertainment";
  else if (/bill|electric|internet|utility|phone/.test(lower)) category = "Bills & Utilities";
  else if (/course|book|school|education|tuition/.test(lower)) category = "Education";

  const cards = getExpenseCardOptions(userId);
  const matched = cards.filter(c => c.id !== "no-rewards").find(c => {
    const label = c.label.toLowerCase().replace(/[^a-z0-9 ]/g, " ");
    return lower.includes(label.split("(")[0].trim());
  });

  const desc = text.replace(/\$?[\d]+(?:\.[\d]{1,2})?/, "")
    .replace(/\b(add|spent|spend|paid|pay|for|on|added?|logged?|using|use|with|log)\b/gi, "")
    .replace(/\s+/g, " ").trim() || `${category} expense`;

  return { amount, category, description: desc.charAt(0).toUpperCase() + desc.slice(1), date: localDateString(), cardId: matched?.id, cardLabel: matched?.label };
}

export function AIChat({ expenses, userProfile, onAddExpense }: AIChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{
    id: "welcome", role: "assistant", timestamp: Date.now(),
    content: `Hi ${userProfile.name.split(" ")[0]}! ⚡ I'm your AI finance assistant. Ask about your spending, savings, or say "add $12 lunch" to log an expense!`,
  }]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [listening, setListening] = useState(false);
  // Track visible viewport height so panel shrinks when iOS keyboard opens
  const [viewportH, setViewportH] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, open]);

  // Prevent body scroll while chat panel is open (iOS PWA fix)
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  // Shrink panel when iOS keyboard opens — iOS doesn't resize the window,
  // but it does update visualViewport. This keeps the input bar visible.
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setViewportH(vv.height);
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [open]);

  const send = async (text: string) => {
    if (!text.trim()) return;
    const currentMessages = messages;
    setMessages(m => [...m, { id: crypto.randomUUID(), role: "user", content: text, timestamp: Date.now() }]);
    setInput(""); setTyping(true);

    const isCmd = /\b(add|log|spent|spend|paid|pay)\b/.test(text.toLowerCase()) && /\$?[\d]+/.test(text);

    let response = "";
    if (isCmd && onAddExpense) {
      // Try AI parsing first, fall back to regex
      const aiParsed = await aiParseExpense(text);
      const parsed = aiParsed
        ? { ...aiParsed, cardId: undefined, cardLabel: undefined }
        : parseExpense(text, userProfile.id);
      if (parsed) {
        onAddExpense(parsed);
        response = `✅ Added **$${parsed.amount.toFixed(2)}** to **${parsed.category}** — "${parsed.description}"${parsed.cardLabel ? ` via **${parsed.cardLabel}**` : ""}`;
      } else {
        response = `Couldn't parse that. Try: "Add $15 lunch" or "Spent $45 on groceries"`;
      }
    } else {
      // Try Claude first, fall back to local logic
      const aiReply = await aiChat(text, expenses, userProfile, currentMessages);
      response = aiReply ?? generateAIResponse(text, expenses, userProfile);
    }

    setTyping(false);
    setMessages(m => [...m, { id: crypto.randomUUID(), role: "assistant", content: response, timestamp: Date.now() }]);
  };

  const startVoice = () => {
    const w = window as any;
    const API = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!API) { setInput("Voice not supported. Try Chrome."); return; }
    const r = new API(); r.continuous = false; r.lang = "en-US";
    recRef.current = r;
    r.onstart = () => setListening(true);
    r.onend = () => setListening(false);
    r.onresult = (e: any) => send(e.results[0][0].transcript);
    r.onerror = () => setListening(false);
    r.start();
  };

  const fmt = (text: string) => text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i} className="text-foreground font-semibold">{p.slice(2,-2)}</strong> : <span key={i}>{p}</span>
  );

  const QUICK = ["Total spent?", "Save money", "Invest advice", "Budget overview"];

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="fixed right-5 z-50 w-14 h-14 rounded-full flex items-center justify-center pulse-glow hover:opacity-90 transition-opacity text-black shadow-xl"
        // style={{bottom:"calc(4.75rem + env(safe-area-inset-bottom, 0px))"}}
        // style={{background:"linear-gradient(135deg,hsl(185,100%,40%),hsl(195,100%,55%))"}}
        style={{bottom:"calc(4.75rem + env(safe-area-inset-bottom, 0px))", background:"linear-gradient(135deg,hsl(185,100%,40%),hsl(195,100%,55%))"}}>
        <MessageSquare size={20} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end sm:p-4">
          <div className="absolute inset-0 bg-black/60 sm:bg-transparent" onClick={() => setOpen(false)} />
          <div className="relative w-full sm:w-96 glass rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden"
            style={{
              // Use live visualViewport height when available (iOS keyboard shrinks it)
              // Fall back to dvh which handles the dynamic viewport correctly
              height: viewportH ? `${Math.min(viewportH * 0.92, 700)}px` : "min(88dvh, 88vh, 700px)",
              border:"1px solid hsl(185 100% 50% / 0.15)"
            }}>
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
              <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
                <Bot size={15} className="text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold" style={{fontFamily:"'Syne',sans-serif"}}>WealthWise AI</p>
                <p className="text-xs text-muted-foreground">Financial Assistant</p>
              </div>
              <button onClick={() => setOpen(false)} className="p-2 -mr-1 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                <X size={17} />
              </button>
            </div>

            {/* Quick chips */}
            <div className="flex gap-2 px-3 py-2 overflow-x-auto border-b border-border">
              {QUICK.map(q => (
                <button key={q} onClick={() => send(q)}
                  className="shrink-0 text-xs px-3 py-1.5 rounded-full bg-secondary text-muted-foreground hover:text-foreground border border-border transition-colors">
                  {q}
                </button>
              ))}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{WebkitOverflowScrolling:"touch"} as React.CSSProperties}>
              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${msg.role === "assistant" ? "bg-primary/15" : "bg-secondary"}`}>
                    {msg.role === "assistant" ? <Bot size={12} className="text-primary" /> : <User size={12} className="text-muted-foreground" />}
                  </div>
                  <div className={`max-w-[80%] px-3 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
                    msg.role === "user" ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-secondary text-foreground rounded-tl-sm"
                  }`}>
                    {msg.role === "assistant" ? fmt(msg.content) : msg.content}
                  </div>
                </div>
              ))}
              {typing && (
                <div className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
                    <Bot size={12} className="text-primary" />
                  </div>
                  <div className="bg-secondary px-3 py-2.5 rounded-2xl rounded-tl-sm flex items-center gap-1.5">
                    <Loader2 size={12} className="text-muted-foreground animate-spin" />
                    <span className="text-xs text-muted-foreground">Thinking…</span>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* Input */}
            <div className="px-3 py-3 border-t border-border bg-card">
              {listening && (
                <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-destructive/10 rounded-lg border border-destructive/20">
                  <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                  <span className="text-xs text-destructive font-medium">Listening…</span>
                </div>
              )}
              <div className="flex gap-2">
                <input ref={inputRef} type="text" value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && send(input)}
                  placeholder='Ask anything or "Add $12 lunch"'
                  className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                <button onClick={listening ? () => { recRef.current?.stop(); setListening(false); } : startVoice}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${listening ? "bg-destructive text-white" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                  {listening ? <MicOff size={15} /> : <Mic size={15} />}
                </button>
                <button onClick={() => send(input)} disabled={!input.trim()}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-black disabled:opacity-40 hover:opacity-90 transition-opacity"
                  style={{background:"linear-gradient(135deg,hsl(185,100%,40%),hsl(195,100%,55%))"}}>
                  <Send size={14} />
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5 px-1">💡 Say "Add $25 groceries" to log via voice</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
