
import React, { useMemo } from 'react';
import { FinanceAccount, Transaction, FinanceAccountType, ParaItem } from '../types';
import { Wallet, TrendingUp, TrendingDown, ArrowRightLeft, CreditCard, Building2, Banknote, PieChart, Link2 } from 'lucide-react';

interface FinanceBoardProps {
  accounts: FinanceAccount[];
  transactions: Transaction[];
  projects: ParaItem[]; // To show project names
}

export const FinanceBoard: React.FC<FinanceBoardProps> = ({ accounts, transactions, projects }) => {
  
  const netWorth = useMemo(() => {
    return accounts
        .filter(a => a.isIncludeNetWorth)
        .reduce((sum, acc) => sum + acc.balance, 0);
  }, [accounts]);

  const assets = accounts.filter(a => a.balance > 0).reduce((sum, acc) => sum + acc.balance, 0);
  const liabilities = accounts.filter(a => a.balance < 0).reduce((sum, acc) => sum + acc.balance, 0);

  const getAccountIcon = (type: FinanceAccountType) => {
      switch (type) {
          case 'BANK': return <Building2 className="w-5 h-5" />;
          case 'CREDIT': return <CreditCard className="w-5 h-5" />;
          case 'INVESTMENT': return <PieChart className="w-5 h-5" />;
          default: return <Wallet className="w-5 h-5" />;
      }
  };

  const projectMap = useMemo(() => {
      return projects.reduce((acc, p) => ({...acc, [p.id]: p.title}), {} as Record<string, string>);
  }, [projects]);

  return (
    <div className="pb-32 space-y-8 animate-in fade-in duration-500">
      
      {/* 1. Net Worth Header */}
      <div className="rounded-2xl border border-slate-700/80 bg-gradient-to-r from-slate-900 to-slate-800 p-5 md:p-6 text-white shadow-xl">
         <div className="flex justify-between items-start mb-4">
             <div>
                 <p className="text-slate-400 text-xs md:text-sm font-medium uppercase tracking-wider">Net Worth</p>
                 <h1 className="text-3xl md:text-4xl font-bold mt-1">฿ {netWorth.toLocaleString()}</h1>
             </div>
             <div className="p-3 bg-white/10 rounded-xl backdrop-blur-sm">
                 <Banknote className="w-6 h-6 text-emerald-400" />
             </div>
         </div>
         <div className="grid grid-cols-2 gap-4 mt-6 border-t border-white/10 pt-4">
             <div>
                 <p className="text-slate-400 text-xs mb-1">Total Assets</p>
                 <p className="text-lg font-semibold text-emerald-400">฿ {assets.toLocaleString()}</p>
             </div>
             <div>
                 <p className="text-slate-400 text-xs mb-1">Total Liabilities</p>
                 <p className="text-lg font-semibold text-red-400">฿ {Math.abs(liabilities).toLocaleString()}</p>
             </div>
         </div>
      </div>

      {/* 2. Accounts Grid */}
      <div>
          <h2 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-cyan-300" /> Accounts
          </h2>
          {/* Updated to use Auto-Fill Grid */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
              {accounts.map(acc => (
                  <div key={acc.id} className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4 flex justify-between items-center hover:border-cyan-400/40 transition-colors">
                      <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${acc.balance >= 0 ? 'bg-cyan-500/10 text-cyan-300' : 'bg-rose-500/10 text-rose-300'}`}>
                              {getAccountIcon(acc.type)}
                          </div>
                          <div>
                              <p className="font-semibold text-slate-100 text-sm">{acc.name}</p>
                              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{acc.type}</p>
                          </div>
                      </div>
                      <span className={`font-bold ${acc.balance < 0 ? 'text-rose-300' : 'text-slate-200'}`}>
                          {acc.balance.toLocaleString()}
                      </span>
                  </div>
              ))}
              {accounts.length === 0 && (
                  <div className="col-span-full text-center py-8 text-slate-400 bg-slate-900/50 rounded-2xl border border-dashed border-slate-700">
                      No accounts yet. Add one to get started.
                  </div>
              )}
          </div>
      </div>

      {/* 3. Recent Transactions */}
      <div>
          <h2 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-cyan-300" /> Recent Activity
          </h2>
          <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 overflow-hidden">
              {transactions.length === 0 ? (
                  <div className="p-8 text-center text-slate-400">No transactions recorded yet.</div>
              ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-sm text-left">
                      <thead className="bg-slate-900/90 text-slate-400 font-medium border-b border-slate-700">
                          <tr>
                              <th className="px-4 py-3">Description</th>
                              <th className="px-4 py-3 text-right">Amount</th>
                              <th className="px-4 py-3 hidden md:table-cell">Account</th>
                              <th className="px-4 py-3 hidden md:table-cell">Date</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                          {transactions.map(tx => {
                              const accountName = accounts.find(a => a.id === tx.accountId)?.name || 'Unknown';
                              return (
                                  <tr key={tx.id} className="hover:bg-slate-800/60 transition-colors">
                                      <td className="px-4 py-3">
                                          <div className="font-medium text-slate-100">{tx.description}</div>
                                          <div className="flex items-center gap-2 mt-0.5">
                                              <span className="text-xs text-slate-300 bg-slate-800 border border-slate-700 px-1.5 rounded">{tx.category}</span>
                                              {tx.projectId && projectMap[tx.projectId] && (
                                                  <span className="flex items-center gap-1 text-[10px] text-cyan-300 border border-cyan-400/30 bg-cyan-500/10 px-1.5 rounded-full">
                                                      <Link2 className="w-3 h-3" />
                                                      {projectMap[tx.projectId]}
                                                  </span>
                                              )}
                                          </div>
                                      </td>
                                      <td className={`px-4 py-3 text-right font-bold ${tx.amount > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                                          {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
                                      </td>
                                      <td className="px-4 py-3 text-slate-300 hidden md:table-cell">{accountName}</td>
                                      <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell">
                                          {new Date(tx.transactionDate).toLocaleDateString()}
                                      </td>
                                  </tr>
                              );
                          })}
                      </tbody>
                    </table>
                  </div>
              )}
          </div>
      </div>

    </div>
  );
};
