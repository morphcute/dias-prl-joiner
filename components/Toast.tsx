"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

let globalAddToast: ((message: string, type: ToastType) => void) | null = null;

export function toast(message: string, type: ToastType = "info") {
  globalAddToast?.(message, type);
}

export function ToastProvider() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  useEffect(() => {
    globalAddToast = addToast;
    return () => {
      globalAddToast = null;
    };
  }, [addToast]);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const getIcon = (type: ToastType) => {
    switch (type) {
      case "success":
        return <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />;
      case "error":
        return <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />;
      default:
        return <Info className="w-5 h-5 text-rust shrink-0" />;
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[100] space-y-3 max-w-sm pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="card-retro pointer-events-auto p-4 flex items-center justify-between gap-3 animate-slide-up shadow-retro border-2 border-ink bg-white"
        >
          <div className="flex items-center gap-3">
            {getIcon(t.type)}
            <span className="text-xs font-bold text-ink leading-snug">{t.message}</span>
          </div>
          <button
            onClick={() => removeToast(t.id)}
            className="p-1 rounded hover:bg-cream-100 text-ink/50 hover:text-ink transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
