export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="eyebrow">{label}</span>
      <span>{value}</span>
    </div>
  );
}
