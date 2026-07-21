import Image from 'next/image';
import { cn } from '@/lib/utils';

export default function TradePinaxLogo({
  height = 44,
  variant = 'wordmark',
  className,
  priority = false,
}: {
  height?: number;
  variant?: 'wordmark' | 'mark';
  className?: string;
  priority?: boolean;
}) {
  const isMark = variant === 'mark';
  const source = isMark ? '/tradepinax-mark.png' : '/tradepinax-logo.png';
  const intrinsicWidth = isMark ? 246 : 885;
  const intrinsicHeight = 275;
  const width = Math.round((height * intrinsicWidth) / intrinsicHeight);

  return (
    <Image
      src={source}
      alt="TradePinax"
      width={intrinsicWidth}
      height={intrinsicHeight}
      priority={priority}
      sizes={`${width}px`}
      className={cn('shrink-0 object-contain', className)}
      style={{ width, height }}
    />
  );
}
