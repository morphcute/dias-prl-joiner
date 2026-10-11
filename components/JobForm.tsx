"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { ToastProvider, toast } from "./Toast";
import { BrandLogo, SettingsPillButton, AppFooter } from "./BrandNav";
import {
  FileSpreadsheet,
  CheckCircle2,
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  Zap,
  Info,
  Check,
  Layers,
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
        if (!res.ok) throw new Error("Failed to load job");
        const job = await res.json();
        setName(job.name);
        setType(job.type);
        setSheetName(job.sheetName || "");
        setValidationEnabled(job.validationEnabled);
        setGameMode(job.gameMode || "5v5");
        setTargetName(job.targetSpreadsheetName || "");
        // Reconstruct primary reporting sheet URL
        const gidPart = job.reportingSheetGid ? `#gid=${job.reportingSheetGid}` : "";
        setReportingSheetUrl(`https://docs.google.com/spreadsheets/d/${job.spreadsheetId}/edit${gidPart}`);
        // Reconstruct secondary reporting sheet URL if available
        if (job.secondarySpreadsheetId) {
          const secGid = job.secondaryReportingSheetGid ? `#gid=${job.secondaryReportingSheetGid}` : "";
          setSecondaryReportingSheetUrl(`https://docs.google.com/spreadsheets/d/${job.secondarySpreadsheetId}/edit${secGid}`);
        }
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
            secondaryReportingSheetUrl: secondaryReportingSheetUrl.trim() || undefined,
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
        toast("Job created successfully!", "success");
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
      <div className="flex flex-col justify-center items-center min-h-[60vh] gap-4 bg-cream-100">
        <div className="w-12 h-12 border-3 border-ink border-t-rust rounded-full animate-spin" />
        <div className="text-xs font-mono font-bold uppercase tracking-widest text-ink/60 animate-pulse">
          Loading Job Configuration...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-100 text-ink selection:bg-rust/20 px-4 sm:px-6 py-6 flex flex-col justify-between">
      <ToastProvider />

      {/* Header Bar */}
      <header className="w-full max-w-4xl mx-auto flex items-center justify-between pt-2 pb-6">
        <Link href="/dashboard" className="btn-retro-pill">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Dashboard</span>
        </Link>

        <BrandLogo size="md" />

        <SettingsPillButton />
      </header>

      {/* Main Form Content */}
      <main className="flex-1 max-w-3xl w-full mx-auto my-4 space-y-8 animate-fade-in">
        <div className="text-center space-y-2">
          <span className="text-xs font-black uppercase tracking-[0.25em] text-rust">
            {isEditing ? "MODIFY CONFIGURATION" : "STEP ONE"}
          </span>
          <h1 className="font-serif-title text-3xl sm:text-4xl md:text-5xl font-black text-ink tracking-tight">
            {isEditing ? "EDIT SYNC JOB" : "PICK YOUR PIPELINE"}
            <span className="text-rust">.</span>
          </h1>
          <p className="text-xs sm:text-sm font-bold uppercase tracking-wider text-ink/60 max-w-lg mx-auto">
            {isEditing
              ? "Update your spreadsheet sources and validation constraints"
              : "Select pipeline type and connect your Google Sheets"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* STEP ONE: Pick Your Pipeline (Two tactile cards from reference design) */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Diamond Rewards Card */}
              <div
                onClick={() => setType("diamonds")}
                className={`card-stitched p-6 flex flex-col items-center justify-center text-center space-y-3 cursor-pointer transition-all duration-200 ${
                  type === "diamonds"
                    ? "ring-3 ring-rust !border-ink shadow-retro bg-white scale-[1.02]"
                    : "bg-white/80 opacity-80 hover:opacity-100"
                }`}
              >
                <div className="icon-box-retro w-14 h-14 text-2xl">
                  💎
                </div>
                <div className="space-y-1">
                  <h3 className="font-serif-title text-lg md:text-xl font-black text-ink">
                    DIAMOND REWARDS
                  </h3>
                  <p className="text-[10px] font-black uppercase tracking-widest text-rust">
                    WINNERS CONSOLIDATION
                  </p>
                </div>
                <p className="text-[11px] text-ink/70 font-medium">
                  NAME, SERVER, UID, CODE, AMOUNT
                </p>
                {type === "diamonds" && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-rust bg-rust-light px-2.5 py-0.5 rounded-full border border-rust/30">
                    <Check className="w-3 h-3" /> Selected
                  </span>
                )}
              </div>

              {/* PRL Card */}
              <div
                onClick={() => setType("prl")}
                className={`card-stitched p-6 flex flex-col items-center justify-center text-center space-y-3 cursor-pointer transition-all duration-200 ${
                  type === "prl"
                    ? "ring-3 ring-rust !border-ink shadow-retro bg-white scale-[1.02]"
                    : "bg-white/80 opacity-80 hover:opacity-100"
                }`}
              >
                <div className="icon-box-retro w-14 h-14 text-2xl">
                  📋
                </div>
                <div className="space-y-1">
                  <h3 className="font-serif-title text-lg md:text-xl font-black text-ink">
                    PRE-REGISTERED LIST
                  </h3>
                  <p className="text-[10px] font-black uppercase tracking-widest text-rust">
                    5V5 TEAM VALIDATION
                  </p>
                </div>
                <p className="text-[11px] text-ink/70 font-medium">
                  PLAYERS NAME, AGE, IGN, SERVER, UID
                </p>
                {type === "prl" && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-rust bg-rust-light px-2.5 py-0.5 rounded-full border border-rust/30">
                    <Check className="w-3 h-3" /> Selected
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* STEP TWO: Basic Details & Tournament Format */}
          <div className="card-retro p-6 sm:p-8 space-y-6 bg-white">
            <div className="flex items-center justify-between border-b-2 border-dashed border-ink/20 pb-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-rust">STEP TWO</span>
                <h3 className="font-serif-title text-xl font-black text-ink">Event & Basic Details</h3>
              </div>
              <span className="text-xl">🏷️</span>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-ink">
                  Job Name <span className="text-rust">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. March 2026 Championship Finals"
                  className="input-retro"
                  required
                />
              </div>

              <div className="space-y-2 pt-2">
                <label className="text-xs font-black uppercase tracking-wider text-ink">
                  Tournament Format
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  {["5v5", "3v3", "2v2", "1v1", "Onsite 5v5"].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setGameMode(mode)}
                      className={`py-2 px-3 rounded-xl border-2 font-black text-xs transition-all cursor-pointer ${
                        gameMode === mode
                          ? "bg-ink text-white border-ink shadow-retro-sm"
                          : "bg-cream-50 text-ink border-ink/40 hover:border-ink hover:bg-cream-100"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-ink/60 font-medium pt-1">
                  Standard 5v5 requires 10 teams (46 players min). Onsite 5v5 requires 5 teams (25 players min).
                </p>
              </div>
            </div>
          </div>

          {/* STEP THREE: Source Spreadsheets */}
          <div className="card-retro p-6 sm:p-8 space-y-6 bg-white">
            <div className="flex items-center justify-between border-b-2 border-dashed border-ink/20 pb-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-rust">STEP THREE</span>
                <h3 className="font-serif-title text-xl font-black text-ink">Source Spreadsheets</h3>
              </div>
              <span className="text-xl">📄</span>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-ink">
                  1st Source: Official Reporting Sheet URL <span className="text-rust">*</span>
                </label>
                <input
                  type="url"
                  value={reportingSheetUrl}
                  onChange={(e) => setReportingSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=... (Official Sheet)"
                  className="input-retro font-mono !text-xs"
                  required
                />
              </div>

              {/* Helper Ticket */}
              <div className="p-4 rounded-xl border-2 border-dashed border-ink/25 bg-cream-50 space-y-2 text-xs">
                <div className="flex items-center gap-2 font-black text-ink">
                  <Sparkles className="w-4 h-4 text-rust" />
                  <span>Smart Column Detection & URL Resolution</span>
                </div>
                <p className="text-ink/70 leading-relaxed text-[11px]">
                  Paste the full Google Sheet link including the <code className="bg-white px-1.5 py-0.5 rounded border border-ink/20 font-mono font-bold text-ink">#gid=...</code> tab ID. The engine automatically discovers CH columns and resolves shortlinks.
                </p>
                <p className="text-[10px] font-black text-rust flex items-center gap-1">
                  ⚠️ Make sure the sheet sharing is set to "Anyone with the link can view".
                </p>
              </div>

              <div className="space-y-1.5 pt-2">
                <label className="text-xs font-black uppercase tracking-wider text-ink">
                  2nd Source: Trainee Reporting Sheet URL (Optional)
                </label>
                <input
                  type="url"
                  value={secondaryReportingSheetUrl}
                  onChange={(e) => setSecondaryReportingSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=... (Trainees Sheet)"
                  className="input-retro font-mono !text-xs"
                />
                <p className="text-[11px] text-ink/60 font-medium">
                  Add an optional secondary sheet to combine Official and Trainee CH submissions with cross-sheet duplicate detection.
                </p>
              </div>
            </div>
          </div>

          {/* STEP FOUR: Destination & Validation */}
          <div className="card-retro p-6 sm:p-8 space-y-6 bg-white">
            <div className="flex items-center justify-between border-b-2 border-dashed border-ink/20 pb-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-rust">STEP FOUR</span>
                <h3 className="font-serif-title text-xl font-black text-ink">Destination & Validation</h3>
              </div>
              <span className="text-xl">🎯</span>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-ink">
                  Target Spreadsheet Name {!isEditing && <span className="text-rust">*</span>}
                </label>
                <input
                  type="text"
                  value={targetName}
                  onChange={(e) => setTargetName(e.target.value)}
                  placeholder={isEditing ? "(Leave blank to keep existing)" : "e.g. Consolidated Rewards - Event 2026"}
                  className="input-retro"
                  required={!isEditing}
                />
                {!isEditing && (
                  <p className="text-[11px] text-ink/60 font-medium">
                    A new Google Sheet with this name will be created automatically in your Google Drive.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-ink">
                  Output Tab Name
                </label>
                <input
                  type="text"
                  value={sheetName}
                  onChange={(e) => setSheetName(e.target.value)}
                  placeholder={defaultSheetName}
                  className="input-retro"
                />
              </div>

              {/* MooGold Verification Option */}
              <div
                onClick={() => setValidationEnabled(!validationEnabled)}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                  validationEnabled
                    ? "border-ink bg-rust-light shadow-retro-sm"
                    : "border-dashed border-ink/30 bg-cream-50 hover:bg-cream-100"
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className={`w-4 h-4 ${validationEnabled ? "text-rust" : "text-ink/60"}`} />
                    <span className="text-xs font-black uppercase tracking-wider text-ink">
                      MooGold MLBB Account Verification
                    </span>
                  </div>
                  <p className="text-[11px] text-ink/70 font-medium">
                    Automatically verify player Game UIDs and Server IDs in parallel via MooGold API.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={validationEnabled}
                  onChange={() => {}}
                  className="w-5 h-5 rounded border-2 border-ink text-rust focus:ring-rust cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Action Footer Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t-2 border-dashed border-ink/20">
            <Link href="/dashboard" className="btn-retro-pill w-full sm:w-auto text-center">
              — BACK TO DASHBOARD —
            </Link>

            <button
              type="submit"
              disabled={submitting}
              className="btn-retro-primary w-full sm:w-auto !py-3.5 !px-8 text-sm font-black shadow-retro cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>{isEditing ? "SAVING CHANGES..." : "CREATING JOB..."}</span>
                </>
              ) : (
                <>
                  <span>{isEditing ? "SAVE CHANGES" : "CREATE SYNC JOB"}</span>
                  <CheckCircle2 className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </main>

      <AppFooter />
    </div>
  );
}
