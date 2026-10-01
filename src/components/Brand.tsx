import { Link } from "react-router-dom";

interface BrandProps {
  to?: string;
  compact?: boolean;
}

export default function Brand({ to = "/", compact = false }: BrandProps) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-11 shrink-0 items-center gap-2.5 rounded-lg"
      aria-label="TengeFlow home"
    >
      <span
        className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-brand-600 text-[26px] font-medium leading-none text-white"
        aria-hidden="true"
      >
        ₸
      </span>
      {!compact && (
        <span className="text-[23px] font-bold tracking-[-0.06em] text-slate-900">
          tenge<span className="text-brand-600">flow.</span>
        </span>
      )}
    </Link>
  );
}
