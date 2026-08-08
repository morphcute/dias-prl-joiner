"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import Modal from "./Modal";
import { toast, ToastProvider } from "./Toast";
import { Background3D } from "./Background3D";
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
  Filter,
  Grid,
  List,
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

export default function Dashboard() {
  const [jobs, setJobs] = useState<JoinerJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [runProgress, setRunProgress] = useState<Map<string, ProgressData>>(new Map());
  const pollersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "diamonds" | "prl">("all");
  const [viewLayout, setViewLayout] = useState<"grid" | "table">("grid");

  const [runModalOpen, setRunModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [errorsModalOpen, setErrorsModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JoinerJob | null>(null);
  const [viewErrors, setViewErrors] = useState<ChError[]>([]);
  const [viewStats, setViewStats] = useState<{ chName: string; count: number }[]>([]);
  const [statsModalOpen, setStatsModalOpen] = useState(false);
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

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs", { cache: "no-store" });
      if (res.status === 401) return;
      if (res.ok) {
        const data = await res.json();
        setJobs(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    const timer = setInterval(fetchJobs, 12000);
    return () => clearInterval(timer);
  }, [fetchJobs]);

  const pollJobStatus = useCallback((jobId: string) => {
    if (pollersRef.current.has(jobId)) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/run`);
        if (!res.ok) return;
        const data: ProgressData = await res.json();

        setRunProgress((prev) => {
          const next = new Map(prev);
          next.set(jobId, data);
          return next;
        });

        if (data.status !== "running") {
          clearInterval(interval);
          pollersRef.current.delete(jobId);
          fetchJobs();
        }
      } catch (e) {
        console.error(e);
      }
    }, 2000);

    pollersRef.current.set(jobId, interval);
  }, [fetchJobs]);

  const handleStartRun = async (job: JoinerJob) => {
    setStartingJobs((prev) => new Set(prev).add(job.id));
    try {
      const res = await fetch(`/api/jobs/${job.id}/run`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start run");
      }
      toast(`Sync started for "${job.name}"`, "info");
      pollJobStatus(job.id);
      fetchJobs();
    } catch (e: any) {
      toast(e.message, "error");
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
        const data = await res.json();
        throw new Error(data.error || "Failed to stop run");
      }
      toast(`Stopping sync for "${job.name}"...`, "info");

      if (pollersRef.current.has(job.id)) {
        clearInterval(pollersRef.current.get(job.id)!);
        pollersRef.current.delete(job.id);
      }
      setRunProgress((prev) => {
        const next = new Map(prev);
        next.delete(job.id);
        return next;
      });
      fetchJobs();
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
      toast(`Job "${selectedJob.name}" deleted`, "success");
      setDeleteModalOpen(false);
      setSelectedJob(null);
      fetchJobs();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  const openLogModal = (job: JoinerJob) => {
    setSelectedJob(job);
    const latestRun = job.runs?.[0];
    if (latestRun) {
      let parsedErrors: ChError[] = [];
      if (typeof latestRun.errors === "string") {
        try {
          parsedErrors = JSON.parse(latestRun.errors);
        } catch {
          parsedErrors = [{ chName: "General", error: latestRun.errors }];
        }
      } else if (Array.isArray(latestRun.errors)) {
        parsedErrors = latestRun.errors;
      }
      setViewErrors(parsedErrors);
    } else {
      setViewErrors([]);
    }
    setErrorsModalOpen(true);
  };

  // Filter jobs
  const filteredJobs = jobs.filter((j) => {
    const matchesSearch =
      j.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (j.targetSpreadsheetName && j.targetSpreadsheetName.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesType = typeFilter === "all" || j.type === typeFilter;
    return matchesSearch && matchesType;
  });

  // Calculate metrics
  const totalJobs = jobs.length;
  const diamondCount = jobs.filter((j) => j.type === "diamonds").length;
  const prlCount = jobs.filter((j) => j.type === "prl").length;
  const runningCount = jobs.filter((j) => getDisplayStatus(j) === "running").length;
  const totalRowsProcessed = jobs.reduce((acc, j) => acc + (j.runs?.[0]?.rowsWritten || 0), 0);

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[75vh] gap-4">
        <Background3D />
        <div className="relative w-14 h-14">
          <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full" />
          <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin glow-indigo" />
        </div>
        <div className="text-sm font-bold tracking-widest uppercase text-indigo-400 animate-pulse">
          Connecting to Cyber Command Center...
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen pb-20 selection:bg-indigo-500/40">
      <Background3D />
      <ToastProvider />

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10 animate-fade-in">
        {/* Navigation Bar */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 glass-panel-3d p-5 rounded-3xl border border-slate-700/60 shadow-2xl">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30 border border-white/20">
              <Zap className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-white tracking-tight">
                  Dias & PRL Auto Joiner
                </h1>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono font-bold border border-indigo-500/30">
                  v2.0 3D ENGINE
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                Automated Diamond Rewards & PRL Google Sheets Processor
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <Link href="/jobs/new" className="btn-primary">
              <Plus className="w-4 h-4" />
              <span>Create New Sync Job</span>
            </Link>

            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="p-3 rounded-xl bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-rose-400 border border-slate-700/70 transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* 3D Holographic Stat Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="glass-card-3d p-6 rounded-3xl space-y-2 relative overflow-hidden group">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold uppercase tracking-wider">Total Active Jobs</span>
              <Layers className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-4xl font-black text-white tracking-tight">{totalJobs}</div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 pt-1">
              <span className="text-amber-400 font-bold">{diamondCount} 💎 Diamonds</span>
              <span>•</span>
              <span className="text-indigo-400 font-bold">{prlCount} 📋 PRL</span>
            </div>
          </div>

          <div className="glass-card-3d p-6 rounded-3xl space-y-2 relative overflow-hidden group">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold uppercase tracking-wider">Rows Processed</span>
              <FileSpreadsheet className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-4xl font-black text-white tracking-tight">{totalRowsProcessed.toLocaleString()}</div>
            <p className="text-xs font-medium text-emerald-400 flex items-center gap-1 pt-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Direct Google Sheets Consolidations
            </p>
          </div>

          <div className="glass-card-3d p-6 rounded-3xl space-y-2 relative overflow-hidden group">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold uppercase tracking-wider">Execution Pulse</span>
              <Activity className="w-5 h-5 text-cyan-400 group-hover:scale-110 transition-transform animate-pulse" />
            </div>
            <div className="text-4xl font-black text-white tracking-tight">{runningCount}</div>
            <p className="text-xs font-semibold text-cyan-400 flex items-center gap-1 pt-1">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              {runningCount > 0 ? "Active Syncs Running" : "Engine Standby Ready"}
            </p>
          </div>

          <div className="glass-card-3d p-6 rounded-3xl space-y-2 relative overflow-hidden group">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold uppercase tracking-wider">API Validation</span>
              <ShieldCheck className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-4xl font-black text-white tracking-tight">MooGold</div>
            <p className="text-xs font-semibold text-slate-400 pt-1">
              MLBB Server & User Verification Engine
            </p>
          </div>
        </div>

        {/* Toolbar & Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 glass-panel-3d p-4 rounded-2xl border border-slate-700/60">
          <div className="flex items-center gap-3 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search jobs by name or target sheet..."
                className="input-field !py-2.5 !pl-10 !text-xs"
              />
            </div>

            <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setTypeFilter("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  typeFilter === "all" ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-white"
                }`}
              >
                All Jobs
              </button>
              <button
                onClick={() => setTypeFilter("diamonds")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  typeFilter === "diamonds" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "text-slate-400 hover:text-white"
                }`}
              >
                💎 Diamonds
              </button>
              <button
                onClick={() => setTypeFilter("prl")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  typeFilter === "prl" ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "text-slate-400 hover:text-white"
                }`}
              >
                📋 PRL
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => setViewLayout("grid")}
              className={`p-2 rounded-xl transition-all ${
                viewLayout === "grid" ? "bg-slate-800 text-white border border-slate-700" : "text-slate-400 hover:text-white"
              }`}
              title="Grid View"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewLayout("table")}
              className={`p-2 rounded-xl transition-all ${
                viewLayout === "table" ? "bg-slate-800 text-white border border-slate-700" : "text-slate-400 hover:text-white"
              }`}
              title="Table View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Jobs View (Grid Layout) */}
        {viewLayout === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredJobs.map((job) => {
              const status = getDisplayStatus(job);
              const live = runProgress.get(job.id);
              const isStarting = startingJobs.has(job.id);
              const isStopping = stoppingJobs.has(job.id);
              const isRunning = status === "running" || live?.status === "running";

              return (
                <div
                  key={job.id}
                  className="glass-card-3d p-6 rounded-3xl flex flex-col justify-between gap-6 border border-slate-700/60 relative overflow-hidden group"
                >
                  {/* Card Header */}
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span
                          className={
                            job.type === "diamonds"
                              ? "badge-diamonds mb-2"
                              : "badge-prl mb-2"
                          }
                        >
                          {job.type === "diamonds" ? "💎 Diamond Rewards" : "📋 Pre-Registered List"}
                        </span>
                        <h3 className="text-xl font-black text-white tracking-tight group-hover:text-indigo-400 transition-colors">
                          {job.name}
                        </h3>
                      </div>

                      {/* Status Badge */}
                      {isRunning ? (
                        <span className="badge-running">
                          <RefreshCw className="w-3 h-3 animate-spin" /> Syncing
                        </span>
                      ) : status === "success" || job.runs?.[0]?.status === "success" ? (
                        <span className="badge-success">
                          <CheckCircle2 className="w-3 h-3" /> Ready
                        </span>
                      ) : status === "failed" || job.runs?.[0]?.status === "failed" ? (
                        <span className="badge-failed">
                          <AlertTriangle className="w-3 h-3" /> Error
                        </span>
                      ) : (
                        <span className="badge-pending">Idle</span>
                      )}
                    </div>

                    <p className="text-xs font-mono text-slate-400 truncate">
                      Target: <span className="text-slate-200">{job.targetSpreadsheetName || "Default Consolidated"}</span>
                    </p>
                  </div>

                  {/* Execution Progress Bar */}
                  {isRunning && (
                    <div className="space-y-2 p-3 rounded-2xl bg-slate-950/80 border border-indigo-500/30">
                      <div className="flex justify-between text-xs font-bold text-indigo-300">
                        <span className="truncate">{live?.progressMessage || "Extracting CH entries..."}</span>
                        <span>{live?.progress || 0}%</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-300 rounded-full glow-indigo"
                          style={{ width: `${live?.progress || 0}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Info Meta Footer */}
                  <div className="space-y-3 pt-3 border-t border-slate-800 text-xs">
                    <div className="flex justify-between text-slate-400 font-medium">
                      <span>Last Execution:</span>
                      <span className="text-slate-200 font-bold">{formatTimeAgo(job.lastRunAt)}</span>
                    </div>

                    <div className="flex justify-between text-slate-400 font-medium">
                      <span>Rows Processed:</span>
                      <span className="text-emerald-400 font-bold">
                        {job.runs?.[0]?.rowsWritten || 0} rows
                      </span>
                    </div>

                    {/* Actions Toolbar */}
                    <div className="flex items-center justify-between pt-2 gap-2">
                      <div className="flex items-center gap-2">
                        {isRunning ? (
                          <button
                            onClick={() => handleStopRun(job)}
                            disabled={isStopping}
                            className="btn-danger !py-2 !px-3 text-xs"
                          >
                            <Square className="w-3.5 h-3.5" /> Stop
                          </button>
                        ) : (
                          <button
                            onClick={() => handleStartRun(job)}
                            disabled={isStarting}
                            className="btn-primary !py-2 !px-4 text-xs"
                          >
                            {isStarting ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Play className="w-3.5 h-3.5 fill-current" />
                            )}
                            Sync Now
                          </button>
                        )}

                        <button
                          onClick={() => openLogModal(job)}
                          className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 transition-colors"
                          title="View Logs & Terminal"
                        >
                          <Terminal className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        {job.targetSpreadsheetId && (
                          <a
                            href={`https://docs.google.com/spreadsheets/d/${job.targetSpreadsheetId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-indigo-400 hover:text-indigo-300 border border-slate-700 transition-colors"
                            title="Open Google Sheet"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}

                        <Link
                          href={`/jobs/${job.id}/edit`}
                          className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700 transition-colors"
                          title="Edit Job"
                        >
                          <Edit3 className="w-4 h-4" />
                        </Link>

                        <button
                          onClick={() => {
                            setSelectedJob(job);
                            setDeleteModalOpen(true);
                          }}
                          className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 border border-slate-700 transition-colors"
                          title="Delete Job"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Table Layout View */
          <div className="glass-panel-3d rounded-3xl overflow-hidden border border-slate-700/60">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-bold border-b border-slate-800">
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
                <tbody className="divide-y divide-slate-800/80">
                  {filteredJobs.map((job) => {
                    const status = getDisplayStatus(job);
                    const isRunning = status === "running";

                    return (
                      <tr key={job.id} className="hover:bg-slate-800/40 transition-colors font-medium">
                        <td className="p-4 font-bold text-white text-sm">{job.name}</td>
                        <td className="p-4">
                          <span className={job.type === "diamonds" ? "badge-diamonds" : "badge-prl"}>
                            {job.type}
                          </span>
                        </td>
                        <td className="p-4 font-mono text-slate-300">{job.gameMode || "5v5"}</td>
                        <td className="p-4">
                          {isRunning ? (
                            <span className="badge-running">Syncing</span>
                          ) : status === "success" ? (
                            <span className="badge-success">Ready</span>
                          ) : (
                            <span className="badge-pending">Idle</span>
                          )}
                        </td>
                        <td className="p-4 text-slate-400">{formatTimeAgo(job.lastRunAt)}</td>
                        <td className="p-4 text-emerald-400 font-bold">{job.runs?.[0]?.rowsWritten || 0}</td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => (isRunning ? handleStopRun(job) : handleStartRun(job))}
                              className="btn-primary !py-1.5 !px-3 text-xs"
                            >
                              {isRunning ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3 fill-current" />}
                            </button>
                            <button
                              onClick={() => openLogModal(job)}
                              className="p-1.5 rounded-lg bg-slate-900 text-slate-300 border border-slate-700"
                            >
                              <Terminal className="w-3.5 h-3.5" />
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
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title={`Delete "${selectedJob?.name}"?`}
        type="danger"
        footer={
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setDeleteModalOpen(false)} className="btn-ghost">
              Cancel
            </button>
            <button onClick={handleDeleteJob} className="btn-danger">
              Delete Job
            </button>
          </div>
        }
      >
        <p className="text-slate-300 text-sm">
          Are you sure you want to delete this job configuration? This will stop any running synchronizations.
        </p>
      </Modal>

      {/* Log Terminal Modal */}
      <Modal
        isOpen={errorsModalOpen}
        onClose={() => setErrorsModalOpen(false)}
        title={`Execution Logs - ${selectedJob?.name}`}
        maxWidth="max-w-3xl"
      >
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-slate-950 font-mono text-xs text-slate-300 border border-slate-800 space-y-2 max-h-[300px] overflow-y-auto">
            {viewErrors.length === 0 ? (
              <div className="text-slate-500 italic">No execution errors or logs recorded yet.</div>
            ) : (
              viewErrors.map((err, idx) => (
                <div key={idx} className="p-2 rounded bg-slate-900/60 border border-slate-800 space-y-1">
                  <div className="text-indigo-400 font-bold">[{err.chName}]</div>
                  <div className="text-slate-300">{err.error}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
