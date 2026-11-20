import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  Info,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { RiskCategory, SeverityClass, ZoneHealthStatus } from '../../types/agroshield.ts';

export function AnimatedCounter({ value, durationMs = 650 }: { value: number; durationMs?: number }) {
  const [display, setDisplay] = useState<number>(value);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value);
      return;
    }

    let rafId = 0;
    const startVal = 0;
    const startTime = performance.now();
    const isDecimal = !Number.isInteger(value);

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startVal + (value - startVal) * eased;
      setDisplay(isDecimal ? Number(current.toFixed(1)) : Math.round(current));
      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        setDisplay(value);
      }
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [value, durationMs]);

  return <>{display}</>;
}

export function PageHeader({
  title,
  subtitle,
  action,
  isDemoContext = true,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  isDemoContext?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between pb-5 border-b border-stone-200"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500 mb-1">
          <span>AgroShield Workspace</span>
          {isDemoContext && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-medium text-emerald-800">Synthetic Karnataka Demo Dataset Active</span>
            </>
          )}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="text-sm text-slate-600 mt-1 max-w-3xl">{subtitle}</p>
      </div>
      {action && <div className="shrink-0 flex items-center gap-3">{action}</div>}
    </motion.div>
  );
}

export function MetricCell({
  label,
  value,
  subtext,
  tone = 'neutral',
  progressPct,
  animateValue = true,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  tone?: 'neutral' | 'healthy' | 'warning' | 'danger' | 'forest';
  progressPct?: number;
  animateValue?: boolean;
}) {
  const toneClass =
    tone === 'healthy'
      ? 'text-emerald-700'
      : tone === 'warning'
      ? 'text-amber-700'
      : tone === 'danger'
      ? 'text-red-700'
      : tone === 'forest'
      ? 'text-emerald-950'
      : 'text-slate-900';

  const barColor =
    tone === 'healthy'
      ? 'bg-emerald-600'
      : tone === 'warning'
      ? 'bg-amber-500'
      : tone === 'danger'
      ? 'bg-red-600'
      : tone === 'forest'
      ? 'bg-emerald-900'
      : 'bg-slate-600';

  return (
    <div className="bg-white border border-stone-200 rounded-lg p-4 agro-card-hover">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`text-2xl font-semibold font-mono tabular-nums mt-1.5 ${toneClass}`}>
        {typeof value === 'number' && animateValue ? <AnimatedCounter value={value} /> : value}
      </div>
      {typeof progressPct === 'number' && (
        <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden mt-2">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(0, Math.min(100, progressPct))}%` }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            className={`h-full rounded-full ${barColor}`}
          />
        </div>
      )}
      {subtext && <div className="text-xs text-slate-500 mt-1 truncate">{subtext}</div>}
    </div>
  );
}

export function StatusPulseDot({
  variant,
}: {
  variant: 'online' | 'warning' | 'danger' | 'neutral';
}) {
  const dotColor =
    variant === 'online'
      ? 'bg-emerald-500'
      : variant === 'warning'
      ? 'bg-amber-500'
      : variant === 'danger'
      ? 'bg-red-600'
      : 'bg-slate-400';

  const ringColor =
    variant === 'online'
      ? 'bg-emerald-400'
      : variant === 'warning'
      ? 'bg-amber-400'
      : variant === 'danger'
      ? 'bg-red-500'
      : 'bg-slate-300';

  return (
    <span className="relative inline-flex items-center justify-center w-2.5 h-2.5 shrink-0" aria-hidden="true">
      {variant !== 'neutral' && (
        <span className={`absolute inset-0 rounded-full opacity-60 agro-pulse-ring ${ringColor}`} />
      )}
      <span className={`relative w-2 h-2 rounded-full ${dotColor}`} />
    </span>
  );
}

export function HealthStatusLabel({ status }: { status: ZoneHealthStatus | string }) {
  switch (status) {
    case ZoneHealthStatus.HEALTHY:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap transition-colors duration-200">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          Healthy
        </span>
      );
    case ZoneHealthStatus.SUSPECTED:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap transition-colors duration-200">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          Suspected
        </span>
      );
    case ZoneHealthStatus.INFECTED:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap transition-colors duration-200">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          Confirmed Infected
        </span>
      );
    case ZoneHealthStatus.AT_RISK:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-700 whitespace-nowrap transition-colors duration-200">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          High Risk (Env)
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 whitespace-nowrap transition-colors duration-200">
          <HelpCircle className="w-3.5 h-3.5 shrink-0" />
          Insufficient Data
        </span>
      );
  }
}

export function RiskCategoryLabel({ category, score }: { category: RiskCategory | string; score?: number }) {
  const color =
    category === RiskCategory.CRITICAL
      ? 'text-red-700'
      : category === RiskCategory.HIGH
      ? 'text-orange-700'
      : category === RiskCategory.MODERATE
      ? 'text-amber-700'
      : 'text-emerald-700';

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap transition-colors duration-200 ${color}`}>
      {category === RiskCategory.CRITICAL && <StatusPulseDot variant="danger" />}
      {typeof score === 'number' && <span className="font-mono tabular-nums font-semibold">{score}/100</span>}
      {typeof score === 'number' && <span aria-hidden="true">·</span>}
      <span>{category}</span>
    </span>
  );
}

export function SeverityLabel({ severity }: { severity: SeverityClass | string }) {
  const color =
    severity === SeverityClass.SEVERE
      ? 'text-red-700'
      : severity === SeverityClass.MODERATE
      ? 'text-orange-700'
      : severity === SeverityClass.MILD
      ? 'text-amber-700'
      : 'text-emerald-700';

  return <span className={`text-xs font-medium whitespace-nowrap ${color}`}>{severity}</span>;
}

export function LoadingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-white border border-stone-200 rounded-lg p-5 space-y-3">
      <div className="h-4 rounded w-1/3 agro-shimmer-bar" />
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-9 rounded w-full agro-shimmer-bar"
          style={{ animationDelay: `${i * 75}ms` }}
        />
      ))}
    </div>
  );
}

export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between gap-4 text-sm text-red-800"
    >
      <div className="flex items-center gap-2.5">
        <AlertTriangle className="w-4 h-4 shrink-0 text-red-700" />
        <span>{message}</span>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-red-200 rounded-md text-red-800 hover:bg-red-100 transition-colors whitespace-nowrap shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      )}
    </motion.div>
  );
}

export function AnimatedNotice({
  message,
  icon,
}: {
  message: string | null;
  icon?: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -6, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.99 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5 text-xs text-emerald-900 flex items-center gap-2"
        >
          {icon || <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />}
          <span>{message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function AnimatedModal({
  open,
  onClose,
  children,
  maxWidthClass = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidthClass?: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className={`w-full ${maxWidthClass}`}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className="bg-white border border-stone-200 rounded-lg p-10 text-center"
    >
      <Info className="w-6 h-6 text-slate-400 mx-auto mb-2.5" />
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 px-4 py-2 text-xs font-medium bg-emerald-900 text-white rounded-md hover:bg-emerald-800 transition-colors whitespace-nowrap"
        >
          {actionLabel}
        </button>
      )}
    </motion.div>
  );
}

export function DemoDisclaimerBar({ text }: { text: string }) {
  return (
    <div className="bg-stone-100 border border-stone-200 rounded-lg px-4 py-2.5 text-xs text-slate-700 flex items-center gap-2">
      <Info className="w-4 h-4 text-emerald-800 shrink-0" />
      <span>{text}</span>
    </div>
  );
}
