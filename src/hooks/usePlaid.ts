import { useState, useCallback, useEffect } from "react";
import { apiFetch } from "@/lib/apiClient";

export interface PlaidConnection {
  itemId: string;
  institutionName: string;
  institutionId: string;
  accountTypes: string[];
  connectedAt: string;
}

export interface PlaidTransaction {
  plaidId: string;
  amount: number;
  description: string;
  date: string;
  category: string;
  institutionName: string;
  accountId: string;
}

export interface PlaidHolding {
  accountId: string;
  ticker: string | null;
  name: string;
  type: string;
  quantity: number;
  costBasis: number | null;
  institutionValue: number;
  institutionPrice: number;
  institutionName: string;
}

export interface PlaidAccount {
  accountId: string;
  name: string;
  type: string;
  subtype: string;
  balanceCurrent: number | null;
  institutionName: string;
}

export function usePlaid(userId: string | undefined) {
  const [connections, setConnections] = useState<PlaidConnection[]>([]);
  const [transactions, setTransactions] = useState<PlaidTransaction[]>([]);
  const [holdings, setHoldings] = useState<PlaidHolding[]>([]);
  const [accounts, setAccounts] = useState<PlaidAccount[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [loadingInvestments, setLoadingInvestments] = useState(false);
  const [configured, setConfigured] = useState(true);

  const fetchConnections = useCallback(async () => {
    if (!userId) return;
    setLoadingConnections(true);
    try {
      const res = await apiFetch("/plaid/connections");
      if (res.ok) {
        const data = await res.json();
        if (data.success) setConnections(data.connections);
      } else if (res.status === 503) {
        setConfigured(false);
      }
    } catch {
      // server unreachable
    } finally {
      setLoadingConnections(false);
    }
  }, [userId]);

  useEffect(() => { fetchConnections(); }, [fetchConnections]);

  const getLinkToken = useCallback(async (): Promise<string | null> => {
    try {
      const res = await apiFetch("/plaid/link-token", { method: "POST" });
      if (!res.ok) {
        if (res.status === 503) setConfigured(false);
        return null;
      }
      const data = await res.json();
      return data.link_token || null;
    } catch {
      return null;
    }
  }, []);

  const onSuccess = useCallback(
    async (publicToken: string, metadata: { institution?: { name?: string; institution_id?: string } }) => {
      try {
        const res = await apiFetch("/plaid/exchange-token", {
          method: "POST",
          body: JSON.stringify({
            public_token: publicToken,
            institution_name: metadata.institution?.name,
            institution_id: metadata.institution?.institution_id,
          }),
        });
        if (res.ok) await fetchConnections();
      } catch {
        console.warn("Plaid token exchange failed");
      }
    },
    [fetchConnections]
  );

  const fetchTransactions = useCallback(async () => {
    setLoadingTransactions(true);
    try {
      const res = await apiFetch("/plaid/transactions");
      if (res.ok) {
        const data = await res.json();
        if (data.success) setTransactions(data.transactions);
      }
    } catch {
      console.warn("Plaid transactions fetch failed");
    } finally {
      setLoadingTransactions(false);
    }
  }, []);

  const fetchInvestments = useCallback(async () => {
    setLoadingInvestments(true);
    try {
      const res = await apiFetch("/plaid/investments");
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setHoldings(data.holdings);
          setAccounts(data.accounts);
        }
      }
    } catch {
      console.warn("Plaid investments fetch failed");
    } finally {
      setLoadingInvestments(false);
    }
  }, []);

  const disconnect = useCallback(
    async (itemId: string) => {
      try {
        const res = await apiFetch(`/plaid/disconnect/${itemId}`, { method: "DELETE" });
        if (res.ok) {
          setConnections((prev) => prev.filter((c) => c.itemId !== itemId));
          setTransactions([]);
          setHoldings([]);
          setAccounts([]);
        }
      } catch {
        console.warn("Plaid disconnect failed");
      }
    },
    []
  );

  return {
    configured,
    connections,
    transactions,
    holdings,
    accounts,
    loadingConnections,
    loadingTransactions,
    loadingInvestments,
    getLinkToken,
    onSuccess,
    fetchTransactions,
    fetchInvestments,
    disconnect,
  };
}
