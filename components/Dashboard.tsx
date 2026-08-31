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
  Grid,
  List,
  Copy,
  Download,
  AlertCircle,
  FileText,
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

    const interval = setInterval(async () => {
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
          clearInterval(interval);
          pollersRef.current.delete(jobId);
          fetchJobs();
        }
      } catch (e) {
        console.error(e);
      }
    }, 1000);

    pollersRef.current.set(jobId, interval);
  }, []);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs?t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (res.status === 401) return;
      if (res.ok) {
        const data: JoinerJob[] = await res.json();
        setJobs(data);

        // Auto-attach poller to any running job
        data.forEach((job) => {
          const latestRunStatus = job.runs?.[0]?.status;
          if (latestRunStatus === "running") {
            pollJobStatus(job.id);
          }
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [pollJobStatus]);

  useEffect(() => {
    fetchJobs();
    const timer = setInterval(fetchJobs, 8000);
    return () => clearInterval(timer);
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

  // Open Log & CH Health Diagnostics Modal
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

      const chStatsStr = (latestRun as any)?.chStats;
      const parsedStats = typeof chStatsStr === "string" ? JSON.parse(chStatsStr) : chStatsStr || [];
      setViewStats(parsedStats);
    } else {
      setViewErrors([]);
      setViewStats([]);
    }
    setActiveLogTab("overview");
    setModalSearch("");
    setErrorsModalOpen(true);
  };

  // Categorize errors
  const getErrorType = (
    err: ChError
  ): "duplicate" | "dissolved" | "accessibility" | "rule_violation" | "validation_fixed" | "validation_error" => {
    const type = (err.type || "").toLowerCase();
    const msg = (err.error || "").toLowerCase();

    if (type === "rule_violation" || msg.includes("rules") || msg.includes("no link")) return "rule_violation";
    if (type === "accessibility") return "accessibility";
    if (type === "validation_fixed") return "validation_fixed";
    if (type === "validation_error") return "validation_error";

    if (msg.includes("duplicate")) return "duplicate";
    if (msg.includes("dissolved") || msg.includes("empty tournament") || msg.includes("no actual players")) return "dissolved";
    if (
      msg.includes("403") ||
      msg.includes("404") ||
      msg.includes("permission") ||
      msg.includes("not found") ||
      msg.includes("error reading sheet") ||
      msg.includes("cannot access") ||
      msg.includes("timeout") ||
      msg.includes("blank or missing") ||
      msg.includes("url resolution failed") ||
      msg.includes("could not find header row")
    ) {
      return "accessibility";
    }
    if (
      msg.includes("auto-fixed") ||
      msg.includes("mixed server/uid") ||
      msg.includes("swapped") ||
      msg.includes("auto-corrected") ||
      msg.includes("interchanged") ||
      msg.includes("column mapping")
    ) {
      return "validation_fixed";
    }
    return "validation_error";
  };

  // Parse duplicate string
  const parseDuplicateError = (err: ChError) => {
    const msg = err.error || "";

    // 1. Same Server Normal Duplicate
    const sameServerRegex =
      /(?:Duplicate player entry found|Duplicate winner found):\s*(.*?)\s*\(Server:\s*([^,)]*),\s*UID:\s*([^)]*)\)\s*was\s*already\s*registered\s*(?:earlier\s*)?in\s*CH\s*(.*)/i;
    const match1 = msg.match(sameServerRegex);
    if (match1) {
      return {
        name: match1[1].trim(),
        server: match1[2].trim(),
        uid: match1[3].trim(),
        prevCh: match1[4].trim(),
        currCh: err.chName.trim(),
        isFakedServer: false,
        prevServer: null as string | null,
      };
    }

    // 2. Duplicate with altered server - format A:
    const diffServerRegex1 =
      /(?:Duplicate|Fake duplicate) MLBB ID found.*:\s*(.*?)\s*\(UID:\s*([^,)]*),\s*Server:\s*([^)]*)\)\s*was\s*registered\s*in\s*CH\s*(.*?),\s*but\s*originally\s*registered\s*with\s*Server\s*([^ ]*)\s*in\s*CH\s*(.*)/i;
    const match2 = msg.match(diffServerRegex1);
    if (match2) {
      return {
        name: match2[1].trim(),
        uid: match2[2].trim(),
        server: match2[3].trim(),
        currCh: match2[4].trim() || err.chName.trim(),
        prevServer: match2[5].trim(),
        prevCh: match2[6].trim(),
        isFakedServer: true,
      };
    }

    // 3. Duplicate with altered server - format B:
    const diffServerRegex2 =
      /(?:Duplicate|Fake duplicate) MLBB ID found.*:\s*(.*?)\s*\(UID:\s*([^,)]*),\s*Server:\s*([^)]*)\)\s*was\s*already\s*registered\s*(?:earlier\s*)?in\s*CH\s*(.*?)(?:\s*\(with Server:\s*([^)]*)\))?$/i;
    const match3 = msg.match(diffServerRegex2);
    if (match3) {
      return {
        name: match3[1].trim(),
        uid: match3[2].trim(),
        server: match3[3].trim(),
        prevCh: match3[4].trim(),
        prevServer: match3[5] ? match3[5].trim() : null,
        currCh: err.chName.trim(),
        isFakedServer: true,
      };
    }

    // 4. Legacy / Fallback matching
    const nameMatch = msg.match(/Player "([^"]+)"/) || msg.match(/player ([^(:]+)/i);
    const uidMatch = msg.match(/UID:?\s*(\d+)/i);
    const serverMatch = msg.match(/Server:?\s*(\d+)/i);
    const prevServerMatch = msg.match(/Real Server:?\s*(\d+)/i);
    const prevChMatch = msg.match(/in (.*?) \(row/) || msg.match(/in CH (.*)/i);
    const isFaked =
      msg.toLowerCase().includes("faked") ||
      msg.toLowerCase().includes("fake") ||
      msg.toLowerCase().includes("different server");

    if (nameMatch && uidMatch) {
      return {
        name: nameMatch[1].trim(),
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

  // Helper to parse dissolved tournament errors
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

  // Format date helper
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "N/A";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "N/A";
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
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

  // Copy Summary Report to Clipboard
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

    const autoFixesGrouped: Record<string, string[]> = {};
    autoFixes.forEach((f) => {
      const ch = f.chName;
      if (!autoFixesGrouped[ch]) {
        autoFixesGrouped[ch] = [];
      }

      const mixedMatch = f.error.match(/Mixed Server\/UID extracted for player (.*?) \(Server: (.*?), UID: (.*?)\)/i);
      if (mixedMatch) {
        autoFixesGrouped[ch].push(
          ` • Mixed Server/UID extracted\n   Player : ${mixedMatch[1].trim()}\n   Server : ${mixedMatch[2].trim()}\n   UID    : ${mixedMatch[3].trim()}`
        );
      } else if (f.error.toLowerCase().includes("column mapping")) {
        autoFixesGrouped[ch].push(` • Column mapping automatically corrected\n   (Misaligned headers detected)`);
      } else if (f.error.toLowerCase().includes("interchanged") || f.error.toLowerCase().includes("swapped")) {
        const playerMatch = f.error.match(/player (.*)/i);
        const namePart = playerMatch ? playerMatch[1].trim() : "Unknown";
        autoFixesGrouped[ch].push(` • Swapped Server/UID columns automatically corrected\n   Player : ${namePart}`);
      } else {
        autoFixesGrouped[ch].push(` • ${f.error}`);
      }
    });

    const validationGrouped: Record<string, string[]> = {};
    validationErrors.forEach((v) => {
      const ch = v.chName;
      if (!validationGrouped[ch]) {
        validationGrouped[ch] = [];
      }

      const textServerMatch = v.error.match(/Added text instead of numerical Server for player (.*?) \(Input: '(.*?)'\)/i);
      const ignServerMatch = v.error.match(/Added Players IGN instead of Server for player (.*)/i);
      const missingMatch = v.error.match(/Missing Server or UID for player (.*?) \(Server: '(.*?)',\s*UID: '(.*?)'\)/i);
      const shortUidMatch = v.error.match(/Missing UID because the CH type (.*?) numbers only for player (.*)/i);
      const spaceUidMatch = v.error.match(/UID contains spaces for player (.*?) \(Input: '(.*?)'\)/i);
      const spaceServerMatch = v.error.match(/Server contains spaces for player (.*?) \(Input: '(.*?)'\)/i);
      const negativeMatch = v.error.match(/Negative sign detected for player (.*?) \(Raw Server: (.*?), Raw UID: (.*?)\)/i);
      const serverLengthMatch = v.error.match(/Server length is unusually long for player (.*?) \(Server: (.*?)\)/i);
      const serverInUidMatch = v.error.match(/Server entered in UID column for player (.*?) \(Server: (.*?), UID: (.*?)\)/i);

      if (textServerMatch) {
        validationGrouped[ch].push(
          ` • Player : ${textServerMatch[1].trim()}\n   Error  : Server must be numeric\n   Input  : "${textServerMatch[2].trim()}"`
        );
      } else if (ignServerMatch) {
        validationGrouped[ch].push(` • Player : ${ignServerMatch[1].trim()}\n   Error  : Player IGN entered instead of Server`);
      } else if (missingMatch) {
        validationGrouped[ch].push(
          ` • Player : ${missingMatch[1].trim()}\n   Error  : Missing Server or UID\n   Input  : Server: '${missingMatch[2]}', UID: '${missingMatch[3]}'`
        );
      } else if (shortUidMatch) {
        validationGrouped[ch].push(` • Player : ${shortUidMatch[2].trim()}\n   Error  : Missing UID (only typed server/short ID)`);
      } else if (spaceUidMatch) {
        validationGrouped[ch].push(` • Player : ${spaceUidMatch[1].trim()}\n   Error  : UID contains spaces\n   Input  : "${spaceUidMatch[2]}"`);
      } else if (spaceServerMatch) {
        validationGrouped[ch].push(` • Player : ${spaceServerMatch[1].trim()}\n   Error  : Server contains spaces\n   Input  : "${spaceServerMatch[2]}"`);
      } else if (negativeMatch) {
        validationGrouped[ch].push(
          ` • Player : ${negativeMatch[1].trim()}\n   Error  : Negative sign detected in IDs\n   Input  : Raw Server: ${negativeMatch[2]}, Raw UID: ${negativeMatch[3]}`
        );
      } else if (serverLengthMatch) {
        validationGrouped[ch].push(
          ` • Player : ${serverLengthMatch[1].trim()}\n   Error  : Server length unusually long\n   Input  : "${serverLengthMatch[2]}"`
        );
      } else if (serverInUidMatch) {
        validationGrouped[ch].push(
          ` • Player : ${serverInUidMatch[1].trim()}\n   Error  : Server entered in UID column\n   Input  : Server: ${serverInUidMatch[2]}, UID: ${serverInUidMatch[3]}`
        );
      } else {
        validationGrouped[ch].push(` • ${v.error}`);
      }
    });

    let report = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `📊 ${selectedJob.name.toUpperCase()}\n`;
    report += `OPERATION SUMMARY REPORT\n`;
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

    if (duplicates.length > 0) {
      type ParsedDup = NonNullable<ReturnType<typeof parseDuplicateError>>;
      const fakes: Record<string, Record<string, ParsedDup[]>> = {};
      const cross: Record<string, Record<string, ParsedDup[]>> = {};
      const internal: Record<string, ParsedDup[]> = {};

      duplicates.forEach((d) => {
        const parsed = parseDuplicateError(d);
        if (!parsed) {
          const ch = d.chName.trim();
          if (!internal[ch]) internal[ch] = [];
          internal[ch].push({
            name: d.error,
            server: "",
            uid: "",
            prevCh: ch,
            currCh: ch,
            isFakedServer: false,
            prevServer: null,
          });
          return;
        }

        const currCh = parsed.currCh.trim();
        const prevCh = parsed.prevCh.trim();

        if (parsed.isFakedServer) {
          if (!fakes[currCh]) fakes[currCh] = {};
          if (!fakes[currCh][prevCh]) fakes[currCh][prevCh] = [];
          if (!fakes[currCh][prevCh].some((p) => p.uid === parsed.uid && p.name === parsed.name)) {
            fakes[currCh][prevCh].push(parsed);
          }
        } else if (prevCh.toLowerCase() === currCh.toLowerCase()) {
          if (!internal[currCh]) internal[currCh] = [];
          if (!internal[currCh].some((p) => p.uid === parsed.uid && p.name === parsed.name)) {
            internal[currCh].push(parsed);
          }
        } else {
          if (!cross[currCh]) cross[currCh] = {};
          if (!cross[currCh][prevCh]) cross[currCh][prevCh] = [];
          if (!cross[currCh][prevCh].some((p) => p.uid === parsed.uid && p.name === parsed.name)) {
            cross[currCh][prevCh].push(parsed);
          }
        }
      });

      // 1. Cross-Server Duplicates with altered servers (if any)
      const fakeKeys = Object.keys(fakes).sort();
      if (fakeKeys.length > 0) {
        report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        report += `🔁 DUPLICATE MLBB IDs (DIFFERENT SERVERS ENTERED)\n`;
        report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        fakeKeys.forEach((ch, idx) => {
          if (idx > 0) {
            report += `──────────────────────────────────────\n\n`;
          }
          const prevChs = Object.keys(fakes[ch]).sort();
          prevChs.forEach((prevCh, pIdx) => {
            if (pIdx > 0) report += `\n`;
            const list = fakes[ch][prevCh];
            report += `【${ch.toUpperCase()}】 ${list.length} duplicate(s) with altered server\n`;
            report += `Duplicate MLBB ID with ► ${prevCh}\n\n`;
            list.forEach((p) => {
              report += ` • ${p.name}\n`;
              report += `   UID            : ${p.uid}\n`;
              report += `   Entered Server : ${p.server} (Submitted by ${ch})\n`;
              if (p.prevServer) {
                report += `   Original Server: ${p.prevServer} (Original in ${prevCh})\n`;
              }
              report += `\n`;
            });
          });
        });
      }

      // 2. Cross-Host Duplicates
      const crossKeys = Object.keys(cross).sort();
      if (crossKeys.length > 0) {
        report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        report += `🔁 CROSS-HOST DUPLICATES\n`;
        report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        crossKeys.forEach((ch, idx) => {
          if (idx > 0) {
            report += `──────────────────────────────────────\n\n`;
          }
          const prevChs = Object.keys(cross[ch]).sort();
          prevChs.forEach((prevCh, pIdx) => {
            if (pIdx > 0) report += `\n`;
            const list = cross[ch][prevCh];
            report += `【${ch.toUpperCase()}】 ${list.length} duplicate(s)\n`;
            report += `Duplicated with ► ${prevCh}\n\n`;
            list.forEach((p) => {
              report += ` • ${p.name}\n`;
              report += `   Server: ${p.server}\n`;
              report += `   UID   : ${p.uid}\n\n`;
            });
          });
        });
      }

      // 3. Internal Duplicates
      const internalKeys = Object.keys(internal).sort();
      if (internalKeys.length > 0) {
        report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        report += `📄 INTERNAL DUPLICATES\n`;
        report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        internalKeys.forEach((ch, idx) => {
          if (idx > 0) {
            report += `──────────────────────────────────────\n\n`;
          }
          const list = internal[ch];
          report += `【${ch.toUpperCase()}】 ${list.length} duplicate(s)\n\n`;
          list.forEach((p) => {
            report += ` • ${p.name}\n`;
            if (p.server) {
              report += `   Server: ${p.server}\n`;
              report += `   UID   : ${p.uid}\n\n`;
            } else {
              report += `\n`;
            }
          });
        });
      }
    }

    const autoFixKeys = Object.keys(autoFixesGrouped).sort();
    if (autoFixKeys.length > 0) {
      report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      report += `🔧 AUTO FIXES\n`;
      report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      autoFixKeys.forEach((ch, idx) => {
        if (idx > 0) {
          report += `──────────────────────────────────────\n\n`;
        }
        report += `✅ ${ch}\n\n`;
        autoFixesGrouped[ch].forEach((f) => {
          report += `${f}\n\n`;
        });
      });
    }

    const valKeys = Object.keys(validationGrouped).sort();
    if (valKeys.length > 0) {
      report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      report += `⚠️ VALIDATION ERRORS\n`;
      report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      valKeys.forEach((ch, idx) => {
        if (idx > 0) {
          report += `──────────────────────────────────────\n\n`;
        }
        report += `❌ ${ch}\n\n`;
        validationGrouped[ch].forEach((v) => {
          report += `${v}\n\n`;
        });
      });
    }

    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `✅ REPORT COMPLETE\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    navigator.clipboard.writeText(report);
    toast("Report summary copied to clipboard!", "success");
  };

  // Export CSV Report
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10 animate-fade-in">
        {/* Navigation Bar */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 glass-panel-3d p-6 rounded-3xl border border-slate-700/60 shadow-2xl">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 via-cyan-500 to-emerald-400 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30 border border-white/20">
              <Zap className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-white tracking-tight">
                  Dias & PRL Auto Joiner
                </h1>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono font-bold border border-indigo-500/30 uppercase">
                  v2.0 Command Center
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                Automated Diamond Rewards & PRL Google Sheets Consolidation Platform
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
              className="p-3 rounded-xl bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-rose-400 border border-slate-700/70 transition-colors cursor-pointer"
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
              <CheckCircle2 className="w-3.5 h-3.5" /> Direct Google Sheets Integration
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
              {runningCount > 0 ? "Sync Operation Running" : "Engine Standby Ready"}
            </p>
          </div>

          <div className="glass-card-3d p-6 rounded-3xl space-y-2 relative overflow-hidden group">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-bold uppercase tracking-wider">API Validation</span>
              <ShieldCheck className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-4xl font-black text-white tracking-tight">MooGold</div>
            <p className="text-xs font-semibold text-slate-400 pt-1">
              Fast 10x Parallel User Verification
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
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  typeFilter === "all" ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-white"
                }`}
              >
                All Jobs
              </button>
              <button
                onClick={() => setTypeFilter("diamonds")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  typeFilter === "diamonds" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "text-slate-400 hover:text-white"
                }`}
              >
                💎 Diamonds
              </button>
              <button
                onClick={() => setTypeFilter("prl")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
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
              className={`p-2 rounded-xl transition-all cursor-pointer ${
                viewLayout === "grid" ? "bg-slate-800 text-white border border-slate-700" : "text-slate-400 hover:text-white"
              }`}
              title="Grid View"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewLayout("table")}
              className={`p-2 rounded-xl transition-all cursor-pointer ${
                viewLayout === "table" ? "bg-slate-800 text-white border border-slate-700" : "text-slate-400 hover:text-white"
              }`}
              title="Table View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Jobs Grid View */}
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
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className={job.type === "diamonds" ? "badge-diamonds mb-2" : "badge-prl mb-2"}>
                          {job.type === "diamonds" ? "💎 Diamond Rewards" : "📋 Pre-Registered List"}
                        </span>
                        <h3 className="text-xl font-black text-white tracking-tight group-hover:text-indigo-400 transition-colors">
                          {job.name}
                        </h3>
                      </div>

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
                          <AlertTriangle className="w-3 h-3" /> Fault
                        </span>
                      ) : (
                        <span className="badge-pending">Idle</span>
                      )}
                    </div>

                    <p className="text-xs font-mono text-slate-400 truncate">
                      Target: <span className="text-slate-200">{job.targetSpreadsheetName || "Default Target"}</span>
                    </p>
                  </div>

                  {/* Execution Progress Bar */}
                  {isRunning && (
                    <div className="space-y-2 p-3.5 rounded-2xl bg-slate-950/80 border border-indigo-500/30">
                      <div className="flex justify-between text-xs font-bold text-indigo-300">
                        <span className="truncate">{live?.progressMessage || "Processing CH sheets..."}</span>
                        <span>{live?.progress || 0}%</span>
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-slate-900 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400 transition-all duration-300 rounded-full glow-indigo"
                          style={{ width: `${live?.progress || 0}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Metadata & Actions */}
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
                    <div className="flex flex-col gap-2 pt-2">
                      <div className="flex items-center gap-2 w-full">
                        {isRunning ? (
                          <button
                            onClick={() => handleStopRun(job)}
                            disabled={isStopping}
                            className="btn-danger flex-1 !py-2.5 text-xs"
                          >
                            <Square className="w-3.5 h-3.5" /> Stop Sync
                          </button>
                        ) : (
                          <button
                            onClick={() => handleStartRun(job)}
                            disabled={isStarting}
                            className="btn-primary flex-1 !py-2.5 text-xs"
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
                          className="px-3 py-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 hover:text-white transition-all text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                          title="Check Status, Health & Copy Summary"
                        >
                          <Activity className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Check Status</span>
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        {job.targetSpreadsheetId ? (
                          <a
                            href={`https://docs.google.com/spreadsheets/d/${job.targetSpreadsheetId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5"
                          >
                            <ExternalLink className="w-3.5 h-3.5" /> Open Google Sheet
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-500">Sheet not generated yet</span>
                        )}

                        <div className="flex items-center gap-1">
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
                            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 border border-slate-700 transition-colors cursor-pointer"
                            title="Delete Job"
                          >
                            <Trash2 className="w-4 h-4" />
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
                              className="px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold text-xs hover:bg-indigo-500/20"
                            >
                              Check Status
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

      {/* Diagnostics, CH Health & Copy Summary Modal */}
      <Modal
        isOpen={errorsModalOpen}
        onClose={() => setErrorsModalOpen(false)}
        title={`Health & Execution Report - ${selectedJob?.name}`}
        maxWidth="max-w-4xl"
      >
        <div className="space-y-6">
          {/* Modal Tab Navigation Matrix */}
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
            <button
              onClick={() => setActiveLogTab("overview")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeLogTab === "overview"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Overview & Reports
            </button>

            <button
              onClick={() => setActiveLogTab("chHealth")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeLogTab === "chHealth"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              CH Host Health ({viewStats.length})
            </button>

            <button
              onClick={() => setActiveLogTab("duplicates")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeLogTab === "duplicates"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Duplicates ({viewErrors.filter((err) => getErrorType(err) === "duplicate").length})
            </button>

            <button
              onClick={() => setActiveLogTab("logs")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeLogTab === "logs"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              System Logs ({viewErrors.length})
            </button>
          </div>

          {/* TAB 1: OVERVIEW & COPY SUMMARY */}
          {activeLogTab === "overview" && (
            <div className="space-y-6">
              {/* Health Banner */}
              {viewErrors.filter((e) => ["accessibility", "dissolved", "rule_violation"].includes(getErrorType(e))).length > 0 ? (
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs leading-relaxed">
                  <AlertCircle className="w-5 h-5 text-rose-400 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="font-extrabold text-rose-400 text-sm uppercase tracking-wider">
                      Critical Sheet Access Faults or Rule Violations Detected
                    </h4>
                    <p className="mt-1">
                      Some Community Host sheets had missing links (rule violations) or cannot be accessed. Check the CH Host Health tab to locate affected hosts.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3 text-emerald-300 text-xs leading-relaxed">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="font-extrabold text-emerald-400 text-sm uppercase tracking-wider">
                      All CH Nodes Operating Nominally
                    </h4>
                    <p className="mt-1">No critical sheet access permissions, dissolved links, or rule violation errors encountered.</p>
                  </div>
                </div>
              )}

              {/* Action Buttons: Copy Summary & Export CSV */}
              <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-2xl bg-slate-950/80 border border-slate-800">
                <div className="space-y-1">
                  <h4 className="font-black text-white text-sm">Extraction Summary Actions</h4>
                  <p className="text-xs text-slate-400">
                    Copy a clean formatted report to share with CH Admins or export a CSV.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button onClick={copyTextReport} className="btn-primary !py-2.5 text-xs">
                    <Copy className="w-4 h-4" />
                    <span>Copy Summary</span>
                  </button>

                  <button
                    onClick={exportReportToCSV}
                    className="px-4 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30 transition-all text-xs flex items-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>

              {/* Summary Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-center">
                  <span className="text-xs text-slate-400 font-bold uppercase">Extracted Rows</span>
                  <div className="text-2xl font-black text-emerald-400 mt-1">
                    {selectedJob?.runs?.[0]?.rowsWritten || 0}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-center">
                  <span className="text-xs text-slate-400 font-bold uppercase">Critical & Rule Issues</span>
                  <div className="text-2xl font-black text-rose-400 mt-1">
                    {viewErrors.filter((e) => ["accessibility", "dissolved", "rule_violation"].includes(getErrorType(e))).length}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-center">
                  <span className="text-xs text-slate-400 font-bold uppercase">Duplicates Flagged</span>
                  <div className="text-2xl font-black text-amber-400 mt-1">
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
                <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-bold border-b border-slate-800">
                  <tr>
                    <th className="p-3">CH Nickname</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center">Players Extracted</th>
                    <th className="p-3">Issue Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {viewStats.map((stat, i) => {
                    const chErrs = viewErrors.filter((e) => e.chName === stat.chName);
                    const hasRuleViolation = chErrs.some((e) => getErrorType(e) === "rule_violation");
                    const hasCritical = chErrs.some((e) => ["accessibility", "dissolved"].includes(getErrorType(e)));
                    const hasDup = chErrs.some((e) => getErrorType(e) === "duplicate");

                    return (
                      <tr key={i} className="hover:bg-slate-900/50">
                        <td className="p-3 font-bold text-white">{stat.chName}</td>
                        <td className="p-3 text-center">
                          {hasRuleViolation ? (
                            <span className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30 text-[10px] uppercase">
                              Rule Fault
                            </span>
                          ) : hasCritical ? (
                            <span className="badge-failed">Critical</span>
                          ) : hasDup ? (
                            <span className="badge-diamonds">Duplicate</span>
                          ) : (
                            <span className="badge-success">Normal</span>
                          )}
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-emerald-400">{stat.count}</td>
                        <td className="p-3">
                          {chErrs.length === 0 ? (
                            <span className="text-slate-500 italic">None</span>
                          ) : (
                            <div className="space-y-1 font-mono text-[11px] text-rose-300">
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
                <div className="text-center py-12 text-slate-500 text-xs">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-50" />
                  No duplicate player entries detected in this run.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {viewErrors
                    .filter((err) => getErrorType(err) === "duplicate")
                    .map((err, i) => {
                      const parsed = parseDuplicateError(err);
                      if (!parsed) {
                        return (
                          <div key={i} className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs">
                            <div className="font-extrabold text-white mb-1">{err.chName}</div>
                            <div className="font-mono text-amber-300/90">{err.error}</div>
                          </div>
                        );
                      }

                      const isFake = parsed.isFakedServer;

                      return (
                        <div
                          key={i}
                          className={`p-4 rounded-2xl border text-xs space-y-3 relative overflow-hidden ${
                            isFake
                              ? "bg-rose-500/10 border-rose-500/30"
                              : "bg-amber-500/10 border-amber-500/30"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-black text-white text-sm">{parsed.name}</span>
                            <span
                              className={`text-[10px] font-mono font-extrabold px-2 py-0.5 rounded border uppercase ${
                                isFake
                                  ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                                  : "bg-amber-500/20 text-amber-300 border-amber-500/40"
                              }`}
                            >
                              {isFake ? "DIFFERENT SERVER DUPLICATE" : "MLBB PLAYER"}
                            </span>
                          </div>

                          <div className="font-mono text-[11px] text-slate-300 space-y-1">
                            <div>
                              UID: <strong className="text-white">{parsed.uid}</strong> | Server:{" "}
                              <strong className="text-white">{parsed.server}</strong>
                            </div>
                            {isFake && parsed.prevServer && (
                              <div className="text-rose-400 font-bold">
                                Entered Server: {parsed.server} | Original Server: {parsed.prevServer}
                              </div>
                            )}
                          </div>

                          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
                            <div>
                              <span className="text-slate-500 font-bold block text-[9px] uppercase">Original CH</span>
                              <span className="font-bold text-indigo-400">{parsed.prevCh}</span>
                            </div>
                            <span className="text-slate-500">➡️</span>
                            <div className="text-right">
                              <span className="text-slate-500 font-bold block text-[9px] uppercase">Duplicate In CH</span>
                              <span className={`font-bold ${isFake ? "text-rose-400" : "text-amber-400"}`}>
                                {parsed.currCh}
                              </span>
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
                placeholder="Search logs by CH or error message..."
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                className="input-field !py-2.5 !text-xs"
              />

              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {viewErrors.length === 0 ? (
                  <p className="text-slate-500 italic text-center py-8 text-xs">No execution logs or errors recorded.</p>
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
                        className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-3 text-xs"
                      >
                        <span className="font-extrabold text-indigo-400 shrink-0">[{err.chName}]</span>
                        <span className="font-mono text-slate-300">{err.error}</span>
                      </div>
                    ))
                )}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
