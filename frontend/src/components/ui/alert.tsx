import { AlertTriangle, X } from "lucide-react";
import { useEffect, useState } from "react";

export function ErrorAlert({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    if (!onDismiss) {
      const t = setTimeout(() => setVisible(false), 5000);
      return () => clearTimeout(t);
    }
  }, [message, onDismiss]);

  if (!visible || !message) return null;

  const detail = message.includes(":")
    ? message.substring(message.indexOf(":") + 1).trim()
    : message;

  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="flex-1">{detail}</span>
      {onDismiss && (
        <button onClick={() => { setVisible(false); onDismiss(); }} className="shrink-0">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}