"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import Modal from "./Modal";
import { toast, ToastProvider } from "./Toast";



interface ChError {
  chName: string;
  error: string;
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
  spreadsheetId: string;
  reportingSheetGid: string | null;
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
  const [runModalOpen, setRunModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [errorsModalOpen, setErrorsModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JoinerJob | null>(null);
  const [viewErrors, setViewErrors] = useState<ChError[]>([]);
  const [viewStats, setViewStats] = useState<{ chName: string; count: number }[]>([]);
  const [statsModalOpen, setStatsModalOpen] = useState(false);

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
    } catch (error) {
      console.error("Failed to load jobs", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const startProgressPoller = useCallback((jobId: string) => {
    if (pollersRef.current.has(jobId)) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/progress`, { cache: "no-store" });
        if (!res.ok) return;
        const data: ProgressData = await res.json();

        setRunProgress(prev => {
          const next = new Map(prev);
          next.set(jobId, data);
          return next;
        });

        if (data.status !== "running") {
          clearInterval(pollersRef.current.get(jobId));
          pollersRef.current.delete(jobId);
          setTimeout(() => {
            setRunProgress(prev => {
              const next = new Map(prev);
              next.delete(jobId);
              return next;
            });
          }, 2000);
          fetchJobs();
        }
      } catch {}
    }, 1500);

    pollersRef.current.set(jobId, interval);
  }, [fetchJobs]);

  const stopProgressPoller = useCallback((jobId: string) => {
    const interval = pollersRef.current.get(jobId);
    if (interval) {
      clearInterval(interval);
      pollersRef.current.delete(jobId);
    }
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  useEffect(() => {
    jobs.forEach(job => {
      if (job.runs?.[0]?.status === "running") {
        startProgressPoller(job.id);
      }
    });
  }, [jobs, startProgressPoller]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") fetchJobs();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  useEffect(() => {
    return () => {
      pollersRef.current.forEach(interval => clearInterval(interval));
      pollersRef.current.clear();
    };
  }, []);

  const handleRunClick = (job: JoinerJob) => {
    setSelectedJob(job);
    setRunModalOpen(true);
  };

  const handleDeleteClick = (job: JoinerJob) => {
    setSelectedJob(job);
    setDeleteModalOpen(true);
  };

  const handleViewErrors = (job: JoinerJob) => {
    const run = job.runs?.[0];
    if (!run) return;
    const errs = typeof run.errors === "string" ? JSON.parse(run.errors) : run.errors;
    setViewErrors(errs || []);
    setSelectedJob(job);
    setErrorsModalOpen(true);
  };

  const handleViewStats = (job: JoinerJob) => {
    const run = job.runs?.[0];
    if (!run) return;
    const statsStr = (run as any).chStats;
    const stats = typeof statsStr === "string" ? JSON.parse(statsStr) : statsStr || [];
    setViewStats(stats);
    setStatsModalOpen(true);
  };

  const getErrorCount = (job: JoinerJob): number => {
    const run = job.runs?.[0];
    if (!run) return 0;
    try {
      const errs = typeof run.errors === "string" ? JSON.parse(run.errors) : run.errors;
      return Array.isArray(errs) ? errs.length : 0;
    } catch { return 0; }
  };

  const confirmRunJob = async () => {
    if (!selectedJob) return;
    const jobId = selectedJob.id;
    const jobName = selectedJob.name;
    setRunModalOpen(false);

    setRunProgress(prev => {
      const next = new Map(prev);
      next.set(jobId, { status: "running", progress: 0, progressMessage: "Starting..." });
      return next;
    });

    startProgressPoller(jobId);
    setTimeout(() => fetchJobs(), 1000);

    try {
      const res = await fetch(`/api/jobs/${jobId}/run`, { method: "POST" });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to run job");
      }
      const data = await res.json();
      const errCount = data.errors?.length || 0;
      if (errCount > 0) {
        toast(`"${jobName}" completed with ${errCount} CH error(s). Click errors to view.`, "info");
      } else {
        toast(`"${jobName}" completed! ${data.rowsWritten} rows written.`, "success");
      }
    } catch (error: any) {
      toast(error.message || "Error triggering job", "error");
      stopProgressPoller(jobId);
    }
    fetchJobs();
  };

  const confirmDeleteJob = async () => {
    if (!selectedJob) return;
    setDeleteModalOpen(false);
    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete job");
      stopProgressPoller(selectedJob.id);
      setJobs(jobs.filter(j => j.id !== selectedJob.id));
      toast(`Job "${selectedJob.name}" deleted.`, "info");
    } catch {
      toast("Could not delete the job.", "error");
    }
  };

  const getStatusBadge = (status: string | undefined) => {
    switch (status) {
      case "running":
        return <span className="badge-running"><span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />Running</span>;
      case "success":
        return <span className="badge-success"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Success</span>;
      case "failed":
        return <span className="badge-failed"><span className="w-1.5 h-1.5 rounded-full bg-red-400" />Failed</span>;
      default:
        return <span className="badge-pending"><span className="w-1.5 h-1.5 rounded-full bg-white/30" />Pending</span>;
    }
  };

  const getProgressData = (job: JoinerJob) => {
    const live = runProgress.get(job.id);
    if (live) return { progress: live.progress, progressMessage: live.progressMessage };
    const run = job.runs?.[0];
    return { progress: run?.progress ?? 0, progressMessage: run?.progressMessage ?? null };
  };

  const filteredJobs = jobs.filter(job =>
    job.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    job.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Stats
  const runningJobs = jobs.filter(j => getDisplayStatus(j) === "running").length;
  const successfulJobs = jobs.filter(j => getDisplayStatus(j) === "success").length;
  const totalErrors = jobs.reduce((acc, j) => acc + getErrorCount(j), 0);

  if (loading) return (
    <div className="flex flex-col justify-center items-center min-h-[60vh] gap-4 bg-[#09090b]">
      <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(245,158,11,0.5)]" />
      <div className="text-sm font-medium text-amber-500/40 animate-pulse uppercase tracking-widest font-mono">Loading Dashboard...</div>
    </div>
  );

  return (
    <>
      <ToastProvider />
      <div className="min-h-screen bg-[#09090b] relative overflow-hidden">
        {/* Dynamic Background */}
        <div className="fixed inset-0 -z-10 bg-[url('/grid.svg')] bg-[length:50px_50px] opacity-[0.02]" />
        <div className="fixed inset-0 -z-10">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-amber-600/5 rounded-full blur-[150px]" />
          <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-amber-900/10 rounded-full blur-[150px]" />
        </div>

        <div className="space-y-8 max-w-[1400px] mx-auto px-4 md:px-8 py-8 md:py-12 z-10 relative">
          {/* Top Bar */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 animate-fade-in pb-6 border-b border-white/5">
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight text-white flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                  <span className="w-3 h-3 rounded-sm bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.8)]" />
                </span>
                Dashboard
              </h1>
              <p className="text-white/40 mt-2 text-sm font-light">Manage your Diamond Rewards and PRL synchronization tasks.</p>
            </div>
            <div className="flex gap-4 items-center">
              <Link href="/jobs/new" className="relative group overflow-hidden rounded-xl p-[1px]">
                <span className="absolute inset-0 bg-gradient-to-r from-amber-400 via-amber-200 to-amber-500 opacity-60 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />
                <div className="relative flex items-center gap-2 px-5 py-2.5 bg-[#0A0A0A] rounded-xl group-hover:bg-[#111] transition-colors">
                  <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  <span className="text-white font-medium text-sm">New Sync Job</span>
                </div>
              </Link>
              <button onClick={() => signOut({ callbackUrl: "/" })} className="text-xs text-white/30 hover:text-white/80 uppercase tracking-widest font-mono transition-colors">Sign Out</button>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 animate-slide-up">
            <div className="bg-[#111116]/80 backdrop-blur-xl rounded-2xl p-6 border border-white/5 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-colors" />
              <div className="text-white/30 text-[10px] font-bold uppercase tracking-widest mb-3">Total Operations</div>
              <div className="text-4xl font-black text-white">{jobs.length}</div>
            </div>
            <div className="bg-[#111116]/80 backdrop-blur-xl rounded-2xl p-6 border border-white/5 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-colors" />
              <div className="text-white/30 text-[10px] font-bold uppercase tracking-widest mb-3">System Status</div>
              <div className="text-2xl font-bold text-white flex items-center gap-3">
                {runningJobs > 0 ? (
                  <><span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" /><span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.8)]" /></span><span className="text-amber-400">Active</span></>
                ) : (
                  <><span className="w-2 h-2 rounded-full bg-emerald-500/50" />Idle</>
                )}
              </div>
            </div>
            <div className="bg-[#111116]/80 backdrop-blur-xl rounded-2xl p-6 border border-white/5 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors" />
              <div className="text-white/30 text-[10px] font-bold uppercase tracking-widest mb-3">Successful Syncs</div>
              <div className="text-4xl font-black text-emerald-400/90">{successfulJobs}</div>
            </div>
            <div className="bg-[#111116]/80 backdrop-blur-xl rounded-2xl p-6 border border-white/5 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-2xl group-hover:bg-red-500/10 transition-colors" />
              <div className="text-white/30 text-[10px] font-bold uppercase tracking-widest mb-3">Failed Runs</div>
              <div className={`text-4xl font-black ${totalErrors > 0 ? "text-red-400/90 drop-shadow-[0_0_8px_rgba(248,113,113,0.5)]" : "text-white/10"}`}>{totalErrors}</div>
              {totalErrors > 0 && <div className="text-[10px] text-red-400/50 mt-2 uppercase tracking-wide">Sheets Inaccessible</div>}
            </div>
          </div>

          {/* Jobs List */}
          <div className="bg-[#111116]/50 backdrop-blur-2xl rounded-3xl overflow-hidden min-h-[400px] border border-white/5 animate-slide-up stagger-2 shadow-2xl">
            <div className="p-6 md:p-8 border-b border-white/[0.04] flex flex-col sm:flex-row justify-between items-center gap-4 bg-gradient-to-b from-white/[0.02] to-transparent">
              <h2 className="text-xl font-bold text-white tracking-tight">Active Sync Jobs</h2>
              <div className="relative w-full sm:w-80">
                <input
                  type="text"
                  placeholder="Search jobs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#0A0A0A] border border-white/10 rounded-xl py-3 pl-11 pr-4 text-sm text-white focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-all font-mono placeholder:text-white/20"
                />
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
            </div>

            {/* Cards view */}
            <div className="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
              {jobs.length === 0 ? (
                <div className="col-span-1 lg:col-span-2 text-center text-white/30 py-20 space-y-5">
                  <div className="w-20 h-20 mx-auto rounded-3xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-center shadow-inner">
                    <svg className="w-8 h-8 text-white/10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                  </div>
                  <p className="tracking-wide">No sync jobs available. Create one to get started.</p>
                  <Link href="/jobs/new" className="inline-block text-amber-500/80 hover:text-amber-400 font-medium text-sm transition-colors uppercase tracking-widest">Create New Job</Link>
                </div>
              ) : (
                filteredJobs.map(job => {
                  const displayStatus = getDisplayStatus(job);
                  const isRunning = displayStatus === "running";
                  const { progress, progressMessage } = getProgressData(job);
                  const errCount = getErrorCount(job);
                  
                  const chStatsStr = (job.runs?.[0] as any)?.chStats;
                  const chStats = typeof chStatsStr === "string" ? JSON.parse(chStatsStr) : chStatsStr || [];

                  return (
                    <div key={job.id} className="bg-[#111116] border border-white/5 rounded-2xl p-6 relative overflow-hidden group hover:border-amber-500/20 transition-all duration-300 shadow-xl">
                      {isRunning && <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-600 to-amber-400 animate-pulse" />}
                      <div className="flex justify-between items-start gap-4 mb-6">
                        <div className="flex-1">
                          <div className="font-bold text-white text-lg tracking-tight mb-1 truncate">{job.name}</div>
                          <div className="text-[10px] text-white/20 font-mono tracking-widest uppercase">JOB_ID: {job.id.split("-")[0]}</div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleRunClick(job)} className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-all border border-emerald-500/10 hover:border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.1)]" title="Run Job">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                          </button>
                          <Link href={`/jobs/${job.id}/edit`} className="p-2.5 rounded-xl bg-white/[0.04] text-white/60 hover:text-amber-400 hover:bg-amber-500/10 transition-all border border-white/[0.05] hover:border-amber-500/20" title="Edit">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          </Link>
                          <button onClick={() => handleDeleteClick(job)} className="p-2.5 rounded-xl bg-white/[0.04] text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all border border-white/[0.05] hover:border-red-500/20" title="Delete">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mb-6 flex-wrap">
                        <span className={`px-2.5 py-1 rounded-md text-[10px] uppercase tracking-widest font-bold border ${job.type === "diamonds" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-blue-500/10 text-blue-400 border-blue-500/20"}`}>
                          {job.type === "diamonds" ? "💎 Diamonds" : "📋 PRL"}
                        </span>
                        {getStatusBadge(displayStatus)}
                        {job.validationEnabled && (
                          <span className="px-2.5 py-1 rounded-md text-[10px] uppercase tracking-widest font-bold bg-white/5 text-white/50 border border-white/10">
                            ✓ MooGold
                          </span>
                        )}
                        {chStats && chStats.length > 0 && (
                          <button
                            onClick={() => handleViewStats(job)}
                            className="px-2.5 py-1 rounded-md text-[10px] uppercase tracking-widest font-bold bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors"
                          >
                            ✓ {chStats.length} CH COMPILED
                          </button>
                        )}
                        {errCount > 0 && (
                          <button
                            onClick={() => handleViewErrors(job)}
                            className="px-2.5 py-1 rounded-md text-[10px] uppercase tracking-widest font-bold bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                          >
                            ⚠ {errCount} FAULTS
                          </button>
                        )}
                      </div>

                      <div className="flex justify-between items-end">
                        <div className="text-[10px] text-white/30 tracking-wider">
                          <span className="block mb-1 opacity-50">LAST RUN</span>
                          {formatTimeAgo(job.lastRunAt)}
                        </div>
                        {job.targetSpreadsheetId && (
                          <a href={`https://docs.google.com/spreadsheets/d/${job.targetSpreadsheetId}`} target="_blank" rel="noopener noreferrer" className="group/link text-[11px] font-medium text-amber-500 flex items-center gap-1.5 bg-amber-500/5 hover:bg-amber-500/10 px-3 py-1.5 rounded-lg transition-colors border border-amber-500/10 uppercase tracking-wide">
                            View Sheet
                            <svg className="w-3 h-3 group-hover/link:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                          </a>
                        )}
                      </div>

                      {isRunning && (
                        <div className="mt-5 space-y-2">
                          <div className="flex justify-between text-[10px] tracking-wide uppercase">
                            <span className="text-amber-500/80">{progressMessage || "Processing..."}</span>
                            <span className="text-amber-400 font-mono font-bold">{progress}%</span>
                          </div>
                          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-500 transition-all duration-300 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.5)]" style={{ width: `${progress}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Modals */}
        <Modal
          isOpen={runModalOpen}
          onClose={() => setRunModalOpen(false)}
          title="Run Sync Job"
          footer={
            <div className="flex gap-3 justify-end w-full">
              <button onClick={() => setRunModalOpen(false)} className="px-5 py-2.5 rounded-xl font-semibold text-white/50 hover:text-white hover:bg-white/5 transition-colors">Cancel</button>
              <button onClick={confirmRunJob} className="px-5 py-2.5 rounded-xl font-bold bg-amber-500 text-amber-950 hover:bg-amber-400 transition-colors shadow-[0_0_15px_rgba(245,158,11,0.3)]">Run Now</button>
            </div>
          }
        >
          <p className="text-white/50 text-sm leading-relaxed">
            Begin synchronization protocol for <strong className="text-amber-400">{selectedJob?.name}</strong>? This process will read from the CH reporting sheets and automatically generate your final {selectedJob?.type === "diamonds" ? "Diamond Rewards" : "PRL"} sheet.
          </p>
        </Modal>

        <Modal
          isOpen={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          title="Delete Job"
          type="danger"
          footer={
            <div className="flex gap-3 justify-end w-full">
              <button onClick={() => setDeleteModalOpen(false)} className="px-5 py-2.5 rounded-xl font-semibold text-white/50 hover:text-white hover:bg-white/5 transition-colors">Cancel</button>
              <button onClick={confirmDeleteJob} className="px-5 py-2.5 rounded-xl font-bold bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors">Delete Job</button>
            </div>
          }
        >
          <p className="text-white/50 text-sm">
            Are you sure you want to permanently delete <strong className="text-white">{selectedJob?.name}</strong>? This action cannot be undone.
          </p>
        </Modal>

        <Modal
          isOpen={errorsModalOpen}
          onClose={() => setErrorsModalOpen(false)}
          title="Operation Fault Log"
          maxWidth="max-w-3xl"
          footer={
            <div className="flex justify-end w-full">
              <button onClick={() => setErrorsModalOpen(false)} className="px-5 py-2.5 rounded-xl font-semibold bg-white/5 text-white/80 hover:bg-white/10 transition-colors">Acknowledge</button>
            </div>
          }
        >
          <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
            {viewErrors.length === 0 ? (
              <p className="text-white/40 text-sm">All nodes operating nominally.</p>
            ) : (
              (() => {
                const playerFaults = viewErrors.filter(err => 
                  err.error.toLowerCase().includes("duplicate")
                );
                const systemFaults = viewErrors.filter(err => 
                  !err.error.toLowerCase().includes("duplicate")
                );

                return (
                  <>
                    {playerFaults.length > 0 && (
                      <div className="space-y-3 max-w-full">
                        <h4 className="text-amber-500 font-bold text-xs uppercase tracking-widest flex items-center gap-2 mb-2">
                           <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Player Faults ({playerFaults.length})
                        </h4>
                        {playerFaults.map((err, i) => (
                          <div key={`p-${i}`} className="p-4 rounded-xl bg-[#1A1111] border border-amber-500/20 relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-6">
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500/50" />
                            <div className="text-sm font-bold text-white tracking-wide shrink-0">{err.chName}</div>
                            <div className="text-xs text-amber-300/80 leading-relaxed font-mono sm:text-right break-words">{err.error}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {systemFaults.length > 0 && (
                       <div className="space-y-3 max-w-full">
                         <h4 className="text-red-500 font-bold text-xs uppercase tracking-widest flex items-center gap-2 mb-2 mt-4">
                           <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> System Faults ({systemFaults.length})
                         </h4>
                         {systemFaults.map((err, i) => (
                           <div key={`s-${i}`} className="p-4 rounded-xl bg-[#1A1111] border border-red-500/20 relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-6">
                             <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500/50" />
                             <div className="text-sm font-bold text-white tracking-wide shrink-0">{err.chName}</div>
                             <div className="text-xs text-red-300/80 leading-relaxed font-mono sm:text-right break-words">{err.error}</div>
                           </div>
                         ))}
                       </div>
                    )}
                  </>
                );
              })()
            )}
          </div>
          <p className="text-[10px] text-white/20 mt-4 uppercase tracking-widest font-mono">
            Check Node Access Clearance. "Anyone with link" required.
          </p>
        </Modal>

        <Modal
          isOpen={statsModalOpen}
          onClose={() => setStatsModalOpen(false)}
          title="Compilation Report"
          footer={
            <div className="flex justify-end w-full">
              <button 
                onClick={() => setStatsModalOpen(false)} 
                className="px-5 py-2.5 rounded-xl font-semibold bg-white/5 text-white/80 hover:bg-white/10 transition-colors"
              >
                Close
              </button>
            </div>
          }
        >
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
            {viewStats.length === 0 ? (
              <p className="text-white/40 text-sm">No statistics available.</p>
            ) : (
              <div className="space-y-2">
                {viewStats.map((stat, i) => (
                  <div key={i} className="bg-white/5 border border-white/10 p-4 rounded-xl flex justify-between items-center group hover:bg-white/10 transition-colors">
                    <span className="font-bold text-white tracking-wide">{stat.chName}</span>
                    <span className="text-xs px-2.5 py-1 rounded-md bg-white/5 border border-white/10 font-mono text-white/60 tracking-widest uppercase">
                      {stat.count} {stat.count === 1 ? 'Team/Player' : 'Teams/Players'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      </div>
    </>
  );
}
