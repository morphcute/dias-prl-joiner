"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import Modal from "./Modal";
import { toast, ToastProvider } from "./Toast";
import { Background3D } from "./Background3D";
import { BrandLogo, SettingsPillButton, AppFooter } from "./BrandNav";
import {
  Sparkles,
  Plus,
  Play,
  Square,
  RefreshCw,
  Search,
  LogOut,
  ExternalLink,
  Edit3,
  Trash2,
  Activity,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Terminal,
  ShieldCheck,
  Zap,
  Grid,
  List,
  Copy,
  Download,
  AlertCircle,
  FileText,
  Clock,
  ArrowRight,
} from "lucide-react";

interface ChError {
  chName: string;
  error: string;
  type?: string;
}

interface JoinerRun {
  id: string;
  status: string;
  progress: number;
  progressMessage: string | null;
  rowsWritten: number;
  errors: string | ChError[];
  startedAt: string;
  completedAt: string | null;
  chStats?: string | { chName: string; count: number }[];
}

interface JoinerJob {
  id: string;
  name: string;
  type: string;
  gameMode?: string | null;
  spreadsheetId: string;
  reportingSheetGid: string | null;
  secondarySpreadsheetId?: string | null;
  secondaryReportingSheetGid?: string | null;
  targetSpreadsheetId: string | null;
  targetSpreadsheetName: string | null;
  sheetName: string;
  validationEnabled: boolean;
  isEnabled: boolean;
  lastRunAt: string | null;
  runs: JoinerRun[];
}

type ProgressData = {
  status: string;
  progress: number;
  progressMessage: string | null;
  errors?: ChError[];
  rowsWritten?: number;
};

/**
 * Helper to parse step ratio (e.g., "2/62", "15/60") from live progress strings
 */
function parseProgressRatio(message?: string | null): {
  current: number;
  total: number;
  ratioStr: string;
} | null {
  if (!message) return null;
  const match = message.match(/(\d+)\s*\/\s*(\d+)/);
  if (match) {
    return {
      current: parseInt(match[1], 10),
      total: parseInt(match[2], 10),
      ratioStr: `${match[1]}/${match[2]}`,
    };
  }
  return null;
}

