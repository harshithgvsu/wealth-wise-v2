import { useState, useEffect } from "react";

export interface PresetCard {
  id: string;
  name: string;
  issuer: string;
  network: string;
  annualFee: number;
  rewardType: "points" | "cashback" | "miles";
  baseReward: number;
  rewards: Record<string, number>;
  centsPerPoint: number;
  cardBg: string;
  color: string;
  signupBonus?: string;
  signupSpend?: number;
  lastScraped?: string;
}

// Fallback catalog used when the API is unreachable
const FALLBACK_PRESETS: PresetCard[] = [
  { id:"amex-gold", name:"Gold Card", issuer:"Amex", network:"Amex", annualFee:250, signupBonus:"60,000 pts ($600)", signupSpend:4000, rewards:{"Food & Dining":4,Restaurant:4,Groceries:4,Travel:3}, baseReward:1, rewardType:"points", centsPerPoint:1.0, color:"#D4A843", cardBg:"from-yellow-700 via-yellow-600 to-yellow-400" },
  { id:"chase-sapphire-preferred", name:"Sapphire Preferred", issuer:"Chase", network:"Visa", annualFee:95, signupBonus:"60,000 pts ($750 travel)", signupSpend:4000, rewards:{Travel:3,"Food & Dining":3,Restaurant:3,Streaming:3}, baseReward:1, rewardType:"points", centsPerPoint:1.25, color:"#2A6FBF", cardBg:"from-blue-900 via-blue-800 to-blue-600" },
  { id:"chase-sapphire-reserve", name:"Sapphire Reserve", issuer:"Chase", network:"Visa", annualFee:550, signupBonus:"60,000 pts ($900 travel)", signupSpend:4000, rewards:{Travel:10,"Food & Dining":3,Restaurant:3,Gas:3}, baseReward:1, rewardType:"points", centsPerPoint:1.5, color:"#1A1A2E", cardBg:"from-slate-900 via-slate-800 to-slate-700" },
  { id:"citi-double-cash", name:"Double Cash", issuer:"Citi", network:"Mastercard", annualFee:0, rewards:{}, baseReward:2, rewardType:"cashback", centsPerPoint:1, color:"#005792", cardBg:"from-sky-900 via-sky-800 to-sky-600" },
  { id:"amex-blue-cash-preferred", name:"Blue Cash Preferred", issuer:"Amex", network:"Amex", annualFee:95, signupBonus:"$250 statement credit", signupSpend:3000, rewards:{Groceries:6,Streaming:6,Gas:3,Transit:3}, baseReward:1, rewardType:"cashback", centsPerPoint:1, color:"#1A5276", cardBg:"from-blue-900 via-cyan-800 to-blue-500" },
  { id:"discover-it", name:"Discover it® Cash Back", issuer:"Discover", network:"Discover", annualFee:0, signupBonus:"Cashback match first year", signupSpend:0, rewards:{Groceries:5,Gas:5,Restaurants:5}, baseReward:1, rewardType:"cashback", centsPerPoint:1, color:"#F97316", cardBg:"from-orange-700 via-orange-600 to-orange-400" },
  { id:"venture-x", name:"Venture X", issuer:"Capital One", network:"Visa", annualFee:395, signupBonus:"75,000 miles ($750 travel)", signupSpend:4000, rewards:{Travel:10,"Food & Dining":2,Restaurant:2}, baseReward:2, rewardType:"miles", centsPerPoint:1.0, color:"#C0392B", cardBg:"from-red-900 via-red-800 to-rose-600" },
  { id:"apple-card", name:"Apple Card", issuer:"Goldman Sachs", network:"Mastercard", annualFee:0, rewards:{Apple:3}, baseReward:1, rewardType:"cashback", centsPerPoint:1, color:"#9CA3AF", cardBg:"from-gray-600 via-gray-400 to-white" },
];

const CACHE_KEY = "ww_preset_cards";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const API = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

interface CacheEntry {
  presets: PresetCard[];
  fetchedAt: number;
}

function readCache(): PresetCard[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null;
    return entry.presets;
  } catch {
    return null;
  }
}

function writeCache(presets: PresetCard[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ presets, fetchedAt: Date.now() }));
  } catch {
    // storage quota exceeded — non-fatal
  }
}

export function usePresetCards(): { presets: PresetCard[]; loading: boolean; stale: boolean } {
  const cached = readCache();
  const [presets, setPresets] = useState<PresetCard[]>(cached ?? FALLBACK_PRESETS);
  const [loading, setLoading] = useState(!cached);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (cached) return; // fresh cache — skip fetch
    if (!API) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    fetch(`${API}/cards/presets`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success && Array.isArray(data.presets) && data.presets.length > 0) {
          setPresets(data.presets);
          writeCache(data.presets);
        } else {
          setStale(true); // API responded but returned no data — use fallback
        }
      })
      .catch(() => {
        if (!cancelled) setStale(true); // network error — fallback already showing
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  return { presets, loading, stale };
}
