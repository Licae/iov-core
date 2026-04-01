import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, MoreHorizontal, XCircle } from 'lucide-react';
import { motion } from 'motion/react';

type ToastProps = {
  key?: string;
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
};

export const Toast = ({ message, type, onClose }: ToastProps) => (
  <motion.div
    initial={{ opacity: 0, y: 20, x: 20 }}
    animate={{ opacity: 1, y: 0, x: 0 }}
    exit={{ opacity: 0, scale: 0.95 }}
    className={`fixed bottom-8 right-8 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md ${
      type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-red-500/10 border-red-500/20 text-red-500'
    }`}
  >
    {type === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
    <span className="text-sm font-medium">{message}</span>
    <button onClick={onClose} className="ml-2 hover:opacity-70 transition-opacity">
      <MoreHorizontal size={14} />
    </button>
  </motion.div>
);

export const SidebarItem = ({
  icon: Icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  badge?: string;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center justify-between px-6 py-3 text-sm transition-all relative ${
      active ? 'text-white' : 'text-text-secondary hover:text-white hover:bg-white/5'
    }`}
  >
    <div className="flex items-center gap-3">
      <Icon size={18} className={active ? 'text-accent' : ''} />
      <span className="font-medium">{label}</span>
    </div>
    {badge && (
      <span className="bg-accent/20 text-accent text-[10px] px-1.5 py-0.5 rounded font-bold">
        {badge}
      </span>
    )}
    {active && <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent" />}
  </button>
);

export const StatCard = ({
  label,
  value,
  trend,
  footnote,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  trend?: string;
  footnote?: string;
  icon: LucideIcon;
  color: string;
}) => (
  <div className="glass-card p-6 flex-1 min-w-[240px]">
    <div className="flex justify-between items-start mb-4">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${color}`} />
        <span className="text-[12px] text-text-secondary font-medium">{label}</span>
      </div>
      <div className="bg-white/5 p-2 rounded-lg">
        <Icon size={20} className="text-text-secondary" />
      </div>
    </div>
    <div className="flex items-end gap-3">
      <div className="text-3xl font-bold tracking-tight">{value}</div>
      {trend && <div className="text-[11px] text-success font-medium pb-1">{trend}</div>}
    </div>
    <div className="mt-4 text-[10px] text-text-secondary uppercase tracking-wider font-bold">
      {footnote || '实时统计'}
    </div>
  </div>
);