export default function Dashboard() {
  const [jobs, setJobs] = useState<JoinerJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [runProgress, setRunProgress] = useState<Map<string, ProgressData>>(new Map());
  const pollersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "diamonds" | "prl">("all");
  const [viewLayout, setViewLayout] = useState<"grid" | "table">("grid");

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [errorsModalOpen, setErrorsModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JoinerJob | null>(null);
  const [viewErrors, setViewErrors] = useState<ChError[]>([]);
  const [viewStats, setViewStats] = useState<{ chName: string; count: number }[]>([]);
  const [activeLogTab, setActiveLogTab] = useState<"overview" | "chHealth" | "duplicates" | "logs">("overview");
  const [modalSearch, setModalSearch] = useState("");
  const [startingJobs, setStartingJobs] = useState<Set<string>>(new Set());
  const [stoppingJobs, setStoppingJobs] = useState<Set<string>>(new Set());

  const getDisplayStatus = (job: JoinerJob): string | undefined => {
    const live = runProgress.get(job.id);
    if (live) return live.status;
    const latestStatus = job.runs?.[0]?.status;
    if (latestStatus === "running") return "running";
    if (!job.lastRunAt) return undefined;
    return latestStatus;
  };

  const formatTimeAgo = (date: string | Date | null) => {
    if (!date) return "Never";
    const now = new Date();
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return "Never";
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  };

  const pollJobStatus = useCallback((jobId: string) => {
    if (pollersRef.current.has(jobId)) return;

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/progress?t=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        if (!res.ok) return;
        const data: ProgressData = await res.json();

        setRunProgress((prev) => {
          const next = new Map(prev);
          next.set(jobId, data);
          return next;
        });

        if (data.status !== "running") {
          setStartingJobs((prev) => {
            const next = new Set(prev);
            next.delete(jobId);
            return next;
          });
          const poller = pollersRef.current.get(jobId);
          if (poller) clearInterval(poller);
          pollersRef.current.delete(jobId);
          fetchJobs();
        }
      } catch (e) {
        console.error(e);
      }
    };

    // Immediate first check so there is no delay
    checkStatus();
    const interval = setInterval(checkStatus, 1000);
    pollersRef.current.set(jobId, interval);
  }, []);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs?t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (res.status === 401) return;
      if (!res.ok) throw new Error("Failed to load jobs");
      const data = await res.json();
      setJobs(data);

      data.forEach((job: JoinerJob) => {
        const status = job.runs?.[0]?.status;
        if (status === "running") {
          pollJobStatus(job.id);
        }
      });
    } catch (e) {
      console.error(e);
      toast("Failed to load sync jobs", "error");
    } finally {
      setLoading(false);
    }
  }, [pollJobStatus]);

  useEffect(() => {
    fetchJobs();
    return () => {
      pollersRef.current.forEach((interval) => clearInterval(interval));
      pollersRef.current.clear();
    };
  }, [fetchJobs]);

  const handleStartRun = async (job: JoinerJob) => {
    setStartingJobs((prev) => new Set(prev).add(job.id));

    // 1. Immediately reflect running state in the UI so progress bar mounts instantly
    setRunProgress((prev) => {
      const next = new Map(prev);
      next.set(job.id, {
        status: "running",
        progress: 2,
        progressMessage: "Initiating Google Cloud Sheets connection...",
      });
      return next;
    });

    // 2. Start polling immediately in the background so updates stream in real-time
    pollJobStatus(job.id);

    try {
      const res = await fetch(`/api/jobs/${job.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to start sync");
      }

      const data = await res.json();
      toast(`Sync finished! ${data.rowsWritten || 0} rows written.`, "success");
      fetchJobs();
    } catch (e: any) {
      toast(e.message, "error");
      fetchJobs();
    } finally {
      setStartingJobs((prev) => {
        const next = new Set(prev);
        next.delete(job.id);
        return next;
      });
    }
  };

  const handleStopRun = async (job: JoinerJob) => {
    setStoppingJobs((prev) => new Set(prev).add(job.id));
    try {
      const res = await fetch(`/api/jobs/${job.id}/stop`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to stop sync");
      }

      const poller = pollersRef.current.get(job.id);
      if (poller) {
        clearInterval(poller);
        pollersRef.current.delete(job.id);
      }

      setRunProgress((prev) => {
        const next = new Map(prev);
        next.set(job.id, {
          status: "failed",
          progress: 0,
          progressMessage: "Operation cancelled by user.",
        });
        return next;
      });

      fetchJobs();
      toast(`Sync stopped for "${job.name}"`, "info");
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setStoppingJobs((prev) => {
        const next = new Set(prev);
        next.delete(job.id);
        return next;
      });
    }
  };

  const handleDeleteJob = async () => {
    if (!selectedJob) return;
    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete job");
      setJobs((prev) => prev.filter((j) => j.id !== selectedJob.id));
      setDeleteModalOpen(false);
      setSelectedJob(null);
      toast("Job deleted successfully", "success");
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  const openLogModal = (job: JoinerJob) => {
    setSelectedJob(job);
    const live = runProgress.get(job.id);
    const latestRun = job.runs?.[0];

    let errs: ChError[] = [];
    if (live?.errors) {
      errs = live.errors;
    } else if (latestRun?.errors) {
      if (typeof latestRun.errors === "string") {
        try {
          errs = JSON.parse(latestRun.errors);
        } catch {
          errs = [];
        }
      } else {
        errs = latestRun.errors as ChError[];
      }
    }

    let stats: { chName: string; count: number }[] = [];
    if (latestRun?.chStats) {
      if (typeof latestRun.chStats === "string") {
        try {
          stats = JSON.parse(latestRun.chStats);
        } catch {
          stats = [];
        }
      } else {
        stats = latestRun.chStats as { chName: string; count: number }[];
      }
    }

    setViewErrors(errs);
    setViewStats(stats);
    setActiveLogTab("overview");
    setModalSearch("");
    setErrorsModalOpen(true);
  };

  const getErrorType = (err: ChError) => {
    const errorStr = err.error || "";
    if (err.type === "validation_fixed" || errorStr.includes("automatically corrected") || errorStr.includes("Mixed Server/UID")) {
      return "validation_fixed";
    }
    if (err.type === "validation_error" || errorStr.startsWith("Validation Error")) {
      return "validation_error";
    }
    if (errorStr.includes("Duplicate")) {
      return "duplicate";
    }
    if (errorStr.includes("Dissolved Tournament")) {
      return "dissolved";
    }
    if (errorStr.includes("NO PRL LINK") || errorStr.includes("NO LINK") || errorStr.includes("Empty Tournament")) {
      return "rule_violation";
    }
    return "accessibility";
  };

  const parseDuplicateError = (err: ChError) => {
    const isFaked = err.error.includes("different servers entered");
    const nameMatch = err.error.match(/player "(.*?)"/i);
    const uidMatch = err.error.match(/UID (?:#)?(\d+)/i);
    const serverMatch = err.error.match(/(?:Server |server )(\d+)/i);
    const prevChMatch = err.error.match(/(?:submitted by|originally in) (.*?)(?:\)|,|\.|$)/i);
    const prevServerMatch = err.error.match(/Original Server: (\d+)/i);

    if (uidMatch) {
      return {
        name: nameMatch ? nameMatch[1].trim() : "Unknown Player",
        uid: uidMatch[1].trim(),
        server: serverMatch ? serverMatch[1].trim() : "N/A",
        prevServer: prevServerMatch ? prevServerMatch[1].trim() : null,
        prevCh: prevChMatch ? prevChMatch[1].trim() : "Unknown CH",
        currCh: err.chName.trim(),
        isFakedServer: isFaked,
      };
    }
    return null;
  };

  const parseDissolvedError = (errStr: string) => {
    const match =
      errStr.match(
        /only (\d+) valid players found.*?(?:Mode:\s*([^,]+))?,\s*(?:Target:\s*(\d+)(?:\s*players(?:\s*\[\d+\s*teams\])?)?)?,\s*(?:Minimum allowed:\s*(\d+))?(?:\.\s*\(Teams in responses sheet:\s*([^)]*)\))?/i
      ) ||
      errStr.match(
        /only (\d+) valid players.*Mode:\s*([^,]+),\s*Target:\s*(\d+).*?Minimum allowed:\s*(\d+)(?:\.\s*\(Teams in responses sheet:\s*([^)]*)\))?/i
      );
    if (match) {
      return {
        actual: match[1],
        mode: match[2] || "5v5",
        target: match[3] || "50",
        min: match[4] || "46",
        teams: match[5] || null,
      };
    }
    return null;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "N/A";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "N/A";
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    const month = months[d.getMonth()];
    const day = d.getDate();
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${month} ${day}, ${year} • ${hours}:${minutes} ${ampm}`;
  };

  const copyTextReport = () => {
    if (!selectedJob) return;
    const latestRun = selectedJob.runs?.[0];
    const totalRows = latestRun?.rowsWritten || 0;
    const totalPlayers = viewStats.reduce((sum, s) => sum + s.count, 0) || totalRows;
    const duplicates = viewErrors.filter((e) => getErrorType(e) === "duplicate");
    const dissolved = viewErrors.filter((e) => getErrorType(e) === "dissolved");
    const accessibility = viewErrors.filter((e) => ["accessibility", "rule_violation"].includes(getErrorType(e)));
    const autoFixes = viewErrors.filter((e) => getErrorType(e) === "validation_fixed");
    const validationErrors = viewErrors.filter((e) => getErrorType(e) === "validation_error");

    let report = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `📊 ${selectedJob.name.toUpperCase()}\n`;
    report += `OPERATION SUMMARY REPORT • DIAS & PRL\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    report += `🆔 Run ID     : ${latestRun?.id || "N/A"}\n`;
    report += `⚙️ Pipeline   : ${selectedJob.type === "diamonds" ? "Diamond Rewards" : "PRL Pipeline"}\n`;
    report += `📅 Date       : ${formatDate(latestRun?.startedAt || (latestRun as any)?.createdAt)}\n`;
    report += `✅ Status     : ${(latestRun?.status || "SUCCESS").toUpperCase()}\n`;
    report += `📝 Rows Saved : ${Number(totalRows).toLocaleString()}\n\n`;

    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `📈 OVERALL METRICS\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    report += `👥 Compiled CHs               : ${viewStats.length}\n`;
    report += `🏆 Active Players/Winners     : ${totalPlayers}\n`;
    report += `❌ Dissolved Tournaments       : ${dissolved.length}\n`;
    if (accessibility.length > 0) {
      report += `🔓 Accessibility Faults       : ${accessibility.length}\n`;
    }
    report += `🔁 Duplicate Entries          : ${duplicates.length}\n`;
    report += `🔧 Auto Fixes Applied         : ${autoFixes.length}\n`;
    report += `⚠️ Validation Errors          : ${validationErrors.length}\n\n`;

    if (dissolved.length > 0) {
      report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      report += `🚨 DISSOLVED TOURNAMENTS (${dissolved.length})\n`;
      report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      dissolved.forEach((d) => {
        report += `❌ ${d.chName.toUpperCase()}\n`;
        const parsed = parseDissolvedError(d.error);
        if (parsed) {
          report += `   └─ Only ${parsed.actual} valid players found\n`;
          report += `      Mode      : ${parsed.mode}\n`;
          report += `      Required  : ${parsed.target}\n`;
          report += `      Minimum   : ${parsed.min}\n`;
          if (parsed.teams && parsed.teams !== "Invalid Link") {
            report += `      Teams in responses sheet : ${parsed.teams}\n`;
          }
          report += `\n`;
        } else {
          report += `   └─ ${d.error}\n\n`;
        }
      });
    }

    if (accessibility.length > 0) {
      report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      report += `🔓 ACCESSIBILITY & LINK FAULTS (${accessibility.length})\n`;
      report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      accessibility.forEach((a) => {
        report += `❌ ${a.chName.toUpperCase()}\n`;
        const match = a.error.match(/(.*?)\.\s*\(Teams in responses sheet:\s*([^)]*)\)/i);
        if (match) {
          report += `   ├─ ${match[1].trim()}\n`;
          report += `   └─ Teams in responses sheet : ${match[2].trim()}\n\n`;
        } else {
          report += `   └─ ${a.error}\n\n`;
        }
      });
    }

    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `✅ REPORT COMPLETE • DIAS & PRL AUTO JOINER\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    navigator.clipboard.writeText(report);
    toast("Operation summary copied to clipboard!", "success");
  };

  const exportReportToCSV = () => {
    if (!selectedJob) return;
    let csvContent = "data:text/csv;charset=utf-8,CH Name,Issue / Log Type,Details\n";

    viewErrors.forEach((e) => {
      const type = getErrorType(e);
      const safeError = `"${e.error.replace(/"/g, '""')}"`;
      csvContent += `"${e.chName}",${type},${safeError}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `report_${selectedJob.name.replace(/\s+/g, "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast("Report exported to CSV!", "success");
  };

  // Filter jobs
  const filteredJobs = jobs.filter((j) => {
    const matchesSearch =
      j.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (j.targetSpreadsheetName && j.targetSpreadsheetName.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesType = typeFilter === "all" || j.type === typeFilter;
    return matchesSearch && matchesType;
  });

  // Metrics
  const totalJobs = jobs.length;
  const diamondCount = jobs.filter((j) => j.type === "diamonds").length;
  const prlCount = jobs.filter((j) => j.type === "prl").length;
  const runningCount = jobs.filter((j) => getDisplayStatus(j) === "running").length;
  const totalRowsProcessed = jobs.reduce((acc, j) => acc + (j.runs?.[0]?.rowsWritten || 0), 0);

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[75vh] gap-4 bg-cream-100">
        <Background3D />
        <div className="w-12 h-12 border-3 border-ink border-t-rust rounded-full animate-spin" />
        <div className="text-xs font-mono font-bold uppercase tracking-widest text-ink/60 animate-pulse">
          Connecting to Dias & PRL Command Center...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-100 text-ink selection:bg-rust/20 px-4 sm:px-6 lg:px-8 py-6 flex flex-col justify-between">
      <Background3D />
      <ToastProvider />

      {/* Top Header Bar */}
      <header className="w-full max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 pb-6">
        <div className="flex items-center gap-4">
          <BrandLogo size="md" />
          <div className="hidden md:block h-6 w-px bg-ink/20" />
          <div className="hidden md:block">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-rust block">
              COMMUNITY HERO PLATFORM
            </span>
            <span className="text-xs font-bold text-ink/70">
              Esports Rewards & Roster Consolidation
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/jobs/new" className="btn-retro-primary !py-2.5 !px-4 text-xs">
            <Plus className="w-4 h-4" />
            <span>CREATE SYNC JOB</span>
          </Link>

          <SettingsPillButton />

          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="btn-retro-pill !py-2 !px-3 text-xs"
            title="Sign Out"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl w-full mx-auto space-y-8 animate-fade-in flex-1">
        {/* Step Indicator / Section Title */}
        <div className="text-center sm:text-left space-y-1">
          <span className="text-xs font-black uppercase tracking-[0.25em] text-rust">
            ACTIVE WORKFLOW
          </span>
          <h1 className="font-serif-title text-3xl sm:text-4xl font-black text-ink tracking-tight">
            SYSTEM CONTROL<span className="text-rust">.</span>
          </h1>
        </div>

        {/* 4 Stat Cards Grid (Matching reference card styling) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Card 1: Total Jobs */}
          <div className="card-retro p-6 space-y-3 bg-white">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-ink/60">
                ACTIVE JOBS
              </span>
              <div className="icon-box-retro w-8 h-8 text-xs">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="font-serif-title text-4xl font-black text-ink">
              {totalJobs}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <span className="stamp-diamonds">💎 {diamondCount} Dias</span>
              <span className="stamp-prl">📋 {prlCount} PRL</span>
            </div>
          </div>

          {/* Card 2: Rows Processed */}
          <div className="card-retro p-6 space-y-3 bg-white">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-ink/60">
                TOTAL ROWS
              </span>
              <div className="icon-box-retro w-8 h-8 text-xs">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
            </div>
            <div className="font-serif-title text-4xl font-black text-ink">
              {totalRowsProcessed.toLocaleString()}
            </div>
            <p className="text-[11px] font-bold text-emerald-700 flex items-center gap-1.5 pt-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Google Sheets Direct Sync
            </p>
          </div>

          {/* Card 3: Execution Pulse */}
          <div className="card-retro p-6 space-y-3 bg-white">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-ink/60">
                ENGINE STATUS
              </span>
              <div className="icon-box-retro w-8 h-8 text-xs">
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <div className="font-serif-title text-4xl font-black text-ink">
              {runningCount > 0 ? "BUSY" : "READY"}
            </div>
            <p className="text-[11px] font-bold text-ink/70 flex items-center gap-2 pt-1">
              <span
                className={`w-2 h-2 rounded-full ${
                  runningCount > 0 ? "bg-rust animate-ping" : "bg-emerald-600"
                }`}
              />
              <span>{runningCount > 0 ? `${runningCount} Job(s) Active` : "Engine Standby"}</span>
            </p>
          </div>

          {/* Card 4: Validation */}
          <div className="card-retro p-6 space-y-3 bg-white">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-ink/60">
                VERIFICATION
              </span>
              <div className="icon-box-retro w-8 h-8 text-xs">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="font-serif-title text-3xl font-black text-ink">
              MOOGOLD
            </div>
            <p className="text-[11px] font-bold text-ink/70 pt-1">
              MLBB Server & UID Validation
            </p>
          </div>
        </div>

        {/* Toolbar & Filter Bar */}
        <div className="card-retro p-4 sm:p-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white">
          <div className="flex items-center gap-3 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-ink/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search jobs by name or destination sheet..."
                className="input-retro !py-2 !pl-10 !text-xs"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl border-2 border-ink bg-cream-50">
              <button
                onClick={() => setTypeFilter("all")}
                className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  typeFilter === "all"
                    ? "bg-ink text-white shadow-retro-sm"
                    : "text-ink/60 hover:text-ink"
                }`}
              >
                ALL
              </button>
              <button
                onClick={() => setTypeFilter("diamonds")}
                className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  typeFilter === "diamonds"
                    ? "bg-rust text-white shadow-retro-sm"
                    : "text-ink/60 hover:text-ink"
                }`}
              >
                💎 DIAS
              </button>
              <button
                onClick={() => setTypeFilter("prl")}
                className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  typeFilter === "prl"
                    ? "bg-ink text-white shadow-retro-sm"
                    : "text-ink/60 hover:text-ink"
                }`}
              >
                📋 PRL
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => setViewLayout("grid")}
              className={`p-2 rounded-xl border-2 transition-all cursor-pointer ${
                viewLayout === "grid"
                  ? "bg-ink text-white border-ink shadow-retro-sm"
                  : "bg-white text-ink/60 border-ink/30 hover:border-ink hover:text-ink"
              }`}
              title="Grid View"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewLayout("table")}
              className={`p-2 rounded-xl border-2 transition-all cursor-pointer ${
                viewLayout === "table"
                  ? "bg-ink text-white border-ink shadow-retro-sm"
                  : "bg-white text-ink/60 border-ink/30 hover:border-ink hover:text-ink"
              }`}
              title="Table View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Jobs List (Grid View) */}
        {viewLayout === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredJobs.map((job) => {
              const status = getDisplayStatus(job);
              const live = runProgress.get(job.id);
              const isStarting = startingJobs.has(job.id);
              const isStopping = stoppingJobs.has(job.id);
              const isFailed = live?.status === "failed" || (!live && status === "failed");
              const isSuccess = live?.status === "success" || (!live && status === "success");
              const isRunning = !isFailed && !isSuccess && (status === "running" || live?.status === "running" || isStarting);
              const ratioInfo = parseProgressRatio(live?.progressMessage);

              return (
                <div
                  key={job.id}
                  className="card-stitched p-6 flex flex-col justify-between gap-5 bg-white group"
                >
                  <div className="space-y-4">
                    {/* Header line with badge and status */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="icon-box-retro w-10 h-10 text-base">
                          {job.type === "diamonds" ? "💎" : "📋"}
                        </div>
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-rust block">
                            {job.type === "diamonds" ? "DIAMOND REWARDS" : "PRE-REGISTERED"}
                          </span>
                          <span className="text-xs font-bold text-ink/60">
                            {job.gameMode || "5v5"}
                          </span>
                        </div>
                      </div>

                      {isRunning ? (
                        <span className="stamp-running">
                          <RefreshCw className="w-3 h-3 animate-spin text-rust" /> {ratioInfo ? ratioInfo.ratioStr : "RUNNING"}
                        </span>
                      ) : status === "success" || job.runs?.[0]?.status === "success" ? (
                        <span className="stamp-success">
                          <CheckCircle2 className="w-3 h-3" /> READY
                        </span>
                      ) : status === "failed" || job.runs?.[0]?.status === "failed" ? (
                        <span className="stamp-failed">
                          <AlertTriangle className="w-3 h-3" /> FAULT
                        </span>
                      ) : (
                        <span className="btn-retro-pill !py-0.5 !px-2 text-[9px]">IDLE</span>
                      )}
                    </div>

                    {/* Job Title in Retro Serif */}
                    <div>
                      <h3 className="font-serif-title text-xl font-black text-ink tracking-tight group-hover:text-rust transition-colors">
                        {job.name}
                      </h3>
                      <p className="text-[11px] font-mono text-ink/60 truncate pt-1">
                        Target: <span className="text-ink font-bold">{job.targetSpreadsheetName || "Default Target"}</span>
                      </p>
                    </div>
                  </div>

                  {/* Prominent Progress Loading Bar when Running (with 2/62 Ratio Badge) */}
                  {isRunning && (
                    <div className="p-3.5 rounded-xl border-2 border-dashed border-ink/40 bg-cream-50 space-y-2.5 shadow-xs animate-fade-in">
                      {/* Top indicator: Ratio badge (e.g. "2/62") + Action detail + Percentage */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {ratioInfo ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-ink text-cream-50 font-mono font-black text-xs shadow-retro-xs shrink-0 tracking-wider">
                              <span className="text-rust">●</span> {ratioInfo.ratioStr}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rust text-white font-mono font-bold text-[10px] shrink-0">
                              <RefreshCw className="w-2.5 h-2.5 animate-spin" /> SYNCING
                            </span>
                          )}
                          <span
                            className="text-xs font-bold text-ink truncate"
                            title={live?.progressMessage || "Syncing spreadsheets..."}
                          >
                            {live?.progressMessage || "Syncing spreadsheets..."}
                          </span>
                        </div>

                        <span className="font-mono text-xs font-black text-rust shrink-0">
                          {live?.progress || 0}%
                        </span>
                      </div>

                      {/* Tactile Retro Progress Bar with Animated Barber-Pole Stripes */}
                      <div className="w-full h-3.5 border-2 border-ink rounded-full overflow-hidden bg-white p-0.5 relative shadow-inner">
                        <div
                          className="h-full bg-rust rounded-full transition-all duration-300 relative overflow-hidden"
                          style={{ width: `${Math.max(live?.progress || 0, 5)}%` }}
                        >
                          <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.3)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.3)_50%,rgba(255,255,255,0.3)_75%,transparent_75%,transparent)] bg-[length:14px_14px] animate-stripes" />
                        </div>
                      </div>

                      {/* Bottom Counter Subtitle: e.g. "Processed: 2 of 62 CHs" */}
                      <div className="flex items-center justify-between text-[10px] font-mono font-bold text-ink/70">
                        {ratioInfo ? (
                          <>
                            <span>Processed: <strong className="text-ink">{ratioInfo.current} of {ratioInfo.total} CHs</strong></span>
                            <span>{Math.max(0, ratioInfo.total - ratioInfo.current)} CHs remaining</span>
                          </>
                        ) : (
                          <>
                            <span>Current Phase: <strong className="text-ink">{live?.progressMessage || "Connecting"}</strong></span>
                            <span>Please wait...</span>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Metadata & Actions */}
                  <div className="space-y-3 pt-3 border-t-2 border-dashed border-ink/20 text-xs">
                    <div className="flex justify-between text-ink/60 font-semibold text-[11px]">
                      <span>Last Execution:</span>
                      <span className="text-ink font-bold">{formatTimeAgo(job.lastRunAt)}</span>
                    </div>

                    <div className="flex justify-between text-ink/60 font-semibold text-[11px]">
                      <span>Rows Extracted:</span>
                      <span className="text-emerald-700 font-black">
                        {job.runs?.[0]?.rowsWritten || 0} rows
                      </span>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-2 pt-1">
                      <div className="flex items-center gap-2">
                        {isRunning ? (
                          <button
                            onClick={() => handleStopRun(job)}
                            disabled={isStopping}
                            className="btn-retro-dark flex-1 !py-2 text-xs"
                          >
                            <Square className="w-3.5 h-3.5" /> STOP SYNC
                          </button>
                        ) : (
                          <button
                            onClick={() => handleStartRun(job)}
                            disabled={isStarting}
                            className="btn-retro-primary flex-1 !py-2 text-xs cursor-pointer"
                          >
                            {isStarting ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Play className="w-3.5 h-3.5 fill-current" />
                            )}
                            SYNC NOW
                          </button>
                        )}

                        <button
                          onClick={() => openLogModal(job)}
                          className="btn-retro-pill !py-2 !px-3 text-xs"
                          title="View Reports & Health"
                        >
                          <Activity className="w-3.5 h-3.5 text-rust" />
                          <span className="hidden sm:inline">REPORT</span>
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        {job.targetSpreadsheetId ? (
                          <a
                            href={`https://docs.google.com/spreadsheets/d/${job.targetSpreadsheetId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-bold text-rust hover:text-rust-hover flex items-center gap-1 underline underline-offset-2"
                          >
                            <ExternalLink className="w-3 h-3" /> Open Sheet
                          </a>
                        ) : (
                          <span className="text-[10px] text-ink/40 font-mono">No Sheet Yet</span>
                        )}

                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/jobs/${job.id}/edit`}
                            className="p-1.5 rounded-lg border-2 border-ink hover:bg-cream-100 transition-colors"
                            title="Edit Job"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-ink" />
                          </Link>

                          <button
                            onClick={() => {
                              setSelectedJob(job);
                              setDeleteModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg border-2 border-ink hover:bg-red-50 text-red-700 transition-colors cursor-pointer"
                            title="Delete Job"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Table Layout View */
          <div className="card-retro overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-cream-100 text-ink uppercase tracking-wider font-black border-b-2 border-ink">
                  <tr>
                    <th className="p-4">Job Name</th>
                    <th className="p-4">Type</th>
                    <th className="p-4">Format</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Last Run</th>
                    <th className="p-4">Rows</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-dashed divide-ink/15 font-semibold">
                  {filteredJobs.map((job) => {
                    const status = getDisplayStatus(job);
                    const live = runProgress.get(job.id);
                    const isRunning = status === "running" || live?.status === "running" || startingJobs.has(job.id);
                    const ratioInfo = parseProgressRatio(live?.progressMessage);

                    return (
                      <tr key={job.id} className="hover:bg-cream-50 transition-colors">
                        <td className="p-4 font-bold text-ink text-sm">{job.name}</td>
                        <td className="p-4">
                          <span className={job.type === "diamonds" ? "stamp-diamonds" : "stamp-prl"}>
                            {job.type}
                          </span>
                        </td>
                        <td className="p-4 font-mono text-ink/70">{job.gameMode || "5v5"}</td>
                        <td className="p-4">
                          {isRunning ? (
                            <span className="stamp-running">
                              <RefreshCw className="w-3 h-3 animate-spin text-rust inline mr-1" />
                              {ratioInfo ? ratioInfo.ratioStr : `${live?.progress || 0}%`}
                            </span>
                          ) : status === "success" ? (
                            <span className="stamp-success">Ready</span>
                          ) : (
                            <span className="btn-retro-pill !py-0.5 !px-2 text-[9px]">Idle</span>
                          )}
                        </td>
                        <td className="p-4 text-ink/60">{formatTimeAgo(job.lastRunAt)}</td>
                        <td className="p-4 text-emerald-700 font-bold">{job.runs?.[0]?.rowsWritten || 0}</td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => (isRunning ? handleStopRun(job) : handleStartRun(job))}
                              className="btn-retro-primary !py-1 !px-2.5 text-xs"
                            >
                              {isRunning ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3 fill-current" />}
                            </button>
                            <button
                              onClick={() => openLogModal(job)}
                              className="btn-retro-pill !py-1 !px-2.5 text-xs"
                            >
                              Report
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title={`Delete "${selectedJob?.name}"?`}
        type="danger"
        footer={
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setDeleteModalOpen(false)} className="btn-retro-pill">
              Cancel
            </button>
            <button onClick={handleDeleteJob} className="btn-retro-primary !bg-red-700">
              Delete Job
            </button>
          </div>
        }
      >
        <p className="text-ink/80 text-sm">
          Are you sure you want to delete this job configuration? This will permanently stop any active sync tasks.
        </p>
      </Modal>

      {/* Execution Health & Inspection Dossier Modal */}
      <Modal
        isOpen={errorsModalOpen}
        onClose={() => setErrorsModalOpen(false)}
        title={`Execution Dossier - ${selectedJob?.name}`}
        maxWidth="max-w-4xl"
      >
        <div className="space-y-6">
          {/* Tab Navigation Matrix */}
          <div className="flex flex-wrap items-center gap-2 border-b-2 border-dashed border-ink/20 pb-3">
            <button
              onClick={() => setActiveLogTab("overview")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                activeLogTab === "overview"
                  ? "bg-ink text-white shadow-retro-sm"
                  : "bg-cream-50 text-ink/70 hover:text-ink"
              }`}
            >
              OVERVIEW & REPORT
            </button>

            <button
              onClick={() => setActiveLogTab("chHealth")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                activeLogTab === "chHealth"
                  ? "bg-ink text-white shadow-retro-sm"
                  : "bg-cream-50 text-ink/70 hover:text-ink"
              }`}
            >
              CH HOST HEALTH ({viewStats.length})
            </button>

            <button
              onClick={() => setActiveLogTab("duplicates")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                activeLogTab === "duplicates"
                  ? "bg-rust text-white shadow-retro-sm"
                  : "bg-cream-50 text-ink/70 hover:text-ink"
              }`}
            >
              DUPLICATES ({viewErrors.filter((err) => getErrorType(err) === "duplicate").length})
            </button>

            <button
              onClick={() => setActiveLogTab("logs")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                activeLogTab === "logs"
                  ? "bg-ink text-white shadow-retro-sm"
                  : "bg-cream-50 text-ink/70 hover:text-ink"
              }`}
            >
              SYSTEM LOGS ({viewErrors.length})
            </button>
          </div>

          {/* TAB 1: OVERVIEW */}
          {activeLogTab === "overview" && (
            <div className="space-y-6">
              {/* Actions Box */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl border-2 border-dashed border-ink/30 bg-cream-50">
                <div className="space-y-1">
                  <h4 className="font-serif-title font-black text-ink text-base">Summary Actions</h4>
                  <p className="text-xs text-ink/70 font-medium">
                    Copy a clean formatted report to share with Community Admins or export to CSV.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button onClick={copyTextReport} className="btn-retro-primary !py-2 !px-4 text-xs cursor-pointer">
                    <Copy className="w-4 h-4" />
                    <span>COPY SUMMARY</span>
                  </button>

                  <button
                    onClick={exportReportToCSV}
                    className="btn-retro-dark !py-2 !px-4 text-xs cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>EXPORT CSV</span>
                  </button>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl border-2 border-ink bg-white shadow-retro-sm text-center">
                  <span className="text-[10px] text-ink/60 font-black uppercase tracking-wider">Extracted Rows</span>
                  <div className="font-serif-title text-3xl font-black text-emerald-700 mt-1">
                    {selectedJob?.runs?.[0]?.rowsWritten || 0}
                  </div>
                </div>

                <div className="p-4 rounded-xl border-2 border-ink bg-white shadow-retro-sm text-center">
                  <span className="text-[10px] text-ink/60 font-black uppercase tracking-wider">Faults & Rule Issues</span>
                  <div className="font-serif-title text-3xl font-black text-red-700 mt-1">
                    {viewErrors.filter((e) => ["accessibility", "dissolved", "rule_violation"].includes(getErrorType(e))).length}
                  </div>
                </div>

                <div className="p-4 rounded-xl border-2 border-ink bg-white shadow-retro-sm text-center">
                  <span className="text-[10px] text-ink/60 font-black uppercase tracking-wider">Duplicates Flagged</span>
                  <div className="font-serif-title text-3xl font-black text-rust mt-1">
                    {viewErrors.filter((e) => getErrorType(e) === "duplicate").length}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CH HOST HEALTH */}
          {activeLogTab === "chHealth" && (
            <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
              <table className="w-full text-left text-xs">
                <thead className="bg-cream-100 text-ink uppercase tracking-wider font-black border-b-2 border-ink">
                  <tr>
                    <th className="p-3">CH Nickname</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center">Players Extracted</th>
                    <th className="p-3">Issue Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-dashed divide-ink/15 font-semibold">
                  {viewStats.map((stat, i) => {
                    const chErrs = viewErrors.filter((e) => e.chName === stat.chName);
                    const hasRuleViolation = chErrs.some((e) => getErrorType(e) === "rule_violation");
                    const hasCritical = chErrs.some((e) => ["accessibility", "dissolved"].includes(getErrorType(e)));
                    const hasDup = chErrs.some((e) => getErrorType(e) === "duplicate");

                    return (
                      <tr key={i} className="hover:bg-cream-50">
                        <td className="p-3 font-bold text-ink">{stat.chName}</td>
                        <td className="p-3 text-center">
                          {hasRuleViolation ? (
                            <span className="stamp-failed">Rule Fault</span>
                          ) : hasCritical ? (
                            <span className="stamp-failed">Critical</span>
                          ) : hasDup ? (
                            <span className="stamp-diamonds">Duplicate</span>
                          ) : (
                            <span className="stamp-success">Normal</span>
                          )}
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-emerald-700">{stat.count}</td>
                        <td className="p-3">
                          {chErrs.length === 0 ? (
                            <span className="text-ink/40 italic">None</span>
                          ) : (
                            <div className="space-y-1 font-mono text-[11px] text-red-700">
                              {chErrs.map((e, idx) => (
                                <div key={idx}>• {e.error}</div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 3: DUPLICATES */}
          {activeLogTab === "duplicates" && (
            <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
              {viewErrors.filter((err) => getErrorType(err) === "duplicate").length === 0 ? (
                <div className="text-center py-12 text-ink/50 text-xs">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2 opacity-60" />
                  No duplicate player entries detected in this execution run.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {viewErrors
                    .filter((err) => getErrorType(err) === "duplicate")
                    .map((err, i) => {
                      const parsed = parseDuplicateError(err);
                      if (!parsed) {
                        return (
                          <div key={i} className="p-4 rounded-xl border-2 border-ink bg-cream-50 text-xs">
                            <div className="font-black text-ink mb-1">{err.chName}</div>
                            <div className="font-mono text-rust">{err.error}</div>
                          </div>
                        );
                      }

                      const isFake = parsed.isFakedServer;

                      return (
                        <div
                          key={i}
                          className="p-4 rounded-xl border-2 border-ink bg-white shadow-retro-sm text-xs space-y-2.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-black text-ink text-sm">{parsed.name}</span>
                            <span
                              className={`text-[9px] font-mono font-black px-2 py-0.5 rounded border ${
                                isFake
                                  ? "bg-red-100 text-red-800 border-red-300"
                                  : "bg-amber-100 text-amber-800 border-amber-300"
                              }`}
                            >
                              {isFake ? "DIFFERENT SERVER" : "DUPLICATE"}
                            </span>
                          </div>

                          <div className="font-mono text-[11px] text-ink/80 space-y-1">
                            <div>
                              UID: <strong className="text-ink">{parsed.uid}</strong> | Server:{" "}
                              <strong className="text-ink">{parsed.server}</strong>
                            </div>
                            {isFake && parsed.prevServer && (
                              <div className="text-red-700 font-bold">
                                Entered Server: {parsed.server} | Original: {parsed.prevServer}
                              </div>
                            )}
                          </div>

                          <div className="pt-2 border-t-2 border-dashed border-ink/20 flex items-center justify-between text-[11px]">
                            <div>
                              <span className="text-ink/50 font-bold block text-[9px] uppercase">ORIGINAL</span>
                              <span className="font-bold text-ink">{parsed.prevCh}</span>
                            </div>
                            <span className="text-ink/40">➡️</span>
                            <div className="text-right">
                              <span className="text-ink/50 font-bold block text-[9px] uppercase">DUPLICATE</span>
                              <span className="font-bold text-rust">{parsed.currCh}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SYSTEM LOGS */}
          {activeLogTab === "logs" && (
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Search logs by CH or error pattern..."
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                className="input-retro !py-2 !text-xs"
              />

              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {viewErrors.length === 0 ? (
                  <p className="text-ink/50 italic text-center py-8 text-xs">No execution logs or errors recorded.</p>
                ) : (
                  viewErrors
                    .filter(
                      (err) =>
                        err.chName.toLowerCase().includes(modalSearch.toLowerCase()) ||
                        err.error.toLowerCase().includes(modalSearch.toLowerCase())
                    )
                    .map((err, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-xl border-2 border-ink bg-cream-50 flex items-start gap-3 text-xs"
                      >
                        <span className="font-black text-rust shrink-0">[{err.chName}]</span>
                        <span className="font-mono text-ink/80">{err.error}</span>
                      </div>
                    ))
                )}
              </div>
            </div>
          )}
        </div>
      </Modal>

      <AppFooter />
    </div>
  );
}
