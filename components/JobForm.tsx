"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { ToastProvider, toast } from "./Toast";

interface JobFormProps {
  editJobId?: string;
}

export function JobForm({ editJobId }: JobFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(!!editJobId);
  const [name, setName] = useState("");
  const [type, setType] = useState<"diamonds" | "prl">("diamonds");
  const [reportingSheetUrl, setReportingSheetUrl] = useState("");
  const [targetName, setTargetName] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [validationEnabled, setValidationEnabled] = useState(false);
  const [gameMode, setGameMode] = useState("5v5");

  const isEditing = !!editJobId;
  const defaultSheetName = type === "diamonds" ? "Diamond Rewards" : "Pre Registered List";

  // Load existing job data when editing
  useEffect(() => {
    if (!editJobId) return;
    (async () => {
      try {
        const res = await fetch(`/api/jobs/${editJobId}`);
        if (!res.ok) throw new Error("Failed to load job");
        const job = await res.json();
        setName(job.name);
        setType(job.type);
        setSheetName(job.sheetName || "");
        setValidationEnabled(job.validationEnabled);
        setGameMode(job.gameMode || "5v5");
        setTargetName(job.targetSpreadsheetName || "");
        // Reconstruct reporting sheet URL
        const gidPart = job.reportingSheetGid ? `#gid=${job.reportingSheetGid}` : "";
        setReportingSheetUrl(`https://docs.google.com/spreadsheets/d/${job.spreadsheetId}/edit${gidPart}`);
      } catch (e: any) {
        toast(e.message || "Failed to load job", "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [editJobId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !reportingSheetUrl.trim() || (!isEditing && !targetName.trim())) {
      toast("Please fill in all required fields.", "error");
      return;
    }

    setSubmitting(true);
    try {
      if (isEditing) {
        // Parse URL for spreadsheetId and GID
        const match = reportingSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        const gidMatch = reportingSheetUrl.match(/[?&#]gid=(\d+)/);

        const res = await fetch(`/api/jobs/${editJobId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            type,
            spreadsheetId: match?.[1],
            reportingSheetGid: gidMatch?.[1] || null,
            targetSpreadsheetName: targetName || undefined,
            sheetName: sheetName || defaultSheetName,
            validationEnabled,
            gameMode,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to update job");
        }
        toast("Job updated!", "success");
      } else {
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            type,
            reportingSheetUrl,
            targetSpreadsheetName: targetName,
            sheetName: sheetName || defaultSheetName,
            validationEnabled,
            gameMode,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to create job");
        }
        toast("Job created!", "success");
      }
      router.push("/dashboard");
    } catch (error: any) {
      toast(error.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="flex flex-col justify-center items-center min-h-[60vh] gap-4">
      <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <div className="text-sm font-medium text-white/40 animate-pulse">Loading job...</div>
    </div>
  );

  return (
    <>
      <ToastProvider />
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto px-4 py-6 md:py-10 space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-3xl font-extrabold text-slate-50 tracking-tight">{isEditing ? "Edit" : "New"} Sync Job</h2>
            <p className="text-slate-400 mt-2 text-sm font-medium">{isEditing ? "Update your synchronization configurations." : "Consolidate sheets from multiple CHs into one."}</p>
          </div>
          <Link href="/dashboard" className="btn-ghost">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Dashboard
          </Link>
        </div>

        <div className="bg-slate-800 rounded-3xl p-6 md:p-10 space-y-12 shadow-2xl shadow-indigo-500/5 border border-slate-700/50">
          
          {/* Stepper Header */}
          <div className="w-full relative flex items-center justify-between max-w-lg mx-auto mb-16 mt-4">
             <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-[2px] bg-slate-700/50 -z-10" />
             <div className="flex flex-col items-center relative z-10">
               <div className="w-10 h-10 rounded-full bg-indigo-500 border-4 border-slate-800 flex items-center justify-center text-slate-50 font-bold shadow-lg shadow-indigo-500/20">1</div>
               <span className="text-xs font-bold text-indigo-400 absolute -bottom-8 whitespace-nowrap">Job Details</span>
             </div>
             <div className="flex flex-col items-center relative z-10">
               <div className="w-10 h-10 rounded-full bg-indigo-500 border-4 border-slate-800 flex items-center justify-center text-slate-50 font-bold shadow-lg shadow-indigo-500/20">2</div>
               <span className="text-xs font-bold text-indigo-400 absolute -bottom-8 whitespace-nowrap">Reporting Sheet</span>
             </div>
             <div className="flex flex-col items-center relative z-10">
               <div className="w-10 h-10 rounded-full bg-indigo-500 border-4 border-slate-800 flex items-center justify-center text-slate-50 font-bold shadow-lg shadow-indigo-500/20">3</div>
               <span className="text-xs font-bold text-indigo-400 absolute -bottom-8 whitespace-nowrap">Targets & Options</span>
             </div>
          </div>

          {/* Step 1: Type & Name */}
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-slate-50 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Basic Details
            </h3>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-300">Job Name *</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="input-field"
                placeholder="e.g. March 2026 Event"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-300">Job Type</label>
              <div className="grid grid-cols-2 gap-3">
                <label className={`relative flex items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 gap-3 ${
                  type === "diamonds"
                    ? "bg-indigo-500/10 border-indigo-500/50 text-indigo-400 shadow-lg shadow-indigo-500/10"
                    : "bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800"
                }`}>
                  <input type="radio" value="diamonds" checked={type === "diamonds"} onChange={() => setType("diamonds")} className="sr-only" />
                  <span className="text-xl">💎</span>
                  <div>
                    <span className="block text-sm font-bold text-slate-50">Diamond Rewards</span>
                    <span className="block text-[10px] text-slate-500 font-mono mt-0.5">NAME, SERVER, UID, CODE, AMOUNT</span>
                  </div>
                </label>
                <label className={`relative flex items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 gap-3 ${
                  type === "prl"
                    ? "bg-indigo-500/10 border-indigo-500/50 text-indigo-400 shadow-lg shadow-indigo-500/10"
                    : "bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800"
                }`}>
                  <input type="radio" value="prl" checked={type === "prl"} onChange={() => setType("prl")} className="sr-only" />
                  <span className="text-xl">📋</span>
                  <div>
                    <span className="block text-sm font-bold text-slate-50">Pre-Registered List</span>
                    <span className="block text-[10px] text-slate-500 font-mono mt-0.5">Players Name, IGN, Server, UID</span>
                  </div>
                </label>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <label className="text-sm font-semibold text-slate-300">Tournament Format</label>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {["5v5", "3v3", "2v2", "1v1", "Onsite 5v5"].map((mode) => (
                  <label key={mode} className={`relative flex items-center justify-center p-3 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                    gameMode === mode
                      ? "bg-indigo-500/10 border-indigo-500/50 text-indigo-400 shadow-md shadow-indigo-500/10"
                      : "bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  }`}>
                    <input type="radio" value={mode} checked={gameMode === mode} onChange={() => setGameMode(mode)} className="sr-only" />
                    <span className={`text-sm tracking-wide ${gameMode === mode ? "font-bold" : "font-medium"}`}>{mode}</span>
                  </label>
                ))}
              </div>
              <div className="flex items-start gap-2 pt-2">
                <svg className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p className="text-[11px] text-slate-400 leading-tight">
                  Sets extraction columns and constraints.<br/>
                  <span className="text-slate-300 font-medium">Standard = 50 min. Onsite = 25 min.</span>
                </p>
              </div>
            </div>
          </div>

          <div className="h-px bg-slate-700/50" />

          {/* Step 2: Reporting Sheet */}
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-slate-50 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
              Source Reporting Sheet
            </h3>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-300">Overall Reporting Sheet URL *</label>
              <input
                value={reportingSheetUrl}
                onChange={e => setReportingSheetUrl(e.target.value)}
                className="input-field font-mono !text-xs !py-4"
                placeholder="https://docs.google.com/spreadsheets/d/.../edit?gid=..."
              />
              <div className="flex items-start gap-3 p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 mt-3">
                <svg className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <div className="text-xs text-indigo-300/80 leading-relaxed font-medium">
                  <strong className="text-indigo-300">Paste the full URL</strong> including the <code className="text-indigo-200 bg-indigo-500/20 px-1.5 py-0.5 rounded ml-1 mr-1">?gid=...</code> tab ID.
                  <div className="mt-2 text-indigo-300/60 font-normal">
                    The app will read <strong>Column D</strong> (CH Nickname) and <strong>Column {
                      type === "diamonds" 
                        ? (gameMode === "Onsite 5v5" ? "S" : ["1v1", "2v2", "3v3"].includes(gameMode) ? "O" : "M") 
                        : (gameMode === "Onsite 5v5" ? "N" : ["1v1", "2v2", "3v3"].includes(gameMode) ? "J" : "H")
                    }</strong> ({type === "diamonds" ? "Diamond Winners Sheet" : "PRL"} links) starting from <strong>row 4</strong>.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="h-px bg-slate-700/50" />

          {/* Step 3: Target & Options */}
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-slate-50 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
              Target & Options
            </h3>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-300">Target Spreadsheet Name {!isEditing && "*"}</label>
              <input
                value={targetName}
                onChange={e => setTargetName(e.target.value)}
                className="input-field"
                placeholder={isEditing ? "(leave blank to keep current)" : "e.g. Consolidated PRL - March 2026"}
              />
              {!isEditing && (
                <p className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-1.5 font-medium">
                  <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  A new Google Sheet with this name will be created in your Drive.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-300">Tab Name</label>
              <input
                value={sheetName}
                onChange={e => setSheetName(e.target.value)}
                className="input-field"
                placeholder={defaultSheetName}
              />
            </div>

            <label className="flex items-center gap-4 p-4 rounded-xl bg-slate-900 border border-slate-700 cursor-pointer hover:border-indigo-500/50 transition-all group">
              <input
                type="checkbox"
                checked={validationEnabled}
                onChange={e => setValidationEnabled(e.target.checked)}
                className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500/50 cursor-pointer"
              />
              <div>
                <span className="block text-sm font-bold text-slate-50 group-hover:text-indigo-400 transition-colors">Enable MooGold Verification</span>
                <span className="block text-[11px] text-slate-400 mt-1 font-medium">Optionally verify Server & UID via MooGold API</span>
              </div>
            </label>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary"
          >
            {submitting ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                {isEditing ? "Saving Changes..." : "Creating Job..."}
              </>
            ) : (
              <>
                {isEditing ? "Save Changes" : "Create Sync Job"}
                <svg className="w-5 h-5 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
              </>
            )}
          </button>
        </div>
      </form>
    </>
  );
}
