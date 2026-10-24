"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { HistoricalReadOnlyNotice } from "@/components/HistoricalReadOnlyNotice";

export function HistoricalNoticeController({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const path = usePathname();
  const onDataset = path.startsWith("/datasets");
  const onExperimentAdmin = path.startsWith("/experiments");
  const show = enabled && !onDataset && !onExperimentAdmin;

  return (
    <>
      {show && (
        <div className="px-3 lg:px-4 pt-3 max-w-[1100px] mx-auto">
          <HistoricalReadOnlyNotice />
        </div>
      )}
      {children}
    </>
  );
}
