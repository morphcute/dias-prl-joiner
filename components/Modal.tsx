"use client";

import { useCallback, useEffect, useRef } from "react";
import { AlertTriangle, Info, X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  type?: "default" | "danger";
  maxWidth?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  type = "default",
  maxWidth = "max-w-md",
  children,
  footer,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose]
  );

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 backdrop-blur-xs animate-fade-in px-4"
    >
      <div
        className={`card-retro w-full ${maxWidth} p-6 sm:p-7 space-y-5 animate-slide-up bg-white relative max-h-[90vh] overflow-y-auto`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-dashed border-ink/20 pb-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center border-2 border-ink text-white font-bold shadow-retro-sm ${
                type === "danger" ? "bg-red-600" : "bg-ink"
              }`}
            >
              {type === "danger" ? (
                <AlertTriangle className="w-5 h-5 text-white" />
              ) : (
                <Info className="w-5 h-5 text-white" />
              )}
            </div>
            <div>
              <h3 className="font-serif-title text-xl font-black text-ink tracking-tight">{title}</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border-2 border-ink hover:bg-cream-100 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4 text-ink" />
          </button>
        </div>

        {/* Content Body */}
        <div className="text-ink">{children}</div>

        {/* Footer */}
        {footer && <div className="pt-3 border-t-2 border-dashed border-ink/20">{footer}</div>}
      </div>
    </div>
  );
}
