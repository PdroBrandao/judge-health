// ============================================================
// InstrumentPanel — core container primitive
//
// Mounted instrument plate aesthetic:
//   - Phillips cross-slot screws at corners (PanelScrew)
//   - Inset border depth (.jh-panel-deep)
//   - Optional accent left-border for status state
// ============================================================
import type { ReactNode, CSSProperties } from "react";
import { PanelScrews } from "@/components/instrument/PanelScrew";

type AccentColor = "error" | "warn" | "ok";

interface Props {
  label: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  noPadding?: boolean;
  /** Draws a 3px left-border accent when status requires attention */
  accent?: AccentColor;
}

const ACCENT_BORDER: Record<AccentColor, string> = {
  error: "border-l-[3px] border-l-jh-red",
  warn:  "border-l-[3px] border-l-jh-amber",
  ok:    "border-l-[3px] border-l-jh-green",
};

export function InstrumentPanel({
  label,
  children,
  className = "",
  style,
  noPadding = false,
  accent,
}: Props) {
  const accentClass = accent ? ACCENT_BORDER[accent] : "";

  return (
    <div
      className={`relative bg-jh-panel jh-panel-deep overflow-hidden ${accentClass} ${className}`}
      style={style}
    >
      <PanelScrews />

      {/* Panel label strip */}
      <div className="border-b border-jh-border px-3 py-[5px] flex items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-jh-dim select-none">
          {label}
        </span>
      </div>

      {/* Content */}
      <div className={noPadding ? "" : "p-3"}>
        {children}
      </div>
    </div>
  );
}
