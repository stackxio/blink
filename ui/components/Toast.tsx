import { useEffect, useState } from "react";
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { useAppStore } from "@/store";

function ToastIcon({ type }: { type: string }) {
  if (type === "success") return <CheckCircle size={14} />;
  if (type === "error") return <AlertCircle size={14} />;
  if (type === "warning") return <AlertTriangle size={14} />;
  return <Info size={14} />;
}

function ToastItem({ id, message, type, duration }: {
  id: string;
  message: string;
  type: string;
  duration: number;
}) {
  const removeToast = useAppStore((s) => s.removeToast);
  const [visible, setVisible] = useState(false);

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Animate out before removal
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), duration - 300);
    return () => clearTimeout(t);
  }, [duration]);

  return (
    <div className={`toast toast--${type}${visible ? " toast--visible" : ""}`}>
      <span className="toast__icon">
        <ToastIcon type={type} />
      </span>
      <span className="toast__message">{message}</span>
      <button
        type="button"
        className="toast__close"
        onClick={() => removeToast(id)}
        title="Dismiss"
      >
        <X size={12} />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const toasts = useAppStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <ToastItem key={t.id} {...t} />
      ))}
    </div>
  );
}
