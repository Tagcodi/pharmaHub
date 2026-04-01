import type { CSSProperties, ReactNode } from "react";

type SurfaceCardProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function SurfaceCard({
  children,
  className,
  style,
}: SurfaceCardProps) {
  return (
    <div
      className={`rounded-lg bg-surface-lowest ${className ?? ""}`.trim()}
      style={{
        boxShadow: "0 4px 16px rgba(0,66,83,0.06)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
