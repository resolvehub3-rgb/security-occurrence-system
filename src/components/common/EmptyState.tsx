import React from 'react';
import { LucideIcon, Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center bg-white rounded-2xl border border-stone-200/80 shadow-xs ${className}`}>
      <div className="w-12 h-12 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center mb-3">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-sm font-semibold text-stone-900 mb-1">{title}</h3>
      {description && <p className="text-xs text-stone-500 max-w-sm leading-relaxed mb-4">{description}</p>}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-orange-600 text-white hover:bg-orange-700 transition"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};
