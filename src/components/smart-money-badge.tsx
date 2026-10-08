export function SmartMoneyBadge({ title }: { title?: string }) {
  return (
    <span
      title={title ?? 'Smart money: consistent, benchmark-beating long-horizon calls'}
      className="inline-flex items-center rounded border border-brass/40 bg-brass/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-brass"
    >
      Smart money
    </span>
  );
}
