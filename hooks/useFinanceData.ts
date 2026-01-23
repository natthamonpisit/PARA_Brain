
import { useState, useCallback } from 'react';
import { FinanceAccount, Transaction } from '../types';
import { db } from '../services/db';

export const useFinanceData = () => {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadFinanceData = useCallback(async () => {
    setIsLoading(true);
    try {
      const accs = await db.getAccounts();
      const txs = await db.getTransactions();
      setAccounts(accs);
      setTransactions(txs);
    } catch (e) {
      console.error("Failed to load finance data", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addTransaction = async (tx: Transaction) => {
    await db.addTransaction(tx);
    // Optimistic update or reload
    await loadFinanceData();
  };

  const addAccount = async (acc: FinanceAccount) => {
    await db.addAccount(acc);
    await loadFinanceData();
  };

  return {
    accounts,
    transactions,
    isLoadingFinance: isLoading,
    loadFinanceData,
    addTransaction,
    addAccount
  };
};
