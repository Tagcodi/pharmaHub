import type { ReactNode } from "react";
import { SurfaceCard } from "./SurfaceCard";

type EmptyStateCardProps = {
  icon?: ReactNode;
  title: string;
  description: string;
  compact?: boolean;
  className?: string;
};

export function EmptyStateCard({
  icon,
  title,
  description,
  compact = false,
  className,
}: EmptyStateCardProps) {
  return (
    <SurfaceCard
      className={`flex flex-col items-center gap-3 text-center ${compact ? "px-5 py-8" : "px-6 py-16"} ${className ?? ""}`.trim()}
    >
      {icon ? (
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: "rgba(0,66,83,0.06)" }}
        >
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-semibold text-on-surface">{title}</p>
      <p className="max-w-[320px] text-xs leading-relaxed text-on-surface-variant">
        {description}
      </p>
    </SurfaceCard>
  );
}
