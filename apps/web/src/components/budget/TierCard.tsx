'use client';

import { Award, BookOpen, ChevronDown, ChevronUp, Gem, Layers, PiggyBank, type LucideIcon } from 'lucide-react';
import { formatMoney, formatQuantity, ITEMS_COLLAPSED, type BudgetTier, type BudgetTierView } from '../../lib/budget/budget-state';

const ICONS: Record<BudgetTier, LucideIcon> = { luxury: Gem, high: Award, medium: Layers, low: PiggyBank };

export interface TierCardLabels {
  tier: string;
  meta: string;
  unit: (unit: string) => string;
  detail: (values: { unitPrice: string; quantity: string; unit: string; sku: string }) => string;
  citation: (values: { catalog: string; page: number }) => string;
  more: (count: number) => string;
  subtotal: string;
  vat: string;
  total: string;
}

/**
 * One Budget Tier (docs/design/budget-tier-computation.md, frames 1 and 2): name, total and item
 * count; the header toggles (aria-expanded) the Line Items with their Catalog citation and the
 * totals block. Tiers are not selectable. Every amount comes from the API cents; the page never sums.
 */
export function TierCard({
  tier,
  locale,
  expanded,
  showAll,
  onToggle,
  onShowAll,
  labels,
}: {
  tier: BudgetTierView;
  locale: string;
  expanded: boolean;
  showAll: boolean;
  onToggle: () => void;
  onShowAll: () => void;
  labels: TierCardLabels;
}) {
  const Icon = ICONS[tier.tier];
  const Chevron = expanded ? ChevronUp : ChevronDown;
  const items = showAll ? tier.items : tier.items.slice(0, ITEMS_COLLAPSED);
  const hidden = tier.items.length - items.length;
  const itemsId = `budget-items-${tier.tier}`;
  const money = (cents: number) => formatMoney(cents, locale);
  return (
    <li
      data-testid={`budget-card-${tier.tier}`}
      className={`flex flex-col gap-md rounded-lg bg-surface p-md shadow-card ${expanded ? 'outline-2 -outline-offset-2 outline-primary' : ''}`}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={itemsId}
        data-testid={`budget-tier-${tier.tier}`}
        onClick={onToggle}
        className="flex w-full flex-col gap-3 text-left"
      >
        <span className="flex w-full items-center justify-between gap-sm">
          <span className="flex items-center gap-sm">
            <Icon size={20} aria-hidden="true" className="shrink-0 text-primary" />
            <span className="text-[18px] leading-6 font-semibold text-text">{labels.tier}</span>
          </span>
          <span className="flex size-11 shrink-0 items-center justify-center">
            <Chevron size={20} aria-hidden="true" className="text-text-muted" />
          </span>
        </span>
        <span data-testid={`budget-total-${tier.tier}`} className="text-h1 font-bold text-text">
          {money(tier.totalCents)}
        </span>
        <span className="text-small leading-5 text-text-muted">{labels.meta}</span>
      </button>
      {expanded ? (
        <div id={itemsId} data-testid={itemsId} className="flex flex-col gap-md">
          <span aria-hidden="true" className="h-px w-full bg-border" />
          <ul className="flex flex-col gap-md">
            {items.map((item, index) => (
              <li key={`${item.sku}-${index}`} data-testid={`budget-item-${index}`} className="flex flex-col gap-1">
                <div className="flex w-full items-start justify-between gap-3">
                  <p className="min-w-0 grow text-body font-semibold text-text [overflow-wrap:anywhere]">{item.name}</p>
                  <p className="shrink-0 text-body font-semibold whitespace-nowrap text-text">{money(item.subtotalCents)}</p>
                </div>
                <p data-testid={`budget-detail-${index}`} className="text-small leading-5 text-text-muted [overflow-wrap:anywhere]">
                  {labels.detail({ unitPrice: money(item.unitPriceCents), quantity: formatQuantity(item.quantity, locale), unit: item.unit, sku: item.sku })}
                </p>
                <p data-testid={`budget-source-${index}`} className="flex items-center gap-1.5 text-xs leading-4 text-text-muted">
                  <BookOpen size={14} aria-hidden="true" className="shrink-0" />
                  <span className="[overflow-wrap:anywhere]">{labels.citation({ catalog: item.catalogName, page: item.pageNumber })}</span>
                </p>
              </li>
            ))}
          </ul>
          {hidden > 0 ? (
            <button
              type="button"
              data-testid={`budget-more-${tier.tier}`}
              onClick={onShowAll}
              className="flex h-11 w-full shrink-0 items-center text-left text-small leading-5 text-text-muted underline"
            >
              {labels.more(hidden)}
            </button>
          ) : null}
          <span aria-hidden="true" className="h-px w-full bg-border" />
          <dl data-testid={`budget-totals-${tier.tier}`} className="flex flex-col gap-sm">
            <div className="flex w-full justify-between gap-3 text-small leading-5">
              <dt className="min-w-0 text-text-muted">{labels.subtotal}</dt>
              <dd className="shrink-0 font-semibold whitespace-nowrap text-text">{money(tier.subtotalCents)}</dd>
            </div>
            <div className="flex w-full justify-between gap-3 text-small leading-5">
              <dt className="min-w-0 text-text-muted">{labels.vat}</dt>
              <dd className="shrink-0 font-semibold whitespace-nowrap text-text">{money(tier.vatCents)}</dd>
            </div>
            <div className="flex w-full justify-between gap-3 text-body">
              <dt className="min-w-0 font-semibold text-text">{labels.total}</dt>
              <dd className="shrink-0 font-bold whitespace-nowrap text-text">{money(tier.totalCents)}</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </li>
  );
}
