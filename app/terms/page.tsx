import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-between bg-slate-900 text-slate-300 relative overflow-hidden font-sans">
      {/* Dynamic Background */}
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-900/90 to-slate-950 opacity-100" />
      <div className="fixed inset-0 -z-10 bg-[url('/grid.svg')] bg-[length:50px_50px] opacity-[0.03]" />
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-600/5 rounded-full blur-[120px]" />
      </div>

      <div className="flex-1 w-full max-w-4xl mx-auto z-10 py-16 px-6 sm:px-12 animate-fade-in">
        <Link href="/" className="inline-flex items-center gap-2 text-indigo-400 hover:text-indigo-300 font-bold transition-colors mb-10">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          Back to Home
        </Link>

        <div className="space-y-4 mb-12">
          <h1 className="text-4xl md:text-5xl font-black text-slate-50 tracking-tight">Terms of Service</h1>
          <p className="text-slate-500 font-mono text-xs uppercase tracking-widest font-bold">Last updated: {new Date().toLocaleDateString()}</p>
        </div>
        
        <div className="space-y-10 text-slate-400 leading-relaxed font-medium">
          <p className="text-lg text-slate-300">Welcome to the Dias & PRL Auto Joiner. By accessing and using this application, you accept and agree to be bound by the terms and provisions of this agreement.</p>
          
          <div className="space-y-3">
             <h3 className="text-2xl font-bold text-slate-50 tracking-tight">1. Description of Service</h3>
             <p>This tool automates the consolidation of Google Spreadsheets related to esports diamond rewards and pre-registered lists (PRL). It utilizes Google APIs to read and write spreadsheet data on your behalf.</p>
          </div>

          <div className="space-y-3">
             <h3 className="text-2xl font-bold text-slate-50 tracking-tight">2. Google Account Authorization</h3>
             <p>By signing in with Google, you grant the application permission to access your Google Drive and Google Sheets. The application only accesses sheets that you explicitly link or configure within your joiner jobs. The application will not overwrite or delete existing data outside of the specific target sheets you designate.</p>
          </div>

          <div className="space-y-3">
             <h3 className="text-2xl font-bold text-slate-50 tracking-tight">3. User Responsibilities</h3>
             <p>You are strictly responsible for ensuring that you have the necessary rights, permissions, and consent to access, process, and consolidate the third-party (Community Handler) spreadsheets provided to this tool.</p>
          </div>

          <div className="space-y-3">
             <h3 className="text-2xl font-bold text-slate-50 tracking-tight">4. Limitation of Liability</h3>
             <p>The application is provided &quot;as is&quot; without any warranties, express or implied. The developers and maintainers are not responsible for any data loss, Google API quota limitations, API bans, or service disruptions caused by third-party platforms (like Google or MooGold).</p>
          </div>

          <div className="space-y-3">
             <h3 className="text-2xl font-semibold text-white tracking-tight">5. Abuse and Fair Use</h3>
             <p>Users must not abuse the synchronization engine by purposefully spamming API requests or attempting to overload the system. Accounts found violating fair use policies may have their access revoked without notice.</p>
          </div>
        </div>
      </div>

      <footer className="w-full py-8 text-center z-10 border-t border-slate-800 bg-slate-900/80 backdrop-blur-2xl mt-12">
        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">
          &copy; {new Date().getFullYear()} Dias & PRL Auto Joiner.
        </p>
      </footer>
    </div>
  );
}
