import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Verdict } from '../../engine/evaluate';

const PATHS: Record<string, string> = {
  play: 'M7 5v14l11-7z',
  pause: 'M7 5h4v14H7zM13 5h4v14h-4z',
  replay: 'M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z',
  skip: 'M6 6l8.5 6L6 18zM16 6h2v12h-2z',
  back: 'M15 18l-6-6 6-6',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.3 2.6a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1c.5.4 1.1.7 1.7 1L11 21h4l.3-2.6c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.4z',
  hint: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  info: 'M12 8h.01M11 12h1v5h1M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  court: 'M3 4h18v16H3zM3 12h18M3 8.5h18M3 15.5h18',
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  zap: 'M13 2L4 14h7l-1 8 9-12h-7z',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  compare: 'M8 3v18M16 3v18M3 8h5M16 16h5',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6A2 2 0 0 0 22 18L13.7 3.9a2 2 0 0 0-3.4 0z',
  refresh: 'M4 4v6h6M20 20v-6h-6M20 9A8 8 0 0 0 6 5.3L4 10M4 15a8 8 0 0 0 14 3.7l2-4.7',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  right: 'M9 6l6 6-6 6',
  x: 'M6 6l12 12M18 6L6 18',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8',
  whistle: 'M3 11a6 6 0 1 0 12 0V8H8a5 5 0 0 0-5 3zM15 8h6v3h-6',
  ball: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 3c-3 4-3 14 0 18M3.5 9c5 2 12 2 17 0M5 17c4-4 10-5 15-3',
  rotate: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
  pin: 'M12 22s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  tilt: 'M3 17l9-11 9 11zM7 17l5-6 5 6',
  zoom: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5M8 11h6M11 8v6',
};

export function Icon({ name, className = 'h-5 w-5', filled }: { name: keyof typeof PATHS | string; className?: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name] ?? PATHS.info} />
    </svg>
  );
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

export function Button({ variant = 'secondary', size = 'md', className = '', children, icon, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; icon?: string }) {
  const v: Record<Variant, string> = {
    primary: 'bg-gradient-to-r from-amber-400 to-orange-400 text-slate-950 shadow-lg shadow-amber-500/20 hover:brightness-110',
    secondary: 'bg-white/8 text-slate-100 ring-1 ring-white/12 hover:bg-white/14',
    ghost: 'text-slate-300 hover:bg-white/8 hover:text-white',
    danger: 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/30 hover:bg-rose-500/25',
    success: 'bg-emerald-400 text-slate-950 hover:brightness-110',
  };
  const s = { sm: 'h-8 px-3 text-xs gap-1.5', md: 'h-10 px-4 text-sm gap-2', lg: 'h-12 px-6 text-base gap-2' }[size];
  return (
    <button {...rest} className={`inline-flex items-center justify-center rounded-xl font-semibold transition active:scale-[.97] disabled:pointer-events-none disabled:opacity-40 ${v[variant]} ${s} ${className}`}>
      {icon && <Icon name={icon} className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} />}
      {children}
    </button>
  );
}

export function Card({ className = '', children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={`rounded-2xl bg-slate-900/70 ring-1 ring-white/8 backdrop-blur-sm ${onClick ? 'text-left transition hover:-translate-y-0.5 hover:ring-white/20 hover:bg-slate-800/70' : ''} ${className}`}>
      {children}
    </Tag>
  );
}

export function Pill({ children, tone = 'slate', className = '' }: { children: ReactNode; tone?: 'slate' | 'amber' | 'emerald' | 'rose' | 'sky' | 'violet'; className?: string }) {
  const t = {
    slate: 'bg-white/8 text-slate-300',
    amber: 'bg-amber-400/15 text-amber-200',
    emerald: 'bg-emerald-400/15 text-emerald-200',
    rose: 'bg-rose-400/15 text-rose-200',
    sky: 'bg-sky-400/15 text-sky-200',
    violet: 'bg-violet-400/15 text-violet-200',
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${t} ${className}`}>{children}</span>;
}

export function Segmented<T extends string | number>({ value, options, onChange, size = 'md', className = '' }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; size?: 'sm' | 'md'; className?: string }) {
  return (
    <div className={`inline-flex flex-wrap rounded-xl bg-white/6 p-1 ring-1 ring-white/10 ${className}`} role="radiogroup">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`rounded-lg font-semibold transition ${size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'} ${o.value === value ? 'bg-white text-slate-900 shadow' : 'text-slate-300 hover:text-white'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Bar({ value, tone = 'amber', className = '' }: { value: number; tone?: 'amber' | 'emerald' | 'rose' | 'sky'; className?: string }) {
  const c = { amber: 'from-amber-300 to-orange-400', emerald: 'from-emerald-300 to-teal-400', rose: 'from-rose-300 to-rose-500', sky: 'from-sky-300 to-indigo-400' }[tone];
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-white/8 ${className}`}>
      <div className={`h-full rounded-full bg-gradient-to-r ${c} transition-all duration-700`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export const VERDICT_STYLE: Record<Verdict, { tone: 'rose' | 'amber' | 'sky' | 'emerald'; icon: string; title: string }> = {
  illegal: { tone: 'rose', icon: 'alert', title: 'Illegal positioning' },
  weak: { tone: 'amber', icon: 'info', title: 'Legal, but tactically weak' },
  acceptable: { tone: 'sky', icon: 'check', title: 'Acceptable positioning' },
  recommended: { tone: 'emerald', icon: 'spark', title: 'Recommended positioning' },
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const s = VERDICT_STYLE[verdict];
  const cls = { rose: 'from-rose-500/30 to-rose-500/5 text-rose-100 ring-rose-400/40', amber: 'from-amber-400/30 to-amber-400/5 text-amber-100 ring-amber-300/40', sky: 'from-sky-400/30 to-sky-400/5 text-sky-100 ring-sky-300/40', emerald: 'from-emerald-400/30 to-emerald-400/5 text-emerald-100 ring-emerald-300/40' }[s.tone];
  return (
    <div className={`vq-pop flex items-center gap-2 rounded-xl bg-gradient-to-r px-3 py-2 ring-1 ${cls}`}>
      <Icon name={s.icon} className="h-5 w-5" />
      <span className="font-display text-sm font-bold">{s.title}</span>
    </div>
  );
}

export function ScreenHeader({ title, subtitle, onBack, right }: { title: string; subtitle?: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 pt-4 pb-2 sm:px-6">
      {onBack && (
        <button onClick={onBack} className="grid h-10 w-10 place-items-center rounded-xl bg-white/6 text-slate-200 ring-1 ring-white/10 hover:bg-white/12" aria-label="Back">
          <Icon name="back" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="font-display truncate text-lg font-bold text-white sm:text-xl">{title}</h1>
        {subtitle && <p className="truncate text-xs text-slate-400 sm:text-sm">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-slate-200">
      <span>{label}</span>
      <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-amber-400' : 'bg-white/15'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'left-5' : 'left-0.5'}`} />
      </button>
    </label>
  );
}

export function Collapsible({ title, children, defaultOpen = false }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-xl bg-white/4 ring-1 ring-white/8">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-semibold text-slate-200">
        {title}
        <Icon name="right" className="h-4 w-4 transition group-open:rotate-90" />
      </summary>
      <div className="px-3 pb-3 text-sm text-slate-300">{children}</div>
    </details>
  );
}
