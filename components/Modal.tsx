"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  type?: "default" | "danger";
  maxWidth?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export default function Modal({ isOpen, onClose, title, type = "default", maxWidth = "max-w-md", children, footer }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  }, [onClose]);

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm animate-fade-in px-4"
    >
      <div className={`bg-slate-800 rounded-2xl w-full ${maxWidth} p-6 space-y-4 animate-slide-up shadow-2xl shadow-indigo-500/5`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            type === "danger" ? "bg-red-500/10 text-red-400" : "bg-indigo-500/10 text-indigo-400"
          }`}>
            {type === "danger" ? (
              <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>
          <h3 className="text-lg font-bold text-slate-50 tracking-tight">{title}</h3>
        </div>
        <div>{children}</div>
        {footer && <div className="pt-2">{footer}</div>}
      </div>
    </div>
  );
}
