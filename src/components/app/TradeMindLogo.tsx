'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

export default function TradeMindLogo({
  size = 40,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const gradId = `tmLogoGrad-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="4" y1="8" x2="60" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0EA5E9" />
          <stop offset="1" stopColor="#0369A1" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${gradId})`} />
      <rect x="14" y="34" width="8" height="16" rx="2" fill="white" fillOpacity="0.85" />
      <rect x="28" y="24" width="8" height="26" rx="2" fill="white" />
      <rect x="42" y="14" width="8" height="36" rx="2" fill="#FDE68A" />
    </svg>
  );
}
