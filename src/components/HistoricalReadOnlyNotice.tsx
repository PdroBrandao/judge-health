// Short indication that Run #0001 cannot be modified.
export function HistoricalReadOnlyNotice() {
  return (
    <div className="font-mono text-[10px] border border-jh-border-lt bg-jh-panel px-3 py-2 text-jh-dim">
      <span className="font-semibold text-jh-text">Read-only. </span>
      Run #0001 is archived. Results and evidence stay available. New runs, decisions, and reset are disabled.
    </div>
  );
}
