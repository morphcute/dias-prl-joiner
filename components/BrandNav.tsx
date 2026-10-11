"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Settings, ShieldCheck, Zap, X, FileSpreadsheet } from "lucide-react";

/**
 * Visual Brand Logo for Dias & PRL Auto Joiner
 * Using the retro high-contrast typography and shadow aesthetic
 */
export function BrandLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const isLg = size === "lg";
  const isSm = size === "sm";

  return (
    <div className="flex flex-col items-center justify-center select-none group">
      <div className="flex items-center gap-1.5 font-black text-ink">
        <span
          className={`font-serif-title tracking-tight font-black ${
            isLg ? "text-3xl sm:text-4xl" : isSm ? "text-lg" : "text-2xl sm:text-3xl"
          }`}
        >
          DIAS & PRL
        </span>
        <span className="text-rust font-serif-title text-2xl sm:text-3xl font-black">.</span>
      </div>
      <span
        className={`font-black text-ink/70 uppercase tracking-[0.28em] ${
          isLg ? "text-xs mt-1" : isSm ? "text-[8px] tracking-[0.2em]" : "text-[10px] mt-0.5"
        }`}
      >
        AUTO JOINER
      </span>
    </div>
  );
}

/**
 * Top-right Settings Button (organic pill card with gear icon from reference UI)
 */
export function SettingsPillButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="btn-settings-pill cursor-pointer"
        title="Settings & System Status"
        aria-label="Settings"
      >
        <Settings className="w-5 h-5 text-ink transition-transform duration-300 hover:rotate-90" />
      </button>

      {/* Settings Modal in retro card style */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="card-retro max-w-md w-full p-6 space-y-5 animate-slide-up relative bg-white">
            <div className="flex items-center justify-between border-b-2 border-dashed border-ink/20 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-ink flex items-center justify-center text-white shadow-retro-sm">
                  <Settings className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-serif-title text-xl font-black text-ink">System Preferences</h3>
                  <p className="text-[10px] uppercase font-bold tracking-wider text-rust">
                    Dias & PRL Engine
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg border-2 border-ink hover:bg-cream-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4 text-ink" />
              </button>
            </div>

            <div className="space-y-4 text-xs text-ink/80 leading-relaxed font-medium">
              <div className="p-3.5 rounded-xl border-2 border-dashed border-ink/30 bg-cream-50 space-y-1.5">
                <div className="flex items-center gap-2 font-black text-ink text-sm">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <span>Google Sheets API Quota Protection</span>
                </div>
                <p className="text-[11px] text-ink/70">
                  Active request pacer (max ~50 reads/min) and exponential cooldown backoff are enabled to prevent Quota Exceeded errors on large CH runs.
                </p>
              </div>

              <div className="p-3.5 rounded-xl border-2 border-dashed border-ink/30 bg-cream-50 space-y-1.5">
                <div className="flex items-center gap-2 font-black text-ink text-sm">
                  <Zap className="w-4 h-4 text-rust" />
                  <span>MooGold Verification Engine</span>
                </div>
                <p className="text-[11px] text-ink/70">
                  Parallel account validation verifies MLBB Game UIDs and Server numbers directly before writing to output sheets.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-between border-t-2 border-dashed border-ink/20 text-[11px] font-bold">
                <Link href="/terms" className="hover:text-rust underline underline-offset-2">
                  Terms of Service
                </Link>
                <Link href="/privacy" className="hover:text-rust underline underline-offset-2">
                  Privacy Policy
                </Link>
                <span className="font-mono text-ink/50">v2.4 Auto Joiner</span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setIsOpen(false)}
                className="btn-retro-dark !py-2 !px-4 text-xs"
              >
                Close Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Clean Footer with dashed divider
 */
export function AppFooter() {
  return (
    <footer className="w-full py-10 mt-16 text-center select-none">
      <div className="max-w-4xl mx-auto border-t-2 border-dashed border-ink/25 mb-8" />

      <div className="flex flex-col items-center justify-center space-y-2">
        <h4 className="font-serif-title text-xl md:text-2xl font-black text-ink tracking-wide">
          DIAS & PRL AUTO JOINER
        </h4>
        <span className="text-[11px] font-black uppercase tracking-[0.25em] text-rust">
          COMMUNITY HERO PLATFORM
        </span>
        <div className="flex items-center gap-4 text-xs font-semibold text-ink/60 pt-3">
          <Link href="/terms" className="hover:text-rust transition-colors">
            Terms of Service
          </Link>
          <span>•</span>
          <Link href="/privacy" className="hover:text-rust transition-colors">
            Privacy Policy
          </Link>
          <span>•</span>
          <span>&copy; {new Date().getFullYear()} Dias & PRL Auto Joiner</span>
        </div>
      </div>
    </footer>
  );
}
