import type { UsageStats as UsageStatsType } from '../types';

interface UsageStatsProps {
  stats: UsageStatsType;
}

export default function UsageStats({ stats }: UsageStatsProps) {
  return (
    <div className="mx-4 mb-2 rounded-xl border border-white/6 bg-white/[0.035] px-3 py-2 text-[11px] text-slate-400">
      <div className="flex justify-between">
        <span>Today</span>
        <span>
          {stats.todayRequests} req / {stats.todayTokens} tok
        </span>
      </div>
      <div className="mt-1 flex justify-between">
        <span>Total</span>
        <span>
          {stats.totalRequests} req / {stats.totalTokens} tok
        </span>
      </div>
    </div>
  );
}
