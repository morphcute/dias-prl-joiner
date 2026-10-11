import Link from "next/link";
import { BrandLogo, AppFooter } from "@/components/BrandNav";
import { ArrowLeft, Lock } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col justify-between bg-cream-100 text-ink px-4 sm:px-6 py-6 selection:bg-rust/20">
      {/* Header */}
      <header className="w-full max-w-4xl mx-auto flex items-center justify-between pt-2 pb-6">
        <Link href="/" className="btn-retro-pill">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Home</span>
        </Link>
        <BrandLogo size="md" />
        <div className="w-16" />
      </header>

      {/* Main Document Content */}
      <main className="flex-1 w-full max-w-3xl mx-auto my-6 animate-fade-in space-y-8">
        <div className="card-retro p-8 sm:p-12 space-y-8 bg-white">
          <div className="space-y-2 border-b-2 border-dashed border-ink/20 pb-6">
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-rust">
              DATA SECURITY & COMPLIANCE
            </span>
            <h1 className="font-serif-title text-3xl sm:text-4xl md:text-5xl font-black text-ink tracking-tight">
              Privacy Policy<span className="text-rust">.</span>
            </h1>
            <p className="text-xs font-mono font-bold uppercase tracking-wider text-ink/50 pt-1">
              Effective Date: {new Date().toLocaleDateString()} • Dias & PRL Auto Joiner
            </p>
          </div>

          <div className="space-y-8 text-ink/80 text-sm leading-relaxed font-medium">
            <p className="text-base text-ink font-semibold">
              This Privacy Policy details how Dias & PRL Auto Joiner processes, secures, and handles your information when using the platform.
            </p>

            <div className="space-y-2.5">
              <h3 className="font-serif-title text-xl font-bold text-ink">1. Information We Collect</h3>
              <p>
                When authenticating through Google OAuth, we receive your basic profile credentials (Name, Email, Profile Avatar) to establish your account session. We request OAuth scopes allowing read and write operations strictly for the spreadsheets you specify.
              </p>
            </div>

            <div className="space-y-2.5">
              <h3 className="font-serif-title text-xl font-bold text-ink">2. Zero Permanent Row Storage</h3>
              <p>
                Player rosters, Game UIDs, Ign, Server IDs, and reward entries processed through synchronization jobs are <strong className="text-ink font-bold">never permanently stored</strong> in our persistent databases. Data is processed in-memory during sync execution and written directly into your destination Google Sheet.
              </p>
            </div>

            <div className="space-y-2.5">
              <h3 className="font-serif-title text-xl font-bold text-ink">3. Third-Party Integrations</h3>
              <p>
                Our system communicates with:
              </p>
              <ul className="list-disc pl-5 space-y-2 font-medium text-ink/80">
                <li>
                  <strong className="text-ink">Google Cloud Sheets & Drive APIs:</strong> For executing spreadsheet compilation and file creation.
                </li>
                <li>
                  <strong className="text-ink">MooGold Account Verification API:</strong> When enabled, Player UID and Server numbers are checked for identity validity without retaining player credentials.
                </li>
              </ul>
            </div>

            <div className="space-y-2.5">
              <h3 className="font-serif-title text-xl font-bold text-ink">4. Session Security & Auto-Signout</h3>
              <p>
                To protect your Google Sheet credentials, user sessions are automatically protected by an inactivity watchdog that terminates active sessions after 30 minutes of idle time.
              </p>
            </div>
          </div>

          <div className="pt-6 border-t-2 border-dashed border-ink/20 flex items-center justify-between">
            <Link href="/" className="btn-retro-pill">
              — BACK TO HOME —
            </Link>
            <span className="text-[10px] font-mono text-ink/40">OAUTH: SCOPE_SHEETS</span>
          </div>
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
