import type { ReactNode } from "react";
import { SurfaceCard } from "./SurfaceCard";

type KpiCardProps = {
  label: string;
  value: string;
  note: ReactNode;
  icon?: ReactNode;
  valueColor?: string;
  valueSize?: string;
  className?: string;
};

export function KpiCard({
  label,
  value,
  note,
  icon,
  valueColor,
  valueSize = "2.3rem",
  className,
}: KpiCardProps) {
  return (
    <SurfaceCard className={`p-5 ${className ?? ""}`.trim()}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-2 text-[0.65rem] font-bold uppercase tracking-[0.08em] text-outline">
            {label}
          </p>
          <p
            className="font-bold leading-none tracking-[-0.04em]"
            style={{
              color: valueColor ?? "#191c1e",
              fontSize: valueSize,
            }}
          >
            {value}
          </p>
          <div className="mt-3 text-xs text-on-surface-variant">{note}</div>
        </div>
        {icon ? <div className="shrink-0">{icon}</div> : null}
      </div>
    </SurfaceCard>
  );
}
