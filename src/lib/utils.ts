import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-IN').format(num)
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

export function getPnLColor(pnl: number): string {
  if (pnl > 0) return '#00d4aa'
  if (pnl < 0) return '#ef4444'
  return '#94a3b8'
}

export function getSegmentColor(segment: string): string {
  const colors: Record<string, string> = {
    EQ: '#3b82f6',
    FUT: '#8b5cf6',
    OPT: '#f59e0b',
    ETF: '#10b981',
    MF: '#6366f1',
  }
  return colors[segment] || '#94a3b8'
}
