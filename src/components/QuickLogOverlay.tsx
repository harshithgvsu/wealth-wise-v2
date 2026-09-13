import { useEffect, useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { X, Check } from "lucide-react";
import { CATEGORIES, type Category, type Expense } from "@/hooks/useExpenses";

// iOS-only quick-log entry points. Both are inert on web/Android — this whole
// file is a no-op there, so it never affects the web build (Capacitor.getPlatform()
// returns "web" in the browser and in a plain PWA install).
//
// 1. Home Screen long-press → one of 4 static Quick Actions, each pre-selecting
//    a category. Wired via @capawesome/capacitor-app-shortcuts.
// 2. Back Tap → this app has no API access to that gesture (Apple doesn't expose
//    it to third-party apps at all — it's an Accessibility feature the user must
//    bind themselves). What IS wired up: a custom "wealthwise://quicklog" URL
//    scheme (see ios/App/App/Info.plist) that opens straight to this overlay's
//    category grid. To actually trigger it with Back Tap, the user has to:
//      Shortcuts app → new Shortcut → "Open URLs" → wealthwise://quicklog
//      Settings → Accessibility → Touch → Back Tap → Double/Triple Tap → pick that Shortcut
//    That one-time setup can't be done from inside the app — see README.

// Only 4 fit as iOS Home Screen Quick Actions without feeling cluttered.
const QUICK_CATEGORIES: Category[] = ["Food & Dining", "Transport", "Shopping", "Bills & Utilities"];

const IS_IOS = Capacitor.getPlatform() === "ios";

function haptic(style: ImpactStyle) {
  if (IS_IOS) Haptics.impact({ style }).catch(() => {});
}

interface QuickLogOverlayProps {
  onAddExpense: (expense: Omit<Expense, "id" | "createdAt">) => void;
}

export function QuickLogOverlay({ onAddExpense }: QuickLogOverlayProps) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [logged, setLogged] = useState(false);

  const openWithCategory = useCallback((cat: Category | null) => {
    haptic(ImpactStyle.Medium);
    setCategory(cat);
    setAmount("");
    setDescription("");
    setLogged(false);
    setOpen(true);
  }, []);

  // Register the 4 Home Screen Quick Actions and listen for taps. Also handle
  // the custom URL scheme for the Back Tap path (see file header).
  useEffect(() => {
    if (!IS_IOS) return;
    let shortcutsSub: { remove: () => void } | undefined;
    let urlSub: { remove: () => void } | undefined;

    import("@capawesome/capacitor-app-shortcuts").then(({ AppShortcuts }) => {
      AppShortcuts.set({
        shortcuts: QUICK_CATEGORIES.map((cat) => ({
          id: cat,
          title: `Log ${cat}`,
          description: "Quick-add an expense",
        })),
      }).catch(() => console.warn("AppShortcuts.set failed"));

      AppShortcuts.addListener("click", (event) => {
        const cat = QUICK_CATEGORIES.find((c) => c === event.shortcutId) ?? null;
        openWithCategory(cat);
      }).then((sub) => { shortcutsSub = sub; });
    });

    CapacitorApp.addListener("appUrlOpen", (data) => {
      if (data.url.startsWith("wealthwise://quicklog")) openWithCategory(null);
    }).then((sub) => { urlSub = sub; });

    return () => { shortcutsSub?.remove(); urlSub?.remove(); };
  }, [openWithCategory]);

  if (!open) return null;

  const amountNum = parseFloat(amount);
  const canLog = category && amountNum > 0;

  const handleLog = () => {
    if (!canLog || !category) return;
    onAddExpense({
      amount: amountNum,
      category,
      description: description.trim() || `${category} expense`,
      date: new Date().toISOString().split("T")[0],
    });
    haptic(ImpactStyle.Light);
    setLogged(true);
    setTimeout(() => setOpen(false), 700);
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/70" onClick={() => setOpen(false)}>
      <div
        className="absolute bottom-0 left-0 right-0 bg-card rounded-t-2xl p-5 space-y-4"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold" style={{ fontFamily: "'Syne',sans-serif" }}>Quick Log</p>
          <button onClick={() => setOpen(false)} className="p-2 -mr-2 rounded-lg text-muted-foreground">
            <X size={16} />
          </button>
        </div>

        {logged ? (
          <div className="flex flex-col items-center gap-2 py-6">
            <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center">
              <Check size={20} className="text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">Logged ${amountNum.toFixed(2)} to {category}</p>
          </div>
        ) : !category ? (
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => { haptic(ImpactStyle.Light); setCategory(cat); }}
                className="py-3 rounded-xl bg-secondary text-sm font-medium text-foreground active:opacity-70"
              >
                {cat}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{category}</p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">$</span>
              <input
                autoFocus
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-secondary border border-border rounded-xl pl-7 pr-4 py-3 text-lg font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <input
              type="text"
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={handleLog}
              disabled={!canLog}
              className="w-full py-3 rounded-xl text-black text-sm font-semibold disabled:opacity-40"
              style={{ background: "linear-gradient(135deg,hsl(185,100%,40%),hsl(195,100%,55%))" }}
            >
              Log Expense
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
