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
            <h2 className="text-2xl font-bold text-white tracking-tight">{isEditing ? "Edit" : "New"} Joiner Job</h2>
            <p className="text-white/40 mt-1 text-sm">{isEditing ? "Update your joiner job settings." : "Consolidate sheets from multiple CHs into one."}</p>
          </div>
          <Link href="/dashboard" className="btn-ghost">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Dashboard
          </Link>
        </div>

        <div className="glass-panel rounded-2xl p-6 md:p-8 space-y-8">
          {/* Step 1: Type & Name */}
          <div className="space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 text-xs font-bold">1</div>
              <span className="text-sm font-semibold text-white">Job Details</span>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-white/80">Job Name *</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="input-field"
                placeholder="e.g. March 2026 Event"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-white/80">Job Type</label>
              <div className="grid grid-cols-2 gap-3">
                <label className={`relative flex items-center justify-center p-4 rounded-xl border cursor-pointer transition-all duration-200 gap-3 ${
                  type === "diamonds"
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-lg shadow-amber-500/5"
                    : "bg-white/[0.03] border-white/[0.08] text-white/40 hover:bg-white/[0.06]"
                }`}>
                  <input type="radio" value="diamonds" checked={type === "diamonds"} onChange={() => setType("diamonds")} className="sr-only" />
                  <span className="text-xl">💎</span>
                  <div>
                    <span className="block text-sm font-semibold">Diamond Rewards</span>
                    <span className="block text-[10px] text-white/30 mt-0.5">NAME, SERVER, UID, CODE, AMOUNT</span>
                  </div>
                </label>
                <label className={`relative flex items-center justify-center p-4 rounded-xl border cursor-pointer transition-all duration-200 gap-3 ${
                  type === "prl"
                    ? "bg-violet-500/10 border-violet-500/30 text-violet-400 shadow-lg shadow-violet-500/5"
                    : "bg-white/[0.03] border-white/[0.08] text-white/40 hover:bg-white/[0.06]"
                }`}>
                  <input type="radio" value="prl" checked={type === "prl"} onChange={() => setType("prl")} className="sr-only" />
                  <span className="text-xl">📋</span>
                  <div>
                    <span className="block text-sm font-semibold">Pre-Registered List</span>
                    <span className="block text-[10px] text-white/30 mt-0.5">Players Name, IGN, Server, UID</span>
                  </div>
                </label>
              </div>
            </div>

            <div className="space-y-3 animate-fade-in pl-1">
              <label className="text-sm font-medium text-white/80">Tournament Format</label>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {["5v5", "3v3", "2v2", "1v1", "Onsite 5v5"].map((mode) => (
                  <label key={mode} className={`relative flex items-center justify-center p-3 rounded-xl border cursor-pointer transition-all duration-200 ${
                    gameMode === mode
                      ? "bg-violet-500/10 border-violet-500/30 text-violet-400 shadow-lg shadow-violet-500/5"
                      : "bg-white/[0.03] border-white/[0.08] text-white/40 hover:bg-white/[0.06]"
                  }`}>
                    <input type="radio" value={mode} checked={gameMode === mode} onChange={() => setGameMode(mode)} className="sr-only" />
                    <span className="text-sm font-bold tracking-wide text-center whitespace-nowrap">{mode}</span>
                  </label>
                ))}
              </div>
              <div className="flex items-start gap-2 pt-1">
                <svg className="w-3.5 h-3.5 text-white/30 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p className="text-[11px] text-white/30 leading-tight">
                  Sets extraction columns and constraints.<br/>
                  <span className="text-white/40 font-medium">Standard = 50 min. Onsite = 25 min.</span>
                </p>
              </div>
            </div>
          </div>

          <div className="h-px bg-white/[0.06]" />

          {/* Step 2: Reporting Sheet */}
          <div className="space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400 text-xs font-bold">2</div>
              <span className="text-sm font-semibold text-white">Reporting Sheet</span>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-white/80">Overall Reporting Sheet URL *</label>
              <input
                value={reportingSheetUrl}
                onChange={e => setReportingSheetUrl(e.target.value)}
                className="input-field font-mono !text-xs"
                placeholder="https://docs.google.com/spreadsheets/d/.../edit?gid=..."
              />
              <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
                <svg className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <div className="text-[11px] text-blue-300/60 leading-relaxed">
                  <strong className="text-blue-300/80">Paste the full URL</strong> including the <code className="text-blue-300/70 bg-blue-500/10 px-1 rounded">?gid=...</code> tab ID.
                  <br />The app will read <strong>Column D</strong> (CH Nickname) and <strong>Column {
                    type === "diamonds" 
                      ? (gameMode === "Onsite 5v5" ? "S" : ["1v1", "2v2", "3v3"].includes(gameMode) ? "O" : "M") 
                      : (gameMode === "Onsite 5v5" ? "N" : ["1v1", "2v2", "3v3"].includes(gameMode) ? "J" : "K")
                  }</strong> ({type === "diamonds" ? "Diamond Winners Sheet" : "PRL"} links) starting from <strong>row 4</strong>.
                  <br />CHs marked as DISSOLVED or without a link are automatically skipped.
                </div>
              </div>
            </div>
          </div>

          <div className="h-px bg-white/[0.06]" />

          {/* Step 3: Target & Options */}
          <div className="space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 text-xs font-bold">3</div>
              <span className="text-sm font-semibold text-white">Target & Options</span>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-white/80">Target Spreadsheet Name {!isEditing && "*"}</label>
              <input
                value={targetName}
                onChange={e => setTargetName(e.target.value)}
                className="input-field"
                placeholder={isEditing ? "(leave blank to keep current)" : "e.g. Consolidated PRL - March 2026"}
              />
              {!isEditing && (
                <p className="text-[10px] text-white/25 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  A new Google Sheet with this name will be created in your Drive.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-white/80">Tab Name</label>
              <input
                value={sheetName}
                onChange={e => setSheetName(e.target.value)}
                className="input-field"
                placeholder={defaultSheetName}
              />
            </div>

            <label className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] cursor-pointer hover:bg-white/[0.05] transition-all group">
              <input
                type="checkbox"
                checked={validationEnabled}
                onChange={e => setValidationEnabled(e.target.checked)}
                className="w-5 h-5 rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500/50 cursor-pointer"
              />
              <div>
                <span className="block text-sm font-medium text-white group-hover:text-white/90">Enable MooGold Verification</span>
                <span className="block text-xs text-white/30 mt-0.5">Optionally verify Server & UID via MooGold API (slower)</span>
              </div>
            </label>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary !py-3 !px-8"
          >
            {submitting ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                {isEditing ? "Saving..." : "Creating..."}
              </>
            ) : (
              <>
                {isEditing ? "Save Changes" : "Create Joiner Job"}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
              </>
            )}
          </button>
        </div>
      </form>
    </>
  );
}
