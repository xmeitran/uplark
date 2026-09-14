import { Info } from "lucide-react";

type EvTraceProps = {
  ev: string;
  title: string;
  scope: string;
};

export function EvTrace({ ev, title, scope }: EvTraceProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600" data-testid={`ev-trace-${ev.toLowerCase()}`}>
      <span className="inline-flex items-center gap-1.5 font-bold uppercase tracking-wide text-slate-800"><Info className="h-3.5 w-3.5 text-primary" /> Demo trace</span>
      <span className="rounded-md bg-white px-2 py-1 font-mono font-bold text-primary">{ev}</span>
      <span className="font-semibold text-slate-700">{title}</span>
      <span className="text-slate-500">{scope}</span>
    </div>
  );
}
