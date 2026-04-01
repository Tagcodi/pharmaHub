type StatusBadgeProps = {
  label: string;
  tone: "success" | "warning" | "danger" | "neutral" | "info";
  className?: string;
};

const TONE_CLASSES = {
  success: "bg-secondary-container text-on-secondary-container",
  warning: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
  danger: "bg-error-container text-on-error-container",
  neutral: "bg-surface-low text-on-surface-variant",
  info: "bg-primary/[0.08] text-primary",
} as const;

export function StatusBadge({
  label,
  tone,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.65rem] font-bold tracking-wide ${TONE_CLASSES[tone]} ${className ?? ""}`.trim()}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
