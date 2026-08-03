"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import Modal from "./Modal";
import { toast, ToastProvider } from "./Toast";



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
    } catch (error) {
      console.error("Failed to load jobs", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const startProgressPoller = useCallback((jobId: string) => {
    if (pollersRef.current.has(jobId)) return;

    let consecutiveFailures = 0;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/progress`, { cache: "no-store" });
        if (!res.ok) {
          consecutiveFailures++;
          if (consecutiveFailures > 8) {
            // Auto reconnect after persistent network drop
            fetchJobs();
          }
          return;
        }

        consecutiveFailures = 0;
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
      } catch {
        consecutiveFailures++;
        if (consecutiveFailures > 8) {
          fetchJobs();
        }
      }
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
    const statsStr = (run as any).chStats;
    const stats = typeof statsStr === "string" ? JSON.parse(statsStr) : statsStr || [];
    setViewStats(stats || []);
    setSelectedJob(job);
    setActiveLogTab("logs");
    setModalSearch("");
    setErrorsModalOpen(true);
  };

  const handleViewStats = (job: JoinerJob) => {
    const run = job.runs?.[0];
    if (!run) return;
    const statsStr = (run as any).chStats;
    const stats = typeof statsStr === "string" ? JSON.parse(statsStr) : statsStr || [];
    setViewStats(stats || []);
    const errs = typeof run.errors === "string" ? JSON.parse(run.errors) : run.errors;
    setViewErrors(errs || []);
    setSelectedJob(job);
    setActiveLogTab("overview");
    setModalSearch("");
    setErrorsModalOpen(true);
  };

  const getErrorType = (err: ChError): "duplicate" | "dissolved" | "accessibility" | "validation_fixed" | "validation_error" => {
    if (err.type) return err.type as any;
    const msg = err.error.toLowerCase();
    if (msg.includes("duplicate")) return "duplicate";
    if (msg.includes("dissolved") || msg.includes("empty tournament")) return "dissolved";
    if (msg.includes("403") || msg.includes("404") || msg.includes("permission") || msg.includes("not found") || msg.includes("error reading sheet")) return "accessibility";
    if (msg.includes("auto-fixed") || msg.includes("mixed") || msg.includes("negative") || msg.includes("swapped") || msg.includes("auto-corrected")) return "validation_fixed";
    return "validation_error";
  };

  const copyTextReport = () => {
    if (!selectedJob) return;
    const run = selectedJob.runs?.[0];
    if (!run) return;
    
    const totalPlayers = viewStats.reduce((sum, s) => sum + s.count, 0);
    const duplicates = viewErrors.filter(err => getErrorType(err) === "duplicate");
    const criticals = viewErrors.filter(err => getErrorType(err) === "accessibility" || getErrorType(err) === "dissolved");
    const autoFixes = viewErrors.filter(err => getErrorType(err) === "validation_fixed");
    const validationErrors = viewErrors.filter(err => getErrorType(err) === "validation_error");
    
    const dissolved = criticals.filter(c => getErrorType(c) === "dissolved");
    const accessibility = criticals.filter(c => getErrorType(c) === "accessibility");

    const formatDate = (dateStr: string) => {
      const d = new Date(dateStr);
      const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
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

    const parseDissolvedError = (errStr: string) => {
      const match = errStr.match(/only (\d+) valid players.*Mode:\s*(.*?),\s*Target:\s*(\d+),\s*Minimum allowed:\s*(\d+)(?:\.\s*\(Teams in responses sheet:\s*([^)]*)\))?/i);
      if (match) {
        return {
          actual: match[1],
          mode: match[2],
          target: match[3],
          min: match[4],
          teams: match[5] || null
        };
      }
      return null;
    };

    const autoFixesGrouped: Record<string, string[]> = {};
    autoFixes.forEach(f => {
      const ch = f.chName;
      if (!autoFixesGrouped[ch]) {
        autoFixesGrouped[ch] = [];
      }
      
      const mixedMatch = f.error.match(/Mixed Server\/UID extracted for player (.*) \(Server: (.*), UID: (.*)\)/i);
      if (mixedMatch) {
        autoFixesGrouped[ch].push(
          ` • Mixed Server/UID extracted\n   Player : ${mixedMatch[1]}\n   Server : ${mixedMatch[2]}\n   UID    : ${mixedMatch[3]}`
        );
      } else if (f.error.includes("column mapping")) {
        autoFixesGrouped[ch].push(
          ` • Column mapping automatically corrected\n   (Misaligned headers detected)`
        );
      } else if (f.error.includes("interchanged")) {
        const playerMatch = f.error.match(/player (.*)/i);
        const namePart = playerMatch ? playerMatch[1] : "Unknown";
        autoFixesGrouped[ch].push(
          ` • Swapped Server/UID columns automatically corrected\n   Player : ${namePart}`
        );
      } else {
        autoFixesGrouped[ch].push(` • ${f.error}`);
      }
    });

    const validationGrouped: Record<string, string[]> = {};
    validationErrors.forEach(v => {
      const ch = v.chName;
      if (!validationGrouped[ch]) {
        validationGrouped[ch] = [];
      }
      
      const textServerMatch = v.error.match(/Added text instead of numerical Server for player (.*) \(Input: '(.*)'\)/i);
      const ignServerMatch = v.error.match(/Added Players IGN instead of Server for player (.*)/i);
      const missingMatch = v.error.match(/Missing Server or UID for player (.*) \(Server: '(.*)', UID: '(.*)'\)/i);
      const shortUidMatch = v.error.match(/Missing UID because the CH type (.*) numbers only for player (.*)/i);
      const spaceMatch = v.error.match(/UID contains spaces for player (.*) \(Input: '(.*)'\)/i);
      const negativeMatch = v.error.match(/Negative sign detected for player (.*) \(Raw Server: (.*), Raw UID: (.*)\)/i);

      if (textServerMatch) {
        validationGrouped[ch].push(
          ` • Player : ${textServerMatch[1]}\n   Error  : Server must be numeric\n   Input  : "${textServerMatch[2]}"`
        );
      } else if (ignServerMatch) {
        validationGrouped[ch].push(
          ` • Player : ${ignServerMatch[1]}\n   Error  : Player IGN entered instead of Server`
        );
      } else if (missingMatch) {
        validationGrouped[ch].push(
          ` • Player : ${missingMatch[1]}\n   Error  : Missing Server or UID\n   Input  : Server: '${missingMatch[2]}', UID: '${missingMatch[3]}'`
        );
      } else if (shortUidMatch) {
        validationGrouped[ch].push(
          ` • Player : ${shortUidMatch[2]}\n   Error  : Missing UID (only typed server/short ID)`
        );
      } else if (spaceMatch) {
        validationGrouped[ch].push(
          ` • Player : ${spaceMatch[1]}\n   Error  : UID contains spaces\n   Input  : "${spaceMatch[2]}"`
        );
      } else if (negativeMatch) {
        validationGrouped[ch].push(
          ` • Player : ${negativeMatch[1]}\n   Error  : Negative sign detected in IDs`
        );
      } else {
        validationGrouped[ch].push(` • Error  : ${v.error}`);
      }
    });

    let report = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `📊 ${selectedJob.name.toUpperCase()}\n`;
    report += `OPERATION SUMMARY REPORT\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    report += `🆔 Run ID     : ${run.id}\n`;
    report += `⚙️ Pipeline   : ${selectedJob.type === "diamonds" ? "Diamond Rewards" : "PRL Pipeline"}\n`;
    report += `📅 Date       : ${formatDate(run.startedAt)}\n`;
    report += `✅ Status     : ${run.status.toUpperCase()}\n`;
    report += `📝 Rows Saved : ${Number(run.rowsWritten).toLocaleString()}\n\n`;
    
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `📈 OVERALL METRICS\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    report += `👥 Compiled CHs               : ${viewStats.length}\n`;
    report += `🏆 Active Players/Winners     : ${totalPlayers}\n`;
    const fakesCount = duplicates.filter(d => parseDuplicateError(d)?.isFakedServer).length;
    const crossCount = duplicates.filter(d => {
      const p = parseDuplicateError(d);
      return p && !p.isFakedServer && p.prevCh.toLowerCase() !== p.currCh.toLowerCase();
    }).length;
    const internalCount = duplicates.length - fakesCount - crossCount;

    report += `👥 Compiled CHs               : ${viewStats.length}\n`;
    report += `🏆 Active Players/Winners     : ${totalPlayers}\n`;
    if (fakesCount > 0) {
      report += `🚨 Fake Duplicates (Faked Srv): ${fakesCount}\n`;
    }
    if (crossCount > 0) {
      report += `🔁 Cross-Host Duplicates      : ${crossCount}\n`;
    }
    if (internalCount > 0) {
      report += `📄 Internal Duplicates        : ${internalCount}\n`;
    }
    if (duplicates.length === 0) {
      report += `🔁 Duplicate Entries          : 0\n`;
    }
    report += `❌ Dissolved Tournaments       : ${dissolved.length}\n`;
    report += `🔧 Auto Fixes Applied         : ${autoFixes.length}\n`;
    report += `⚠️ Validation Errors          : ${validationErrors.length}\n\n`;

    if (dissolved.length > 0) {
      report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      report += `🚨 DISSOLVED TOURNAMENTS (${dissolved.length})\n`;
      report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      
      dissolved.forEach(d => {
        report += `❌ ${d.chName.toUpperCase()}\n`;
        const parsed = parseDissolvedError(d.error);
        if (parsed) {
          report += `   └─ Only ${parsed.actual} valid players found\n`;
          report += `      Mode      : ${parsed.mode}\n`;
          report += `      Required  : ${parsed.target}\n`;
          report += `      Minimum   : ${parsed.min}\n`;
          if (parsed.teams) {
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
      
      accessibility.forEach(a => {
        report += `❌ ${a.chName.toUpperCase()}\n`;
        const match = a.error.match(/(.*?)\.\s*\(Teams in responses sheet:\s*([^)]*)\)/i);
        if (match) {
          report += `   ├─ ${match[1]}\n`;
          report += `   └─ Teams in responses sheet : ${match[2]}\n\n`;
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

      duplicates.forEach(d => {
        const parsed = parseDuplicateError(d);
        if (!parsed) {
          if (!internal["Other"]) internal["Other"] = [];
          internal["Other"].push({ name: d.error, server: "", uid: "", prevCh: "", currCh: d.chName, isFakedServer: false });
          return;
        }

        const currCh = parsed.currCh.trim();
        const prevCh = parsed.prevCh.trim();

        if (parsed.isFakedServer) {
          if (!fakes[currCh]) fakes[currCh] = {};
          if (!fakes[currCh][prevCh]) fakes[currCh][prevCh] = [];
          if (!fakes[currCh][prevCh].some(p => p.uid === parsed.uid)) {
            fakes[currCh][prevCh].push(parsed);
          }
        } else if (prevCh.toLowerCase() === currCh.toLowerCase()) {
          if (!internal[currCh]) internal[currCh] = [];
          if (!internal[currCh].some(p => p.uid === parsed.uid)) {
            internal[currCh].push(parsed);
          }
        } else {
          if (!cross[currCh]) cross[currCh] = {};
          if (!cross[currCh][prevCh]) cross[currCh][prevCh] = [];
          if (!cross[currCh][prevCh].some(p => p.uid === parsed.uid)) {
            cross[currCh][prevCh].push(parsed);
          }
        }
      });

      const fakeKeys = Object.keys(fakes).sort();
      if (fakeKeys.length > 0) {
        report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        report += `🚨 FAKE DUPLICATES (COPIED MLBB IDs WITH ALTERED SERVERS)\n`;
        report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        fakeKeys.forEach((ch, idx) => {
          if (idx > 0) {
            report += `──────────────────────────────────────\n\n`;
          }
          const prevChs = Object.keys(fakes[ch]).sort();
          prevChs.forEach((prevCh, pIdx) => {
            if (pIdx > 0) report += `\n`;
            const list = fakes[ch][prevCh];
            report += `【${ch.toUpperCase()}】 ${list.length} fake duplicate(s)\n`;
            report += `Copied MLBB ID from ► ${prevCh}\n\n`;
            list.forEach(p => {
              report += ` • Player Name : ${p.name}\n`;
              report += `   MLBB ID     : ${p.uid}\n`;
              report += `   Faked Server: ${p.server} (Submitted by ${ch})\n`;
              if (p.prevServer) {
                report += `   Real Server : ${p.prevServer} (Original in ${prevCh})\n`;
              }
              report += `\n`;
            });
          });
        });
      }

      const crossKeys = Object.keys(cross).sort();
      if (crossKeys.length > 0) {
        report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        report += `🔁 CROSS-HOST DUPLICATES (SAME SERVER & UID)\n`;
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
            list.forEach(p => {
              report += ` • Player Name : ${p.name}\n`;
              report += `   Server      : ${p.server}\n`;
              report += `   MLBB ID     : ${p.uid}\n\n`;
            });
          });
        });
      }

      const internalKeys = Object.keys(internal).sort();
      if (internalKeys.length > 0) {
        report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        report += `📄 INTERNAL DUPLICATES (SAME CH)\n`;
        report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        internalKeys.forEach((ch, idx) => {
          if (idx > 0) {
            report += `──────────────────────────────────────\n\n`;
          }
          const list = internal[ch];
          report += `【${ch.toUpperCase()}】 ${list.length} duplicate(s)\n\n`;
          list.forEach(p => {
            report += ` • Player Name : ${p.name}\n`;
            if (p.server) {
              report += `   Server      : ${p.server}\n`;
              report += `   MLBB ID     : ${p.uid}\n\n`;
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
        autoFixesGrouped[ch].forEach(f => {
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
        validationGrouped[ch].forEach(v => {
          report += `${v}\n\n`;
        });
      });
    }
    
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `✅ REPORT COMPLETE\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    
    navigator.clipboard.writeText(report);
    toast("Summary report copied to clipboard!", "success");
  };

  const exportReportToCSV = () => {
    if (!selectedJob) return;
    const run = selectedJob.runs?.[0];
    if (!run) return;
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "CH Name,Error/Log Message,Type\n";
    
    viewErrors.forEach(err => {
      const type = getErrorType(err);
      const escapedMsg = err.error.replace(/"/g, '""');
      csvContent += `"${err.chName}","${escapedMsg}","${type}"\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Operation_Report_${selectedJob.name.replace(/\s+/g, "_")}_${run.id.substring(0,6)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const parseDuplicateError = (err: ChError) => {
    const sameServerRegex = /(?:Duplicate player entry found|Duplicate winner found):\s*(.*?)\s*\(Server:\s*(\d*),\s*UID:\s*(\d*)\)\s*was\s*already\s*registered\s*(?:earlier\s*)?in\s*CH\s*(.*)/i;
    const match1 = err.error.match(sameServerRegex);
    if (match1) {
      return {
        name: match1[1].trim(),
        server: match1[2].trim(),
        uid: match1[3].trim(),
        prevCh: match1[4].trim(),
        currCh: err.chName.trim(),
        isFakedServer: false,
      };
    }

    const diffServerRegex = /Duplicate MLBB ID found.*:\s*(.*?)\s*\(UID:\s*(\d*),\s*Server:\s*(\d*)\)\s*was\s*already\s*registered\s*(?:earlier\s*)?in\s*CH\s*(.*?)(?:\s*\(with Server:\s*(\d*)\))?$/i;
    const match2 = err.error.match(diffServerRegex);
    if (match2) {
      return {
        name: match2[1].trim(),
        uid: match2[2].trim(),
        server: match2[3].trim(),
        prevCh: match2[4].trim(),
        prevServer: match2[5] ? match2[5].trim() : undefined,
        currCh: err.chName.trim(),
        isFakedServer: true,
      };
    }

    return null;
  };

  const getChList = () => {
    const chNames = new Set<string>();
    viewStats.forEach(s => chNames.add(s.chName));
    viewErrors.forEach(e => {
      if (e.chName !== "Reporting Sheet") {
        chNames.add(e.chName);
      }
    });
    return Array.from(chNames).sort();
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
    
    // Guard: Prevent double run triggers if job is already in starting list or actively running
    if (startingJobs.has(jobId) || runProgress.get(jobId)?.status === "running") {
      return;
    }

    setStartingJobs(prev => {
      const next = new Set(prev);
      next.add(jobId);
      return next;
    });

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
    } finally {
      setStartingJobs(prev => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
      fetchJobs();
    }
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

  const handleStopClick = async (job: JoinerJob) => {
    const jobId = job.id;
    if (stoppingJobs.has(jobId)) return;

    setStoppingJobs(prev => {
      const next = new Set(prev);
      next.add(jobId);
      return next;
    });

    try {
      const res = await fetch(`/api/jobs/${jobId}/stop`, { method: "POST" });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to stop job");
      }
      toast(`Stopping "${job.name}"...`, "info");
    } catch (error: any) {
      toast(error.message || "Error stopping job", "error");
    } finally {
      setStoppingJobs(prev => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
      fetchJobs();
    }
  };

  const getStatusBadge = (status: string | undefined) => {
    switch (status) {
      case "running":
        return <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />Running</span>;
      case "success":
        return <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Success</span>;
      case "failed":
        return <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold bg-red-500/10 text-red-500 border border-red-500/20"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Failed</span>;
      default:
        return <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold bg-slate-500/10 text-slate-400 border border-slate-500/20"><span className="w-1.5 h-1.5 rounded-full bg-slate-400" />Pending</span>;
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
    <div className="flex flex-col justify-center items-center min-h-[60vh] gap-4 bg-slate-900">
      <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(99,102,241,0.5)]" />
      <div className="text-sm font-bold text-indigo-400/80 animate-pulse uppercase tracking-widest">Loading Dashboard...</div>
    </div>
  );

  return (
    <>
      <ToastProvider />
      <div className="min-h-screen bg-slate-900 relative overflow-hidden font-sans">
        {/* Dynamic Background */}
        <div className="fixed inset-0 -z-10 bg-[url('/grid.svg')] bg-[length:50px_50px] opacity-[0.02]" />
        <div className="fixed inset-0 -z-10">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-600/5 rounded-full blur-[150px]" />
          <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-emerald-900/5 rounded-full blur-[150px]" />
        </div>

        <div className="space-y-8 max-w-[1400px] mx-auto px-4 md:px-8 py-8 md:py-12 z-10 relative">
          {/* Top Bar */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 animate-fade-in pb-6 border-b border-slate-800">
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight text-slate-50 flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                  <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </span>
                Overview
              </h1>
              <p className="text-slate-400 mt-2 text-sm font-medium">Manage your Diamond Rewards and PRL synchronization tasks.</p>
            </div>
            <div className="flex gap-4 items-center">
              <Link href="/jobs/new" className="btn-primary">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                New Sync Job
              </Link>
              <button onClick={() => signOut({ callbackUrl: "/" })} className="text-xs text-white/30 hover:text-slate-50 uppercase tracking-widest font-mono transition-colors">Sign Out</button>
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
            <div className="p-6 md:p-8 border-b border-slate-700/50 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-800/30">
              <h2 className="text-xl font-bold text-slate-50 tracking-tight">Active Sync Jobs</h2>
              <div className="relative w-full sm:w-80">
                <input
                  type="text"
                  placeholder="Search jobs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl py-3 pl-11 pr-4 text-sm text-slate-50 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-inner placeholder:text-slate-500"
                />
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
            </div>

            {/* Cards view */}
            <div className="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-2 lg:gap-8 gap-6">
              {jobs.length === 0 ? (
                <div className="col-span-1 lg:col-span-2 text-center text-slate-400 py-20 space-y-5">
                  <div className="w-20 h-20 mx-auto rounded-3xl bg-slate-800 border border-slate-700 flex items-center justify-center shadow-inner">
                    <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                  </div>
                  <p className="tracking-wide">No sync jobs available. Create one to get started.</p>
                  <Link href="/jobs/new" className="inline-block text-indigo-400 hover:text-indigo-300 font-bold text-sm transition-colors uppercase tracking-widest">Create New Job</Link>
                </div>
              ) : (
                filteredJobs.map(job => {
                  const displayStatus = getDisplayStatus(job);
                  const isRunning = displayStatus === "running";
                  const { progress, progressMessage } = getProgressData(job);
                  const errCount = getErrorCount(job);
                  
                  const chStatsStr = (job.runs?.[0] as any)?.chStats;
                  const chStats = typeof chStatsStr === "string" ? JSON.parse(chStatsStr) : chStatsStr || [];

                  const topBorderClass = isRunning ? "border-amber-500" : displayStatus === "success" ? "border-emerald-500" : displayStatus === "failed" ? "border-red-500" : "border-slate-600";
                  
                  const getAccentHue = () => {
                    if (isRunning) return "from-amber-500/20 to-amber-600/5";
                    if (displayStatus === "failed") return "from-red-500/20 to-red-600/5";
                    if (displayStatus === "success") return "from-emerald-500/20 to-emerald-600/5";
                    if (job.type === "diamonds") return "from-amber-500/10 to-transparent";
                    return "from-indigo-500/10 to-transparent";
                  };

                  const getBorderAccent = () => {
                    if (isRunning) return "group-hover:border-amber-500/50";
                    if (displayStatus === "failed") return "group-hover:border-red-500/50";
                    if (displayStatus === "success") return "group-hover:border-emerald-500/50";
                    if (job.type === "diamonds") return "group-hover:border-amber-500/30";
                    return "group-hover:border-indigo-500/30";
                  };

                  const accentHue = getAccentHue();
                  const borderAccent = getBorderAccent();
                  
                  return (
                    <div key={job.id} className={`group relative flex flex-col justify-between overflow-hidden rounded-3xl bg-[#131825] border border-slate-700/60 ${borderAccent} transition-all duration-500 shadow-2xl hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] hover:-translate-y-1`}>
                      {/* Interactive Gradient Background */}
                      <div className={`absolute inset-0 bg-gradient-to-br ${accentHue} opacity-50 group-hover:opacity-100 transition-opacity duration-500`} />
                      {isRunning && <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600 animate-pulse drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]" />}

                      <div className="p-8 relative z-10">
                        <div className="flex justify-between items-start gap-4 mb-6">
                          <div className="flex gap-4 items-center w-full">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ${job.type === "diamonds" ? "bg-amber-500 border border-amber-400/50 text-amber-950" : "bg-indigo-500 border border-indigo-400/50 text-indigo-950"}`}>
                              {job.type === "diamonds" ? (
                                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              ) : (
                                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                               <div className="font-black text-slate-50 text-2xl tracking-tight mb-1 truncate drop-shadow-sm">{job.name}</div>
                               <div className="flex items-center gap-3 text-xs font-mono font-bold uppercase tracking-widest text-slate-400">
                                 <span>ID: <span className="text-slate-300">{job.id.split("-")[0]}</span></span>
                                 <span className="w-1 h-1 rounded-full bg-slate-600" />
                                 <span className={job.type === "diamonds" ? "text-amber-500/80" : "text-indigo-400/80"}>
                                   {job.type === "diamonds" ? "Diamond Sync" : "PRL Pipeline"}
                                 </span>
                               </div>
                            </div>
                          </div>
                        </div>

                        {/* Status Badges Section */}
                        <div className="flex flex-wrap gap-2 mb-2">
                           {getStatusBadge(displayStatus)}
                           {job.validationEnabled && (
                             <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] uppercase font-black bg-slate-800 text-slate-200 border border-slate-700 shadow-sm">
                               <svg className="w-3.5 h-3.5 text-blue-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-1.828-5.757l-2.828-2.829a1 1 0 111.414-1.414L8.172 9.586l4.414-4.414a1 1 0 111.414 1.414l-5.121 5.121a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                               MooGold API
                             </span>
                           )}
                           {chStats && chStats.length > 0 && (
                             <button onClick={() => handleViewStats(job)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] uppercase font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all shadow-sm">
                               <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                               {chStats.length} Reports Compiled
                             </button>
                           )}
                           {errCount > 0 && (
                             <button onClick={() => handleViewErrors(job)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] uppercase font-black bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:text-red-300 transition-all shadow-sm group/btn">
                               <svg className="w-3.5 h-3.5 group-hover/btn:animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                               {errCount} System Faults
                             </button>
                           )}
                        </div>

                        {isRunning && (
                          <div className="mt-6 space-y-2.5 bg-slate-900/50 p-4 rounded-2xl border border-slate-700/50 backdrop-blur-sm">
                            <div className="flex justify-between text-xs tracking-wide font-bold">
                              <span className="text-amber-400 flex items-center gap-2">
                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                                {progressMessage || "Processing Sheets..."}
                              </span>
                              <span className="text-amber-500 font-mono text-sm">{progress}%</span>
                            </div>
                            <div className="h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                              <div className="h-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-300 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.5)] relative">
                                <div className="absolute top-0 right-0 bottom-0 w-20 bg-gradient-to-r from-transparent to-white/30 animate-pulse" />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Action Footer */}
                      <div className="bg-slate-900/60 p-4 px-6 border-t border-slate-700/50 backdrop-blur-md flex justify-between items-center relative z-10 w-full sm:flex-row flex-col-reverse gap-4">
                        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto overflow-hidden">
                           {isRunning ? (
                             <button 
                               onClick={() => handleStopClick(job)} 
                               disabled={stoppingJobs.has(job.id)}
                               className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-[11px] uppercase tracking-widest text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500 hover:text-red-950 transition-all shadow-sm" 
                               title="Stop Job"
                             >
                               <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                               <span>{stoppingJobs.has(job.id) ? "Stopping..." : "Stop Engine"}</span>
                             </button>
                           ) : (
                             <button 
                               onClick={() => handleRunClick(job)} 
                               disabled={startingJobs.has(job.id)}
                               className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-[11px] uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500 hover:text-emerald-950 transition-all shadow-sm ${startingJobs.has(job.id) ? "opacity-50 cursor-not-allowed" : ""}`} 
                               title="Run Job"
                             >
                               <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> 
                               <span>{startingJobs.has(job.id) ? "Starting..." : "Run Engine"}</span>
                             </button>
                           )}
                           <Link href={`/jobs/${job.id}/edit`} className="p-2.5 rounded-xl text-slate-400 bg-slate-800 border border-slate-700 hover:text-white hover:bg-slate-700 transition-all shadow-sm" title="Edit Configuration">
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                           </Link>
                           <button onClick={() => handleDeleteClick(job)} className="p-2.5 rounded-xl text-slate-500 bg-slate-800 border border-slate-700 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-all shadow-sm" title="Delete Pipeline">
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                           </button>
                        </div>
                        
                        <div className="flex gap-4 items-center w-full sm:w-auto justify-between sm:justify-end">
                          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest text-left sm:text-right">
                             Last Run: <span className="text-slate-300 ml-1">{formatTimeAgo(job.lastRunAt)}</span>
                          </div>
                          {job.targetSpreadsheetId && (
                            <a href={`https://docs.google.com/spreadsheets/d/${job.targetSpreadsheetId}`} target="_blank" rel="noopener noreferrer" className="group/link shrink-0 inline-flex items-center justify-center p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:bg-indigo-500 hover:border-indigo-400 hover:text-white transition-all shadow-sm" title="View Target Sheet">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                            </a>
                          )}
                        </div>
                      </div>
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
          title={`Operation Audit: ${selectedJob?.name || ""}`}
          maxWidth="max-w-4xl"
          footer={
            <div className="flex flex-col sm:flex-row justify-between items-center w-full gap-4">
              <div className="flex gap-2 w-full sm:w-auto">
                <button 
                  onClick={copyTextReport} 
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500 hover:text-white transition-all text-xs"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                  Copy Summary
                </button>
                <button 
                  onClick={exportReportToCSV} 
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500 hover:text-emerald-950 transition-all text-xs"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Export CSV
                </button>
              </div>
              <button onClick={() => setErrorsModalOpen(false)} className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-semibold bg-white/5 text-white/80 hover:bg-white/10 transition-colors text-xs">Close</button>
            </div>
          }
        >
          {/* Tab Navigation */}
          <div className="flex border-b border-slate-800 mb-6 overflow-x-auto scrollbar-none shrink-0 gap-1 pb-px">
            <button 
              onClick={() => setActiveLogTab("overview")} 
              className={`px-4 py-3 text-xs uppercase tracking-wider font-extrabold border-b-2 transition-all whitespace-nowrap ${activeLogTab === "overview" ? "border-indigo-500 text-indigo-400" : "border-transparent text-slate-400 hover:text-white"}`}
            >
              Overview
            </button>
            <button 
              onClick={() => setActiveLogTab("chHealth")} 
              className={`px-4 py-3 text-xs uppercase tracking-wider font-extrabold border-b-2 transition-all whitespace-nowrap ${activeLogTab === "chHealth" ? "border-indigo-500 text-indigo-400" : "border-transparent text-slate-400 hover:text-white"}`}
            >
              CH Health & Stats
            </button>
            <button 
              onClick={() => setActiveLogTab("duplicates")} 
              className={`px-4 py-3 text-xs uppercase tracking-wider font-extrabold border-b-2 transition-all whitespace-nowrap ${activeLogTab === "duplicates" ? "border-indigo-500 text-indigo-400" : "border-transparent text-slate-400 hover:text-white"}`}
            >
              Duplicates ({viewErrors.filter(err => getErrorType(err) === "duplicate").length})
            </button>
            <button 
              onClick={() => setActiveLogTab("logs")} 
              className={`px-4 py-3 text-xs uppercase tracking-wider font-extrabold border-b-2 transition-all whitespace-nowrap ${activeLogTab === "logs" ? "border-indigo-500 text-indigo-400" : "border-transparent text-slate-400 hover:text-white"}`}
            >
              Raw Logs ({viewErrors.length})
            </button>
          </div>

          <div className="space-y-6 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar min-h-[300px]">
            {activeLogTab === "overview" && (() => {
              const totalPlayers = viewStats.reduce((sum, s) => sum + s.count, 0);
              const duplicatesCount = viewErrors.filter(err => getErrorType(err) === "duplicate").length;
              const criticalCount = viewErrors.filter(err => getErrorType(err) === "accessibility" || getErrorType(err) === "dissolved").length;
              const autoFixesCount = viewErrors.filter(err => getErrorType(err) === "validation_fixed").length;

              return (
                <div className="space-y-6">
                  {/* Metric Cards Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-slate-800/40 border border-slate-700/50 p-4 rounded-2xl flex flex-col justify-between">
                      <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">Total Players</span>
                      <span className="text-2xl font-black text-white mt-1">{totalPlayers}</span>
                    </div>
                    <div className="bg-red-500/5 border border-red-500/20 p-4 rounded-2xl flex flex-col justify-between">
                      <span className="text-[10px] uppercase font-black tracking-wider text-red-400">Critical Failures</span>
                      <span className="text-2xl font-black text-red-400 mt-1">{criticalCount}</span>
                    </div>
                    <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-2xl flex flex-col justify-between">
                      <span className="text-[10px] uppercase font-black tracking-wider text-amber-400">Duplicates</span>
                      <span className="text-2xl font-black text-amber-400 mt-1">{duplicatesCount}</span>
                    </div>
                    <div className="bg-blue-500/5 border border-blue-500/20 p-4 rounded-2xl flex flex-col justify-between">
                      <span className="text-[10px] uppercase font-black tracking-wider text-blue-400">Auto-Fixes Applied</span>
                      <span className="text-2xl font-black text-blue-400 mt-1">{autoFixesCount}</span>
                    </div>
                  </div>

                  {/* Health Status Banner */}
                  {criticalCount > 0 ? (
                    <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex gap-3 items-start">
                      <span className="text-red-400 mt-0.5 shrink-0">⚠️</span>
                      <div>
                        <h4 className="text-sm font-bold text-red-400 uppercase tracking-wider">Action Required: Critical Faults Detected</h4>
                        <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                          There are {criticalCount} critical issues preventing successful data compilation for some Community Hosts. Most commonly, this is due to sheets not being set to "Anyone with the link can view". Check the "CH Health" tab to locate the affected hosts.
                        </p>
                      </div>
                    </div>
                  ) : duplicatesCount > 0 ? (
                    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex gap-3 items-start">
                      <span className="text-amber-400 mt-0.5 shrink-0">⚠️</span>
                      <div>
                        <h4 className="text-sm font-bold text-amber-400 uppercase tracking-wider">Nominal Execution with Warnings</h4>
                        <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                          Data compiled successfully, but duplicates were detected. Players who registered under multiple hosts are highlighted in the "Duplicates" tab and highlighted in pink on the output spreadsheet.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex gap-3 items-start">
                      <span className="text-emerald-400 mt-0.5 shrink-0">✅</span>
                      <div>
                        <h4 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">System Healthy & Nominal</h4>
                        <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                          All spreadsheet data was compiled nominally! No critical failures or duplicate entries were found. All target sheets were successfully synchronized and formatted.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Quick Alerts */}
                  {viewErrors.filter(err => getErrorType(err) === "accessibility").length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs uppercase font-extrabold tracking-wider text-slate-400">Inaccessible / Broken Sheets</h3>
                      <div className="grid grid-cols-1 gap-2">
                        {viewErrors.filter(err => getErrorType(err) === "accessibility").map((err, i) => (
                          <div key={i} className="flex justify-between items-center p-3 rounded-xl bg-slate-800/20 border border-slate-700/50 text-xs">
                            <span className="font-extrabold text-white">{err.chName}</span>
                            <span className="text-red-400 text-[11px] font-mono">{err.error}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {activeLogTab === "chHealth" && (
              <div className="space-y-4">
                <div className="relative mb-2">
                  <input 
                    type="text" 
                    placeholder="Filter Community Hosts..."
                    value={modalSearch}
                    onChange={(e) => setModalSearch(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-xs text-slate-55 focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-slate-600 shadow-inner"
                  />
                  <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
                
                <div className="border border-slate-800/80 rounded-2xl overflow-hidden bg-slate-950/20">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-900/60 border-b border-slate-800 text-[10px] uppercase font-black tracking-wider text-slate-400">
                        <th className="p-4">CH Nickname</th>
                        <th className="p-4 text-center">Status</th>
                        <th className="p-4 text-center">Registered Players</th>
                        <th className="p-4">Issues Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {getChList()
                        .filter(name => name.toLowerCase().includes(modalSearch.toLowerCase()))
                        .map((name, i) => {
                          const count = viewStats.find(s => s.chName === name)?.count ?? 0;
                          const chErrs = viewErrors.filter(e => e.chName === name);
                          
                          let statusBadge = (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <span className="w-1 h-1 rounded-full bg-emerald-500" /> Normal
                            </span>
                          );

                          const hasCritical = chErrs.some(e => ["accessibility", "dissolved"].includes(getErrorType(e)));
                          const hasDup = chErrs.some(e => getErrorType(e) === "duplicate");
                          const hasWarning = chErrs.some(e => ["validation_fixed", "validation_error"].includes(getErrorType(e)));

                          if (hasCritical) {
                            statusBadge = (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-black bg-red-500/10 text-red-400 border border-red-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Critical
                              </span>
                            );
                          } else if (hasDup) {
                            statusBadge = (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                <span className="w-1 h-1 rounded-full bg-amber-500" /> Duplicate
                              </span>
                            );
                          } else if (hasWarning) {
                            statusBadge = (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-black bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                <span className="w-1 h-1 rounded-full bg-blue-500" /> Warnings
                              </span>
                            );
                          }

                          return (
                            <tr key={i} className="hover:bg-white/[0.01] transition-colors">
                              <td className="p-4 font-extrabold text-white">{name}</td>
                              <td className="p-4 text-center">{statusBadge}</td>
                              <td className="p-4 text-center font-mono font-bold text-slate-300">{count}</td>
                              <td className="p-4">
                                {chErrs.length === 0 ? (
                                  <span className="text-slate-500 italic">None</span>
                                ) : (
                                  <div className="space-y-1 max-w-md">
                                    {chErrs.map((e, idx) => {
                                      const type = getErrorType(e);
                                      const colorClass = 
                                        type === "accessibility" || type === "dissolved" ? "text-red-400/80" :
                                        type === "duplicate" ? "text-amber-400/80" :
                                        type === "validation_fixed" ? "text-blue-400/80" : "text-slate-300";
                                      return (
                                        <div key={idx} className={`text-[11px] leading-relaxed font-mono ${colorClass} break-words`}>
                                          • {e.error}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeLogTab === "duplicates" && (
              <div className="space-y-4">
                {viewErrors.filter(err => getErrorType(err) === "duplicate").length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-xs">
                    <span className="text-2xl block mb-2">🎉</span>
                    No duplicate entries detected in this compilation.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {viewErrors
                      .filter(err => getErrorType(err) === "duplicate")
                      .map((err, i) => {
                        const parsed = parseDuplicateError(err);
                        if (!parsed) {
                          return (
                            <div key={i} className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 text-xs">
                              <div className="font-extrabold text-white mb-2">{err.chName}</div>
                              <div className="font-mono text-amber-300/80 leading-relaxed">{err.error}</div>
                            </div>
                          );
                        }

                        const isFake = parsed.isFakedServer;
                        const bgClass = isFake 
                          ? "bg-[#1c1214] border-rose-500/30 hover:border-rose-500/50" 
                          : "bg-[#131722] border-amber-500/10 hover:border-amber-500/25";
                        const barClass = isFake ? "bg-rose-500" : "bg-amber-500/50";
                        const badgeClass = isFake 
                          ? "text-rose-400 font-extrabold bg-rose-500/10 border-rose-500/30" 
                          : "text-slate-400 font-bold bg-slate-800 border-slate-700";
                        const badgeText = isFake ? "🚨 FAKE DUPLICATE" : "MLBB PLAYER";

                        return (
                          <div key={i} className={`p-4 rounded-2xl border transition-all flex flex-col justify-between relative overflow-hidden ${bgClass}`}>
                            <div className={`absolute left-0 top-0 bottom-0 w-1 ${barClass}`} />
                            <div>
                              <div className="flex justify-between items-start gap-4">
                                <h4 className="font-black text-sm text-white tracking-wide">{parsed.name}</h4>
                                <span className={`text-[9px] uppercase tracking-widest font-mono px-2 py-0.5 rounded border ${badgeClass}`}>
                                  {badgeText}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                                <span>UID: <span className="text-white font-bold">{parsed.uid}</span></span>
                                {isFake ? (
                                  <>
                                    <span>Faked Server: <span className="text-rose-400 font-black">{parsed.server}</span></span>
                                    {parsed.prevServer && <span>Real Server: <span className="text-emerald-400 font-black">{parsed.prevServer}</span></span>}
                                  </>
                                ) : (
                                  <span>Server: <span className="text-slate-300 font-bold">{parsed.server}</span></span>
                                )}
                              </div>
                            </div>
                            
                            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                              <div className="flex flex-col">
                                <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">{isFake ? "Original CH" : "Originally In"}</span>
                                <span className="font-extrabold text-indigo-400">{parsed.prevCh}</span>
                              </div>
                              <div className="text-slate-500 shrink-0 font-bold px-2">➡️</div>
                              <div className="flex flex-col items-end">
                                <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">{isFake ? "Copied By CH" : "Duplicate In"}</span>
                                <span className={`font-extrabold ${isFake ? "text-rose-400" : "text-amber-400"}`}>{parsed.currCh}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {activeLogTab === "logs" && (
              <div className="space-y-4">
                <div className="relative mb-2">
                  <input 
                    type="text" 
                    placeholder="Search logs by CH or Error message..."
                    value={modalSearch}
                    onChange={(e) => setModalSearch(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-xs text-slate-50 focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-slate-600 shadow-inner"
                  />
                  <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>

                <div className="space-y-2">
                  {viewErrors.length === 0 ? (
                    <p className="text-slate-500 italic text-center py-12 text-xs">All nodes operating nominally.</p>
                  ) : (
                    viewErrors
                      .filter(err => err.chName.toLowerCase().includes(modalSearch.toLowerCase()) || err.error.toLowerCase().includes(modalSearch.toLowerCase()))
                      .map((err, i) => {
                        const type = getErrorType(err);
                        const borderClass = 
                          type === "accessibility" || type === "dissolved" ? "border-red-500/20 bg-[#1e1414]/30 text-red-300" :
                          type === "duplicate" ? "border-amber-500/20 bg-[#1e1a14]/30 text-amber-300" :
                          type === "validation_fixed" ? "border-blue-500/20 bg-[#14181e]/30 text-blue-300" :
                          "border-slate-800 bg-[#161922]/30 text-slate-300";

                        const accentColor = 
                          type === "accessibility" || type === "dissolved" ? "bg-red-500/50" :
                          type === "duplicate" ? "bg-amber-500/50" :
                          type === "validation_fixed" ? "bg-blue-500/50" :
                          "bg-slate-600";

                        return (
                          <div key={i} className={`p-4 rounded-xl border relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-6 ${borderClass}`}>
                            <div className={`absolute left-0 top-0 bottom-0 w-1 ${accentColor}`} />
                            <div className="text-sm font-black text-white shrink-0 tracking-wide">{err.chName}</div>
                            <div className="text-xs leading-relaxed font-mono sm:text-right break-words">{err.error}</div>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            )}
          </div>
        </Modal>
      </div>
    </>
  );
}
