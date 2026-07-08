import { useState, useCallback } from "react";
import { usePlaidLink } from "react-plaid-link";
import { Building2, TrendingUp, Trash2, RefreshCw, CheckCircle, AlertCircle, Loader2, Plus } from "lucide-react";
import type { PlaidConnection, PlaidTransaction, PlaidHolding, PlaidAccount } from "@/hooks/usePlaid";
import type { Expense } from "@/hooks/useExpenses";

interface BankConnectProps {
  connections: PlaidConnection[];
  configured: boolean;
  loadingConnections: boolean;
  loadingTransactions: boolean;
  loadingInvestments: boolean;
  transactions: PlaidTransaction[];
  holdings: PlaidHolding[];
  accounts: PlaidAccount[];
  getLinkToken: () => Promise<string | null>;
  onSuccess: (publicToken: string, metadata: { institution?: { name?: string; institution_id?: string } }) => Promise<void>;
  fetchTransactions: () => void;
  fetchInvestments: () => void;
  disconnect: (itemId: string) => Promise<void>;
  onImportTransactions: (txs: PlaidTransaction[]) => void;
  existingExpenses: Expense[];
}

function ConnectButton({
  getLinkToken,
  onSuccess,
}: Pick<BankConnectProps, "getLinkToken" | "onSuccess">) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (publicToken, metadata) => {
      onSuccess(publicToken, metadata as { institution?: { name?: string; institution_id?: string } });
    },
  });

  const handleConnect = useCallback(async () => {
    setFetching(true);
    setError(null);
    const token = await getLinkToken();
    if (!token) {
      setError("Could not start connection. Check that Plaid is configured.");
      setFetching(false);
      return;
    }
    setLinkToken(token);
    setFetching(false);
  }, [getLinkToken]);

  // Open Plaid Link once token is ready
  if (linkToken && ready) {
    open();
    setLinkToken(null);
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleConnect}
        disabled={fetching}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-black text-sm font-semibold disabled:opacity-50"
        style={{ background: "linear-gradient(135deg,hsl(185,100%,40%),hsl(195,100%,55%))" }}
      >
        {fetching ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        Connect Account
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function BankConnect({
  connections,
  configured,
  loadingConnections,
  loadingTransactions,
  loadingInvestments,
  transactions,
  holdings,
  accounts,
  getLinkToken,
  onSuccess,
  fetchTransactions,
  fetchInvestments,
  disconnect,
  onImportTransactions,
  existingExpenses,
}: BankConnectProps) {
  const [importedIds, setImportedIds] = useState<Set<string>>(() => {
    const existing = new Set<string>();
    for (const e of existingExpenses) {
      if ((e as Expense & { plaidId?: string }).plaidId) {
        existing.add((e as Expense & { plaidId?: string }).plaidId!);
      }
    }
    return existing;
  });

  const bankConnections = connections.filter((c) =>
    c.accountTypes.some((t) => ["depository", "credit"].includes(t))
  );
  const investmentConnections = connections.filter((c) =>
    c.accountTypes.includes("investment")
  );

  const handleImportAll = () => {
    const toImport = transactions.filter((tx) => !importedIds.has(tx.plaidId));
    if (!toImport.length) return;
    onImportTransactions(toImport);
    setImportedIds((prev) => {
      const next = new Set(prev);
      toImport.forEach((tx) => next.add(tx.plaidId));
      return next;
    });
  };

  const totalPortfolioValue = accounts
    .filter((a) => a.type === "investment")
    .reduce((s, a) => s + (a.balanceCurrent || 0), 0);

  if (!configured) {
    return (
      <div className="glass rounded-xl p-5 border border-amber-500/25 bg-amber-500/5 space-y-2">
        <div className="flex items-center gap-2">
          <AlertCircle size={16} className="text-amber-400" />
          <p className="text-sm font-semibold">Plaid not configured</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Add <code className="text-primary">PLAID_CLIENT_ID</code>, <code className="text-primary">PLAID_SECRET</code>, and{" "}
          <code className="text-primary">PLAID_ENV=sandbox</code> to your backend <code>.env</code> to enable bank and
          investment connections. Sign up free at <strong>plaid.com/products/transactions</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Connected accounts */}
      <div className="glass rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 size={15} className="text-primary" />
            <span className="text-sm font-semibold">Connected Accounts</span>
          </div>
          <ConnectButton getLinkToken={getLinkToken} onSuccess={onSuccess} />
        </div>

        {loadingConnections ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 size={12} className="animate-spin" /> Loading…
          </div>
        ) : connections.length === 0 ? (
          <p className="text-xs text-muted-foreground py-1">
            No accounts connected yet. Click <strong>Connect Account</strong> to link your bank or Robinhood.
          </p>
        ) : (
          <div className="space-y-2">
            {connections.map((conn) => (
              <div key={conn.itemId} className="flex items-center justify-between bg-secondary/50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <CheckCircle size={13} className="text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-xs font-medium">{conn.institutionName}</p>
                    <p className="text-[10px] text-muted-foreground capitalize">
                      {conn.accountTypes.join(", ")}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => disconnect(conn.itemId)}
                  className="text-muted-foreground hover:text-destructive transition-colors p-1"
                  title="Disconnect"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bank transactions */}
      {bankConnections.length > 0 && (
        <div className="glass rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Bank Transactions</span>
            <div className="flex items-center gap-2">
              {transactions.length > 0 && (
                <button
                  onClick={handleImportAll}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium text-black"
                  style={{ background: "linear-gradient(135deg,hsl(185,100%,40%),hsl(195,100%,55%))" }}
                >
                  Import All ({transactions.filter((tx) => !importedIds.has(tx.plaidId)).length} new)
                </button>
              )}
              <button
                onClick={fetchTransactions}
                disabled={loadingTransactions}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <RefreshCw size={13} className={loadingTransactions ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {transactions.length === 0 && !loadingTransactions && (
            <p className="text-xs text-muted-foreground">Click refresh to load your recent transactions.</p>
          )}

          {loadingTransactions && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" /> Fetching transactions…
            </div>
          )}

          {transactions.length > 0 && (
            <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
              {transactions.slice(0, 50).map((tx) => {
                const imported = importedIds.has(tx.plaidId);
                return (
                  <div
                    key={tx.plaidId}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs ${
                      imported ? "opacity-40" : "bg-secondary/50"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{tx.description}</p>
                      <p className="text-muted-foreground">{tx.date} · {tx.category} · {tx.institutionName}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="font-mono font-semibold">${tx.amount.toFixed(2)}</span>
                      {imported ? (
                        <CheckCircle size={12} className="text-emerald-400" />
                      ) : (
                        <button
                          onClick={() => {
                            onImportTransactions([tx]);
                            setImportedIds((prev) => new Set([...prev, tx.plaidId]));
                          }}
                          className="text-primary hover:underline"
                        >
                          Import
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Investment holdings */}
      {investmentConnections.length > 0 && (
        <div className="glass rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp size={15} className="text-amber-400" />
              <span className="text-sm font-semibold">Investment Holdings</span>
              {totalPortfolioValue > 0 && (
                <span className="text-xs text-muted-foreground">
                  · Total <strong className="text-primary">${totalPortfolioValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
                </span>
              )}
            </div>
            <button
              onClick={fetchInvestments}
              disabled={loadingInvestments}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <RefreshCw size={13} className={loadingInvestments ? "animate-spin" : ""} />
            </button>
          </div>

          {holdings.length === 0 && !loadingInvestments && (
            <p className="text-xs text-muted-foreground">Click refresh to load your holdings.</p>
          )}

          {loadingInvestments && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" /> Fetching holdings…
            </div>
          )}

          {holdings.length > 0 && (
            <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
              {holdings.map((h, i) => {
                const gain = h.costBasis != null ? h.institutionValue - h.costBasis : null;
                const gainPct = gain != null && h.costBasis ? (gain / h.costBasis) * 100 : null;
                return (
                  <div key={i} className="flex items-center justify-between bg-secondary/50 rounded-lg px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {h.ticker && <span className="font-mono font-bold text-primary">{h.ticker}</span>}
                        <span className="truncate text-muted-foreground">{h.name}</span>
                      </div>
                      <p className="text-muted-foreground">{h.quantity.toFixed(4)} shares · {h.institutionName}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="font-mono font-semibold">${h.institutionValue.toFixed(2)}</p>
                      {gainPct != null && (
                        <p className={gainPct >= 0 ? "text-emerald-400" : "text-destructive"}>
                          {gainPct >= 0 ? "+" : ""}{gainPct.toFixed(1)}%
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
