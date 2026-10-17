import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn.js';

const SIZES = {
  sm: 'h-4 w-4',
  md: 'h-7 w-7',
  lg: 'h-10 w-10',
};

export default function LoadingSpinner({ size = 'md', label = 'Loading', className }) {
  return (
    <div className={cn('flex items-center justify-center py-12', className)} role="status">
      <Loader2 className={cn('animate-spin text-primary', SIZES[size])} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
