'use client';

/**
 * "Your budgets" (docs/design/budget-tier-computation.md, frame 1): shown with two or more
 * succeeded Budgets, oldest first numbered; tapping one shows it. The shown one has `aria-current`
 * and a primary stroke.
 */
export function BudgetHistory({
  budgets,
  shownId,
  disabled,
  onShow,
  title,
  counter,
  itemLabel,
}: {
  budgets: Array<{ id: string; number: number }>;
  shownId: string | null;
  disabled: boolean;
  onShow: (budgetId: string) => void;
  title: string;
  counter: string;
  itemLabel: (n: number) => string;
}) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="budget-history-title" data-testid="budget-history">
      <div className="flex items-center justify-between gap-sm">
        <h2 id="budget-history-title" className="text-[18px] leading-6 font-semibold text-text">
          {title}
        </h2>
        <p data-testid="budget-history-count" className="shrink-0 text-small leading-5 font-semibold text-text-muted">
          {counter}
        </p>
      </div>
      <ul data-scroll-x className="-mx-md flex gap-3 overflow-x-auto px-md">
        {budgets.map((budget) => {
          const shown = budget.id === shownId;
          return (
            <li key={budget.id} className="shrink-0">
              <button
                type="button"
                aria-current={shown ? 'true' : undefined}
                aria-disabled={disabled}
                data-testid="budget-history-item"
                data-budget-id={budget.id}
                onClick={() => !disabled && onShow(budget.id)}
                className={`flex h-11 items-center rounded-pill bg-surface px-md text-small leading-5 font-semibold whitespace-nowrap text-text ${shown ? 'border-2 border-primary' : 'border border-border'} ${disabled ? 'cursor-not-allowed' : ''}`}
              >
                {itemLabel(budget.number)}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
