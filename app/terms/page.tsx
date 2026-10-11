import Link from "next/link";
import { BrandLogo, AppFooter } from "@/components/BrandNav";
import { ArrowLeft, Shield } from "lucide-react";

export default function TermsPage() {
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
              LEGAL TERMS & CONDITIONS
            </span>
            <h1 className="font-serif-title text-3xl sm:text-4xl md:text-5xl font-black text-ink tracking-tight">
              Terms of Service<span className="text-rust">.</span>
            </h1>
            <p className="text-xs font-mono font-bold uppercase tracking-wider text-ink/50 pt-1">
              Effective Date: {new Date().toLocaleDateString()} • Dias & PRL Auto Joiner
            </p>
          </div>

          <div className="space-y-8 text-ink/80 text-sm leading-relaxed font-medium">
            <p className="text-base text-ink font-semibold">
              Welcome to the Dias & PRL Auto Joiner (Community Hero Platform). By accessing or utilizing this application, you agree to be bound by the terms and provisions set forth herein.
            </p>

            <div className="space-y-2.5">
              <h3 className="font-serif-title text-xl font-bold text-ink">1. Description of Service</h3>
              <p>
                This application automates the consolidation and normalization of Google Spreadsheets related to esports diamond reward distribution and pre-registered tournament rosters (PRL). It communicates with Google Cloud APIs to read and compile data directly on your behalf.
              </p>
            </div>

            <div className="space-y-2.5">
              <h3 className="font-serif-title text-xl font-bold text-ink">2. Google Account Authorization</h3>
              <p>
                By signing in with Google, you authorize the application to access designated Google Spreadsheets within your account. The application only accesses sheets that you explicitly link or configure in your joiner jobs. Data outside your explicitly configured spreadsheets is never modified.
              </p>
            </div>

            <div className="space-y-2.5">
              <h3 className="font-serif-title text-xl font-bold text-ink">3. User Responsibilities & Data Rights</h3>
              <p>
                You are solely responsible for ensuring that you have the appropriate rights, licenses, and permissions to access and consolidate third-party Community Handler (CH) spreadsheets processed through this tool.
              </p>
            </div>

            <div className="space-y-2.5">
              <h3 className="font-serif-title text-xl font-bold text-ink">4. Quotas & Rate Limits</h3>
              <p>
                The service implements rate-pacing and retry mechanisms to respect Google Cloud API read and write quotas. However, Google API service disruptions or quota exhaustion on the consumer project are subject to Google Cloud Platform policies.
              </p>
            </div>

            <div className="space-y-2.5">
              <h3 className="font-serif-title text-xl font-bold text-ink">5. Fair Use & Prohibited Conduct</h3>
              <p>
                Users agree not to spam API executions or overload system endpoints. Automated abuse or unauthorized exploitation of backend pipelines will result in immediate termination of account access.
              </p>
            </div>
          </div>

          <div className="pt-6 border-t-2 border-dashed border-ink/20 flex items-center justify-between">
            <Link href="/" className="btn-retro-pill">
              — BACK TO HOME —
            </Link>
            <span className="text-[10px] font-mono text-ink/40">SEC-ID: 715290984808</span>
          </div>
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
