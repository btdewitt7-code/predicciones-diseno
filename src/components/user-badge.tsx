export function UserBadge({
  user,
  compact = false,
}: {
  user: { name: string | null; email: string; isAdmin: boolean };
  compact?: boolean;
}) {
  const label = user.name?.trim() || user.email;
  const initial = label.slice(0, 1).toUpperCase();

  return (
    <span
      title={user.email}
      className="flex shrink-0 items-center gap-2 text-xs text-mist-300"
    >
      <span
        style={{ width: 28, height: 28 }}
        className="grid shrink-0 place-items-center rounded-full bg-mint-500/20 text-[11px] font-semibold text-mint-300 ring-1 ring-mint-500/30"
      >
        {initial}
      </span>
      {compact ? null : <span className="max-w-24 truncate sm:max-w-40">{label}</span>}
    </span>
  );
}
