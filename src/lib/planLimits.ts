import type { PlanType } from '@/types/auth';

export interface PlanLimits {
  domains: number;
  campaignsPerDomain: number;
  seats: number; // owner + N teammates
  label: string;
  priceGbp: number;
}

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  starter: {
    domains:           1,
    campaignsPerDomain: 3,
    seats:             1,
    label:             'Starter',
    priceGbp:          12.99,
  },
  freelancer: {
    domains:           5,
    campaignsPerDomain: 5,
    seats:             3,
    label:             'Freelancer',
    priceGbp:          29.99,
  },
  agency: {
    domains:           15,
    campaignsPerDomain: 10,
    seats:             15,
    label:             'Growth Agency',
    priceGbp:          59.99,
  },
};

export function getPlanFromPriceId(priceId: string): PlanType {
  if (priceId === process.env.STRIPE_PRICE_FREELANCER) return 'freelancer';
  if (priceId === process.env.STRIPE_PRICE_AGENCY)     return 'agency';
  if (priceId === process.env.STRIPE_PRICE_ID)         return 'starter';
  return 'starter';
}
