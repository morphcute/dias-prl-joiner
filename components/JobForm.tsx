"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { ToastProvider, toast } from "./Toast";
import { Background3D } from "./Background3D";
import {
  Sparkles,
  ArrowLeft,
  FileSpreadsheet,
  Layers,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Zap,
  Globe,
  PlusCircle,
  Save,
  Gamepad2,
  Link2,
  Copy,
  Info,
  ChevronRight,
  Database,
} from "lucide-react";

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
  const [secondaryReportingSheetUrl, setSecondaryReportingSheetUrl] = useState("");
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
        if (!res.ok) throw new Error("Failed to load job configuration");
        const job = await res.json();
        setName(job.name);
        setType(job.type);
        setSheetName(job.sheetName || "");
        setValidationEnabled(job.validationEnabled);
        setGameMode(job.gameMode || "5v5");
        setTargetName(job.targetSpreadsheetName || "");

        const gidPart = job.reportingSheetGid ? `#gid=${job.reportingSheetGid}` : "";
        setReportingSheetUrl(`https://docs.google.com/spreadsheets/d/${job.spreadsheetId}/edit${gidPart}`);

        if (job.secondarySpreadsheetId) {
          const secGid = job.secondaryReportingSheetGid ? `#gid=${job.secondaryReportingSheetGid}` : "";
          setSecondaryReportingSheetUrl(`https://docs.google.com/spreadsheets/d/${job.secondarySpreadsheetId}/edit${secGid}`);
        }
      } catch (e: any) {
        toast(e.message || "Failed to load job configuration", "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [editJobId]);

  // URL parser preview helper
  const parsedPrimary = reportingSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const parsedPrimaryGid = reportingSheetUrl.match(/[?&#]gid=(\d+)/);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !reportingSheetUrl.trim() || (!isEditing && !targetName.trim())) {
      toast("Please complete all required fields (*)", "error");
      return;
    }

    setSubmitting(true);
    try {
      if (isEditing) {
        const match = reportingSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        const gidMatch = reportingSheetUrl.match(/[?&#]gid=(\d+)/);

        let secMatch: RegExpMatchArray | null = null;
        let secGidMatch: RegExpMatchArray | null = null;
        if (secondaryReportingSheetUrl.trim()) {
          secMatch = secondaryReportingSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
          secGidMatch = secondaryReportingSheetUrl.match(/[?&#]gid=(\d+)/);
        }

        const res = await fetch(`/api/jobs/${editJobId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            type,
            spreadsheetId: match?.[1],
            reportingSheetGid: gidMatch?.[1] || null,
            secondarySpreadsheetId: secMatch?.[1] || null,
            secondaryReportingSheetGid: secGidMatch?.[1] || null,
            targetSpreadsheetName: targetName || undefined,
            sheetName: sheetName || defaultSheetName,
            validationEnabled,
            gameMode,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to update job configuration");
        }
        toast("Job configuration saved successfully!", "success");
      } else {
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            type,
            reportingSheetUrl,
            secondaryReportingSheetUrl: secondaryReportingSheetUrl.trim() || undefined,
            targetSpreadsheetName: targetName,
            sheetName: sheetName || defaultSheetName,
            validationEnabled,
            gameMode,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to initialize job");
        }
        toast("New Sync Job created successfully!", "success");
      }
      router.push("/dashboard");
    } catch (error: any) {
      toast(error.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[70vh] gap-4">
        <Background3D />
        <div className="relative w-14 h-14">
          <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full" />
          <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin glow-indigo" />
        </div>
        <div className="text-sm font-bold tracking-widest uppercase text-indigo-400 animate-pulse">
          Loading Job Configuration...
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen pb-20 selection:bg-indigo-500/40">
      <Background3D />
      <ToastProvider />

      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto px-4 py-8 md:py-12 space-y-8 animate-fade-in">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 glass-panel-3d p-6 rounded-3xl border border-slate-700/60 shadow-2xl">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold tracking-widest uppercase px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {isEditing ? "Configuration Mode" : "New Job Studio"}
              </span>
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
              {isEditing ? "Edit Sync Job" : "Create New Sync Job"}
            </h1>
            <p className="text-xs text-slate-400 font-medium">
              {isEditing
                ? "Update multi-source CH Google Sheet synchronization parameters."
                : "Consolidate Diamond Rewards & PRL Google Sheets across multiple CH Handlers into a single target sheet."}
            </p>
          </div>

          <Link href="/dashboard" className="btn-ghost">
            <ArrowLeft className="w-4 h-4" />
            <span>Dashboard</span>
          </Link>
        </div>

        {/* Step Progress Stepper */}
        <div className="glass-panel-3d p-6 rounded-3xl border border-slate-700/60 shadow-xl">
          <div className="relative flex items-center justify-between max-w-2xl mx-auto">
            {/* Stepper Progress Bar Line */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-800 rounded-full -z-10" />
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400 rounded-full -z-10 transition-all duration-500"
              style={{
                width: reportingSheetUrl.trim()
                  ? targetName.trim() || isEditing
                    ? "100%"
                    : "50%"
                  : "0%",
              }}
            />

            {/* Step 1 Circle */}
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 border-2 border-indigo-400 flex items-center justify-center text-white font-black shadow-lg shadow-indigo-500/30">
                1
              </div>
              <span className="text-xs font-extrabold text-indigo-300">Basic Details</span>
            </div>

            {/* Step 2 Circle */}
            <div className="flex flex-col items-center gap-2">
              <div
                className={`w-12 h-12 rounded-2xl border-2 flex items-center justify-center font-black transition-all duration-300 ${
                  reportingSheetUrl.trim()
                    ? "bg-gradient-to-tr from-indigo-600 to-cyan-500 border-cyan-400 text-white shadow-lg shadow-cyan-500/30"
                    : "bg-slate-900 border-slate-700 text-slate-500"
                }`}
              >
                2
              </div>
              <span
                className={`text-xs font-extrabold transition-colors ${
                  reportingSheetUrl.trim() ? "text-cyan-300" : "text-slate-500"
                }`}
              >
                Reporting Sheets
              </span>
            </div>

            {/* Step 3 Circle */}
            <div className="flex flex-col items-center gap-2">
              <div
                className={`w-12 h-12 rounded-2xl border-2 flex items-center justify-center font-black transition-all duration-300 ${
                  targetName.trim() || isEditing
                    ? "bg-gradient-to-tr from-cyan-500 to-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/30"
                    : "bg-slate-900 border-slate-700 text-slate-500"
                }`}
              >
                3
              </div>
              <span
                className={`text-xs font-extrabold transition-colors ${
                  targetName.trim() || isEditing ? "text-emerald-300" : "text-slate-500"
                }`}
              >
                Target & Options
              </span>
            </div>
          </div>
        </div>

        {/* Form Container */}
        <div className="glass-panel-3d rounded-3xl p-6 md:p-10 space-y-10 border border-slate-700/60 shadow-2xl relative overflow-hidden">
          
          {/* STEP 1: Basic Details & Job Type */}
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-sm">
                  1
                </div>
                <div>
                  <h2 className="text-xl font-black text-white tracking-tight">Job Name & Extraction Type</h2>
                  <p className="text-xs text-slate-400">Configure job identification and data extraction format.</p>
                </div>
              </div>
            </div>

            {/* Job Name Input */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between">
                <span>Job Name *</span>
                <span className="text-[11px] text-slate-500 font-normal">Give your sync job a descriptive title</span>
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field text-base font-semibold"
                placeholder="e.g. March 2026 Grand Tournament"
              />
            </div>

            {/* Interactive Job Type Cards */}
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Extraction Type *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label
                  className={`glass-card-3d relative p-6 rounded-3xl cursor-pointer transition-all duration-300 flex items-start gap-4 ${
                    type === "diamonds"
                      ? "border-amber-500/60 bg-amber-500/10 shadow-[0_0_30px_rgba(245,158,11,0.2)] ring-2 ring-amber-500/40"
                      : "hover:border-slate-600"
                  }`}
                >
                  <input
                    type="radio"
                    name="jobType"
                    value="diamonds"
                    checked={type === "diamonds"}
                    onChange={() => setType("diamonds")}
                    className="sr-only"
                  />
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-3xl shrink-0 shadow-lg shadow-amber-500/10">
                    💎
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-white text-base">Diamond Rewards</span>
                      {type === "diamonds" && (
                        <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 font-medium leading-relaxed">
                      Extracts Diamond winner tables into consolidated columns:
                    </p>
                    <div className="pt-1 font-mono text-[10px] text-amber-300/90 font-bold bg-slate-950/60 p-2 rounded-xl border border-amber-500/20">
                      NAME, SERVER, UID, REWARD CODE, AMOUNT
                    </div>
                  </div>
                </label>

                <label
                  className={`glass-card-3d relative p-6 rounded-3xl cursor-pointer transition-all duration-300 flex items-start gap-4 ${
                    type === "prl"
                      ? "border-indigo-500/60 bg-indigo-500/10 shadow-[0_0_30px_rgba(99,102,241,0.2)] ring-2 ring-indigo-500/40"
                      : "hover:border-slate-600"
                  }`}
                >
                  <input
                    type="radio"
                    name="jobType"
                    value="prl"
                    checked={type === "prl"}
                    onChange={() => setType("prl")}
                    className="sr-only"
                  />
                  <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-3xl shrink-0 shadow-lg shadow-indigo-500/10">
                    📋
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-white text-base">Pre-Registered List</span>
                      {type === "prl" && (
                        <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 uppercase">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 font-medium leading-relaxed">
                      Extracts roster entries from CH response sheets into:
                    </p>
                    <div className="pt-1 font-mono text-[10px] text-indigo-300/90 font-bold bg-slate-950/60 p-2 rounded-xl border border-indigo-500/20">
                      PLAYER NAME, IGN, SERVER, USER ID
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* Tournament Format Selector Matrix */}
            <div className="space-y-3 pt-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Gamepad2 className="w-4 h-4 text-indigo-400" />
                Tournament Format & Constraints
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {["5v5", "3v3", "2v2", "1v1", "Onsite 5v5"].map((mode) => (
                  <label
                    key={mode}
                    className={`relative p-3.5 rounded-2xl border cursor-pointer text-center transition-all duration-200 ${
                      gameMode === mode
                        ? "bg-indigo-600/20 border-indigo-500 text-indigo-300 font-extrabold shadow-lg shadow-indigo-500/20 ring-1 ring-indigo-500/50"
                        : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name="gameMode"
                      value={mode}
                      checked={gameMode === mode}
                      onChange={() => setGameMode(mode)}
                      className="sr-only"
                    />
                    <span className="text-xs tracking-wider">{mode}</span>
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-1">
                <HelpCircle className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>
                  Standard formats set a 50-minute execution limit; Onsite formats set a 25-minute execution limit.
                </span>
              </p>
            </div>
          </div>

          {/* STEP 2: Source Google Sheets */}
          <div className="space-y-6 pt-6 border-t border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold text-sm">
                  2
                </div>
                <div>
                  <h2 className="text-xl font-black text-white tracking-tight">Source Reporting Sheets</h2>
                  <p className="text-xs text-slate-400">Paste official and optional trainee reporting Google Sheet URLs.</p>
                </div>
              </div>
            </div>

            {/* 1st Official Sheet URL */}
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between">
                <span>1st Source: Official Reporting Sheet URL *</span>
                {parsedPrimary && (
                  <span className="text-[10px] text-emerald-400 font-mono font-bold flex items-center gap-1 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                    <CheckCircle2 className="w-3 h-3" /> GID Found: {parsedPrimaryGid?.[1] || "0"}
                  </span>
                )}
              </label>

              <div className="relative">
                <input
                  value={reportingSheetUrl}
                  onChange={(e) => setReportingSheetUrl(e.target.value)}
                  className="input-field font-mono !text-xs !py-4"
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit?gid=... (Official Sheet)"
                />
              </div>

              {/* Column Auto-Detection Box */}
              <div className="p-5 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span className="text-xs font-bold text-indigo-200">
                    Smart Column Detection Active
                  </span>
                </div>
                <div className="text-xs text-indigo-300/80 leading-relaxed bg-slate-950/70 p-3.5 rounded-xl border border-indigo-500/10 space-y-1.5">
                  <p className="text-white font-semibold">The engine automatically scans the sheet headers for:</p>
                  <div className="flex flex-wrap gap-2 pt-1 font-mono text-[11px]">
                    <span className="px-2 py-1 rounded bg-indigo-500/20 text-indigo-200 border border-indigo-500/30">
                      CH Nickname
                    </span>
                    <span className="px-2 py-1 rounded bg-indigo-500/20 text-indigo-200 border border-indigo-500/30">
                      Tournament Response Sheet
                    </span>
                    <span className="px-2 py-1 rounded bg-indigo-500/20 text-indigo-200 border border-indigo-500/30">
                      {type === "diamonds" ? "Diamond Winners Sheet" : "Pre Registered List Link"}
                    </span>
                  </div>
                  <p className="text-rose-400/90 text-[11px] font-medium pt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Ensure the sheet link is shared as "Anyone with the link can view".
                  </p>
                </div>
              </div>
            </div>

            {/* 2nd Trainee Sheet URL */}
            <div className="space-y-2 pt-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                2nd Source: Trainee Reporting Sheet URL (Optional)
              </label>
              <input
                value={secondaryReportingSheetUrl}
                onChange={(e) => setSecondaryReportingSheetUrl(e.target.value)}
                className="input-field font-mono !text-xs !py-4"
                placeholder="https://docs.google.com/spreadsheets/d/.../edit?gid=... (Trainee Sheet)"
              />
              <p className="text-[11px] text-slate-400 font-medium">
                Add an optional 2nd source (Trainee Sheet) to cross-check duplicate MLBB IDs across Official CHs and Trainees.
              </p>
            </div>
          </div>

          {/* STEP 3: Target Spreadsheet & Options */}
          <div className="space-y-6 pt-6 border-t border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm">
                  3
                </div>
                <div>
                  <h2 className="text-xl font-black text-white tracking-tight">Target Output & Verification</h2>
                  <p className="text-xs text-slate-400">Configure target Google Sheet details and MooGold validation.</p>
                </div>
              </div>
            </div>

            {/* Target Spreadsheet Name */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Target Spreadsheet Name {!isEditing && "*"}
              </label>
              <input
                value={targetName}
                onChange={(e) => setTargetName(e.target.value)}
                className="input-field font-semibold text-base"
                placeholder={isEditing ? "(Keep existing spreadsheet)" : "e.g. Consolidated PRL - March 2026"}
              />
              {!isEditing && (
                <p className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-1">
                  <Database className="w-3.5 h-3.5 text-emerald-400" />
                  A new consolidated Google Sheet with this name will be created automatically in your connected Google Drive.
                </p>
              )}
            </div>

            {/* Tab Name */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Tab Name Inside Target Sheet
              </label>
              <input
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
                className="input-field"
                placeholder={defaultSheetName}
              />
            </div>

            {/* MooGold API Checkbox Toggle Card */}
            <label className="flex items-start gap-4 p-5 rounded-2xl bg-slate-950/80 border border-slate-800 cursor-pointer hover:border-indigo-500/50 transition-all group">
              <input
                type="checkbox"
                checked={validationEnabled}
                onChange={(e) => setValidationEnabled(e.target.checked)}
                className="mt-1 w-5 h-5 rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500/40 cursor-pointer"
              />
              <div className="space-y-1">
                <span className="block text-sm font-bold text-white group-hover:text-indigo-400 transition-colors flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Enable MooGold API Verification
                </span>
                <p className="text-xs text-slate-400 font-medium">
                  Automatically verifies MLBB Server ID & User ID via MooGold API before appending rows to the target sheet.
                </p>
              </div>
            </label>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-4 pt-6 border-t border-slate-800">
            <Link href="/dashboard" className="btn-ghost">
              Cancel
            </Link>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>{isEditing ? "Saving Changes..." : "Initializing Sync Job..."}</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{isEditing ? "Save Job Changes" : "Create Sync Job"}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
