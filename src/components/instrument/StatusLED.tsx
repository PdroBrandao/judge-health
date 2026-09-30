// ============================================================
// StatusLED — physical status indicator
// Semantics: green=ok, amber=attention, red=error/degraded
// ============================================================

export type LEDStatus = "ok" | "warning" | "error" | "inactive";

const LED_CLASSES: Record<LEDStatus, string> = {
  ok:       "bg-jh-led-green shadow-[0_0_6px_var(--jh-led-green)]",
  warning:  "bg-jh-led-amber shadow-[0_0_6px_var(--jh-led-amber)]",
  error:    "bg-jh-led-red   shadow-[0_0_6px_var(--jh-led-red)]",
  inactive: "bg-jh-border-mid",
};

interface Props {
  status: LEDStatus;
  label?: string;
  size?: "sm" | "md" | "lg";
  /** Pulse the LED — use for active alerts that require attention */
  pulse?: boolean;
}

const SIZE_CLASSES = {
  sm: "w-2 h-2",
  md: "w-3 h-3",
  lg: "w-3.5 h-3.5",
};

export function StatusLED({ status, label, size = "md", pulse = false }: Props) {
  const sizeClass  = SIZE_CLASSES[size];
  const pulseClass = pulse && status === "error" ? "jh-led-pulse" : "";

  return (
    <div
      className="flex items-center gap-2"
      role="status"
      aria-label={label ?? status}
    >
      <div
        className={`${sizeClass} rounded-full flex-shrink-0 ${LED_CLASSES[status]} ${pulseClass}`}
      />
      {label && (
        <span className="text-[10px] font-mono uppercase tracking-wide text-jh-dim">
          {label}
        </span>
      )}
    </div>
  );
}
