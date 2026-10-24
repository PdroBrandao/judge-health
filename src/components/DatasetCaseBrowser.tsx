"use client";

import { useMemo, useState } from "react";
import type { DatasetCase } from "@/data/datasets";
import type { Label, SampleType } from "@/core/types";

type LabelFilter = "all" | Label;
type SampleFilter = "all" | SampleType;

export function DatasetCaseBrowser({ cases }: { cases: DatasetCase[] }) {
  const [labelFilter, setLabelFilter] = useState<LabelFilter>("all");
  const [sampleFilter, setSampleFilter] = useState<SampleFilter>("all");

  const visible = useMemo(
    () => cases.filter((item) => {
      if (labelFilter !== "all" && item.groundTruth !== labelFilter) return false;
      if (sampleFilter !== "all" && item.sampleType !== sampleFilter) return false;
      return true;
    }),
    [cases, labelFilter, sampleFilter],
  );

  return (
    <div>
      <div className="flex flex-wrap gap-2 px-3 py-2 border-b border-jh-border-lt bg-jh-bg/40">
        <FilterGroup
          label="Label"
          value={labelFilter}
          options={[
            ["all", "All labels"],
            ["PASS", "PASS"],
            ["FAIL", "FAIL"],
          ]}
          onChange={setLabelFilter}
        />
        <FilterGroup
          label="Sample"
          value={sampleFilter}
          options={[
            ["all", "All samples"],
            ["representative", "Representative"],
            ["targeted_risk", "Targeted/risk"],
          ]}
          onChange={setSampleFilter}
        />
        <span className="ml-auto self-center font-mono text-[10px] text-jh-dim">
          Showing {visible.length}/{cases.length}
        </span>
      </div>

      <div className="divide-y divide-jh-border-lt">
        {visible.map((item) => {
          const targeted = item.sampleType === "targeted_risk";
          return (
            <article
              key={item.id}
              className={`px-3 py-3 ${targeted ? "bg-amber-50/40" : "bg-jh-panel"}`}
            >
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="font-mono text-[11px] text-jh-text">{item.id}</span>
                <span className={`font-mono text-[10px] font-semibold px-1.5 py-0.5 border ${
                  item.groundTruth === "FAIL"
                    ? "border-jh-red/50 text-jh-red"
                    : "border-jh-green/50 text-jh-green"
                }`}>
                  {item.groundTruth}
                </span>
                <span className={`font-mono text-[10px] px-1.5 py-0.5 border ${
                  targeted
                    ? "border-jh-amber/60 text-jh-amber"
                    : "border-jh-border-lt text-jh-dim"
                }`}>
                  {targeted ? "Targeted/risk" : "Representative"}
                </span>
              </div>
              {item.hasContent ? (
                <div className="grid gap-2 md:grid-cols-2">
                  <CaseText label="Input" text={item.input} />
                  <CaseText label="Agent output" text={item.systemOutput} />
                </div>
              ) : (
                <p className="font-mono text-[10px] text-jh-dim">
                  No stored input or agent output for this case. The ground-truth label above is the reference used by Run #0001.
                </p>
              )}
            </article>
          );
        })}
        {visible.length === 0 && (
          <p className="px-3 py-6 font-mono text-[11px] text-jh-dim">
            No cases match these filters.
          </p>
        )}
      </div>
    </div>
  );
}

function CaseText({ label, text }: { label: string; text: string }) {
  return (
    <div className="border border-jh-border-lt bg-jh-bg/50 px-2 py-2">
      <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-jh-dim mb-1">{label}</div>
      <p className="text-[12px] leading-relaxed text-jh-text whitespace-pre-wrap">{text}</p>
    </div>
  );
}

function FilterGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<[T, string]>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-jh-dim mr-1">{label}</span>
      {options.map(([id, text]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`font-mono text-[10px] border px-2 py-1 ${
            value === id
              ? "border-jh-text text-jh-text bg-jh-bg"
              : "border-jh-border-lt text-jh-dim hover:border-jh-border"
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
