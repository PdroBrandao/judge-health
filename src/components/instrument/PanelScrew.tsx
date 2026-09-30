// ============================================================
// PanelScrew — mounting screw head
//
// Renders a single Phillips cross-slot screw head.
// Use only on panels that are conceptually "mounted" to the
// instrument chassis. Four per major panel is sufficient.
//
// Uses the .jh-screw CSS class defined in globals.css,
// which draws the cross-slot via ::before / ::after.
// ============================================================

type ScrewPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

const POSITION_CLASSES: Record<ScrewPosition, string> = {
  "top-left":     "top-[5px] left-[5px]",
  "top-right":    "top-[5px] right-[5px]",
  "bottom-left":  "bottom-[5px] left-[5px]",
  "bottom-right": "bottom-[5px] right-[5px]",
};

interface Props {
  position: ScrewPosition;
}

export function PanelScrew({ position }: Props) {
  return (
    <div
      aria-hidden="true"
      className={`jh-screw absolute ${POSITION_CLASSES[position]}`}
    />
  );
}

// Convenience: renders all four corner screws
export function PanelScrews() {
  return (
    <>
      <PanelScrew position="top-left" />
      <PanelScrew position="top-right" />
      <PanelScrew position="bottom-left" />
      <PanelScrew position="bottom-right" />
    </>
  );
}
