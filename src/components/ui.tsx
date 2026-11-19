import Link from "next/link";
import { LEAGUE_BY_CODE } from "@/lib/leagues";

export function TeamBadge({
  name,
  size = 34,
  logo,
  plain = false,
  className,
}: {
  name: string;
  size?: number;
  logo?: string | null;
  plain?: boolean;
  className?: string;
}) {
  if (logo) {
    return (
      <span
        className={
          (plain
            ? "grid shrink-0 place-items-center"
            : "grid shrink-0 place-items-center overflow-hidden rounded-full bg-[#f9f8f6] ring-1 ring-[#e4dfd6]") +
          (className ? ` ${className}` : "")
        }
        style={className ? undefined : { width: size, height: size }}
      >
        <img
          src={logo}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className={plain ? "h-full w-full object-contain" : "h-[78%] w-[78%] object-contain"}
        />
      </span>
    );
  }
  const words = name.split(/\s+/).filter(Boolean);
  const initials =
    words.length === 1
      ? words[0].slice(0, 3).toUpperCase()
      : words
          .slice(0, 2)
          .map((word) => word[0]?.toUpperCase() ?? "")
          .join("");

  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360;
  const hue = hash;

  return (
    <span
      className={
        "grid shrink-0 place-items-center rounded-full font-semibold text-[#f9f8f6] ring-1 ring-[#e4dfd6]" +
        (className ? ` ${className}` : "")
      }
      style={{
        width: className ? undefined : size,
        height: className ? undefined : size,
        fontSize: size * 0.34,
        background: `linear-gradient(145deg, hsl(${hue} 45% 32%), hsl(${(hue + 40) % 360} 45% 18%))`,
      }}
    >
      {initials}
    </span>
  );
}

export function LeagueTag({
  code,
  logo,
  size = "sm",
}: {
  code: string;
  logo?: string | null;
  size?: "sm" | "md";
}) {
  const league = LEAGUE_BY_CODE[code];
  const textClass = size === "md" ? "text-ui-body-lg" : "text-ui-body";
  const iconClass = size === "md" ? "size-5 sm:size-[22px]" : "size-5";
  const lightBadge = ["UEL", "UECL", "UEN"].includes(code);
  const invertLogo = code === "UCL";
  if (!league) return <span className={`${textClass} text-mist-500`}>{code}</span>;
  return (
    <span className={`inline-flex items-center gap-2 ${textClass} text-mist-400`}>
      {logo ? (
        <img
          src={logo}
          alt=""
          width={20}
          height={20}
          loading="lazy"
          decoding="async"
          className={`${iconClass} shrink-0 object-contain ${
            lightBadge ? "league-logo-badge" : ""
          } ${invertLogo ? "league-logo-invert" : ""}`}
        />
      ) : (
        <span className="rounded bg-ink-800 px-1 py-0.5 text-ui-micro font-semibold tracking-wide text-mist-400 ring-1 ring-ink-700">
          {league.tag}
        </span>
      )}
      <span className="text-mist-300">{league.name}</span>
      <span className="text-mist-500">·</span>
      <span>{league.country}</span>
    </span>
  );
}

export function ProbBar({
  home,
  draw,
  away,
}: {
  home: number;
  draw: number;
  away: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex h-2 overflow-hidden rounded-full bg-ink-800">
        <div className="bg-win-400" style={{ width: `${home * 100}%` }} />
        <div className="bg-[#b4a89b]" style={{ width: `${draw * 100}%` }} />
        <div className="bg-win-400" style={{ width: `${away * 100}%` }} />
      </div>
      <div className="flex justify-between text-[11px] tabular-nums">
        <span className="text-win-400">{(home * 100).toFixed(0)}%</span>
        <span className="text-mist-500">{(draw * 100).toFixed(0)}%</span>
        <span className="text-win-400">{(away * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

export function Pill({
  label,
  value,
  tone = "neutral",
  valueTone,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn";
  valueTone?: string;
}) {
  const tones = {
    neutral: "border-ink-700 bg-ink-850 text-mist-300",
    good: "border-win-500/30 bg-win-500/10 text-win-400",
    warn: "border-amber-400/30 bg-amber-400/10 text-amber-400",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${tones[tone]}`}>
      <span className="text-mist-500">{label}</span>
      <span className={`font-semibold tabular-nums ${valueTone ?? ""}`}>{value}</span>
    </span>
  );
}

export function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-ui-section font-semibold text-white">{title}</h2>
        {subtitle ? <p className="text-xs text-mist-500">{subtitle}</p> : null}
      </div>
      {action ? (
        <Link href={action.href} className="text-xs text-mint-400 hover:underline">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

export function ResultChip({ result }: { result: "W" | "D" | "L" }) {
  const styles = {
    W: "bg-win-500/15 text-win-400 ring-win-500/30",
    D: "bg-ink-700 text-mist-300 ring-ink-600",
    L: "bg-rose-400/10 text-rose-400 ring-rose-400/30",
  };
  return (
    <span
      className={`grid size-6 place-items-center rounded-md text-[11px] font-bold ring-1 ${styles[result]}`}
    >
      {result}
    </span>
  );
}
