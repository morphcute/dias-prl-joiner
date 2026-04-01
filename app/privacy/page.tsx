import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-between bg-slate-900 text-slate-300 relative overflow-hidden font-sans">
      {/* Dynamic Background */}
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-900/90 to-slate-950 opacity-100" />
      <div className="fixed inset-0 -z-10 bg-[url('/grid.svg')] bg-[length:50px_50px] opacity-[0.03]" />
      <div className="fixed inset-0 -z-10">
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-indigo-600/5 rounded-full blur-[150px]" />
      </div>

      <div className="flex-1 w-full max-w-4xl mx-auto z-10 py-16 px-6 sm:px-12 animate-fade-in">
        <Link href="/" className="inline-flex items-center gap-2 text-indigo-400 hover:text-indigo-300 font-bold transition-colors mb-10">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          Back to Home
        </Link>

        <div className="space-y-4 mb-12">
          <h1 className="text-4xl md:text-5xl font-black text-slate-50 tracking-tight">Privacy Policy</h1>
          <p className="text-slate-500 font-mono text-xs uppercase tracking-widest font-bold">Last updated: {new Date().toLocaleDateString()}</p>
        </div>
        
        <div className="space-y-10 text-slate-400 leading-relaxed font-medium">
          <p className="text-lg text-slate-300">This Privacy Policy outlines how your information is collected, used, and protected while using the Dias & PRL Auto Joiner application.</p>
          
          <div className="space-y-3">
             <h3 className="text-2xl font-bold text-slate-50 tracking-tight">1. Information We Collect</h3>
             <p>When you authenticate via Google, we collect your basic profile information (Name, Email, Profile Picture) strictly to identify your account within the app. We request API tokens permitting read and write access to your Google Spreadsheets.</p>
          </div>

          <div className="space-y-3">
             <h3 className="text-2xl font-bold text-slate-50 tracking-tight">2. How We Use Your Information</h3>
             <p>Your Google API permissions are used exclusively to execute the sync jobs you create: resolving Google Sheet IDs, reading Community Handler data, and writing that data into your designated Target Spreadsheets. Your Google tokens are securely encrypted and stored.</p>
          </div>

          <div className="space-y-3">
             <h3 className="text-2xl font-bold text-slate-50 tracking-tight">3. Data Retention</h3>
             <p>We store your joiner job configurations and execution history (Runs, Errors) to provide visibility into past synchronization events. The actual row data contained within your spreadsheets (Player Names, IGNs, Server IDs, UIDs) is <strong>never permanently stored</strong> in our database; it is transiently processed and instantly written to your target Google Sheet.</p>
          </div>

          <div className="space-y-3">
             <h3 className="text-2xl font-bold text-slate-50 tracking-tight">4. Third-Party Services</h3>
             <p className="mb-2">We integrate with the following third parties:</p>
             <ul className="list-disc pl-5 space-y-2 text-slate-400">
               <li><strong className="text-slate-200">Google:</strong> Used for Authentication and communicating with the Google Sheets API.</li>
               <li><strong className="text-slate-200">MooGold API:</strong> Used for optional MLBB UID verification. If this feature is enabled, player UID and Server data are securely transmitted to MooGold exclusively for account verification purposes.</li>
             </ul>
          </div>

          <div className="space-y-3">
             <h3 className="text-2xl font-bold text-slate-50 tracking-tight">5. Security</h3>
             <p>We implement industry-standard encryption to protect your stored Google API tokens. Access to the dashboard is strictly gated behind Google OAuth. We do not sell or share any user metrics or spreadsheet data with unauthorized third parties.</p>
          </div>
          
          <div className="space-y-3">
             <h3 className="text-2xl font-semibold text-white tracking-tight">6. Contact Us</h3>
             <p>If you have any questions or concerns regarding this privacy policy or our data handling practices, please contact the site administrator.</p>
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
