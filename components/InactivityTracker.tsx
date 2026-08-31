"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { AlertCircle, RefreshCw } from "lucide-react";

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_TIMEOUT_MS = 28 * 60 * 1000; // 28 minutes (2 min warning)
const STORAGE_KEY = "dias_prl_last_activity_ts";

export function InactivityTracker() {
  const pathname = usePathname();
  const [showWarning, setShowWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(120);
  const lastActivityRef = useRef<number>(Date.now());
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Do not track inactivity on public non-authenticated pages
  const isPublicPage =
    pathname === "/" ||
    pathname === "/terms" ||
    pathname === "/privacy" ||
    pathname?.startsWith("/api/auth");

  const recordActivity = () => {
    const now = Date.now();
    lastActivityRef.current = now;
    try {
      localStorage.setItem(STORAGE_KEY, String(now));
    } catch {
      // Ignore localStorage errors in private browsing
    }
    if (showWarning) {
      setShowWarning(false);
    }
  };

  const handleSignOut = async () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    await signOut({ callbackUrl: "/?reason=inactivity" });
  };

  useEffect(() => {
    if (isPublicPage) {
      setShowWarning(false);
      return;
    }

    // Initialize last activity timestamp
    const now = Date.now();
    lastActivityRef.current = now;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && now - parsed < INACTIVITY_TIMEOUT_MS) {
          lastActivityRef.current = parsed;
        } else if (!isNaN(parsed) && now - parsed >= INACTIVITY_TIMEOUT_MS) {
          // Already expired
          handleSignOut();
          return;
        }
      }
      localStorage.setItem(STORAGE_KEY, String(now));
    } catch {}

    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    let throttleTimer: NodeJS.Timeout | null = null;

    const onUserAction = () => {
      if (!throttleTimer) {
        throttleTimer = setTimeout(() => {
          recordActivity();
          throttleTimer = null;
        }, 1000); // Throttled to at most once per second
      }
    };

    events.forEach((evt) => {
      window.addEventListener(evt, onUserAction, { passive: true });
    });

    // Check interval every 2 seconds
    const interval = setInterval(() => {
      let latestActivity = lastActivityRef.current;
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = parseInt(stored, 10);
          if (!isNaN(parsed) && parsed > latestActivity) {
            latestActivity = parsed;
            lastActivityRef.current = parsed;
          }
        }
      } catch {}

      const elapsed = Date.now() - latestActivity;

      if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        handleSignOut();
      } else if (elapsed >= WARNING_TIMEOUT_MS) {
        const remaining = Math.max(0, Math.ceil((INACTIVITY_TIMEOUT_MS - elapsed) / 1000));
        setSecondsRemaining(remaining);
        setShowWarning(true);
      } else {
        if (showWarning) {
          setShowWarning(false);
        }
      }
    }, 2000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        let latestActivity = lastActivityRef.current;
        try {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored) {
            const parsed = parseInt(stored, 10);
            if (!isNaN(parsed)) {
              latestActivity = parsed;
            }
          }
        } catch {}

        if (Date.now() - latestActivity >= INACTIVITY_TIMEOUT_MS) {
          handleSignOut();
        }
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onVisibilityChange);

    return () => {
      events.forEach((evt) => {
        window.removeEventListener(evt, onUserAction);
      });
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onVisibilityChange);
      clearInterval(interval);
      if (throttleTimer) clearTimeout(throttleTimer);
    };
  }, [isPublicPage, pathname]);

  if (isPublicPage || !showWarning) {
    return null;
  }

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const formattedTime = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;

  return (
    <div className="fixed bottom-6 right-6 z-[99999] max-w-md animate-in slide-in-from-bottom-5 fade-in duration-300">
      <div className="p-4 rounded-2xl bg-slate-900/95 border border-amber-500/40 backdrop-blur-xl shadow-2xl shadow-amber-500/10 text-slate-100 flex items-start gap-3">
        <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
          <AlertCircle className="w-5 h-5" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between">
            <h4 className="font-extrabold text-sm text-white">Inactivity Warning</h4>
            <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              {formattedTime}
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            You will be logged out in <strong className="text-amber-300">{formattedTime}</strong> due to 30 minutes of inactivity to keep your Google Sheet permissions secure.
          </p>
          <div className="pt-2 flex items-center gap-2">
            <button
              onClick={recordActivity}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-md shadow-indigo-600/20"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Stay Signed In
            </button>
            <button
              onClick={handleSignOut}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
            >
              Log Out Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
