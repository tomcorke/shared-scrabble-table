export function MessageToast({
  error,
  notice,
  onDismiss,
}: {
  error: string;
  notice: string;
  onDismiss(): void;
}) {
  if (!error && !notice) return null;
  return (
    <div
      className={`toast ${error ? "toast-error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {error || notice}
      <button type="button" aria-label="Dismiss message" onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}
