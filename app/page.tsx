import { auth, signIn } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-between bg-slate-900 text-slate-50 overflow-hidden relative selection:bg-indigo-500/30 font-sans">
      {/* Dynamic Background */}
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-900/90 to-slate-950 opacity-100" />
      <div className="fixed inset-0 -z-10 bg-[url('/grid.svg')] bg-[length:50px_50px] opacity-[0.03]" />
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-teal-600/10 rounded-full blur-[150px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-500/5 rounded-full blur-[150px]" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-5xl mx-auto z-10 py-20 px-6">
        <div className="text-center space-y-8 max-w-3xl mx-auto animate-fade-in">
          {/* Logo/Icon */}
          <div className="flex justify-center mb-6">
            <div className="relative group cursor-default">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-indigo-300 rounded-[2.5rem] blur-xl opacity-20 group-hover:opacity-40 transition-opacity duration-700" />
              <img src="/logo.png" alt="Community Hero Logo" className="relative h-40 w-auto object-contain drop-shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:-translate-y-1 transition-transform duration-500" />
            </div>
          </div>

          {/* Hero Typography */}
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800 border border-slate-700 text-xs font-bold text-slate-300 mb-2 shadow-2xl shadow-indigo-500/5">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.8)]" />
              Community Hero Platform
            </div>
            
            <h1 className="text-5xl md:text-7xl font-black tracking-tight text-slate-50 leading-[1.1]">
              Diamonds and
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-indigo-300 to-indigo-500 drop-shadow-sm">
                PRL Joiner
              </span>
            </h1>
            
            <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed font-medium">
              Automatically extract and combine Diamond Rewards and PRL entries from multiple CH Handlers into a single, compiled spreadsheet. Save hours of manual copy-pasting.
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8 pb-4">
            {[
              { title: "Diamond Sync", desc: "Automated reward consolidation", icon: "💎", color: "from-amber-500/10 to-amber-500/5 text-amber-500", border: "border-amber-500/20 shadow-amber-500/5" },
              { title: "PRL Processing", desc: "Smart 5v5 team validation", icon: "📋", color: "from-blue-500/10 to-blue-500/5 text-blue-400", border: "border-blue-500/20 shadow-blue-500/5" },
              { title: "API Verification", desc: "MooGold UID integrations", icon: "⚡", color: "from-indigo-500/10 to-indigo-500/5 text-indigo-400", border: "border-indigo-500/20 shadow-indigo-500/5" }
            ].map((f, i) => (
              <div key={i} className={`p-8 rounded-3xl bg-slate-800 bg-gradient-to-br ${f.color} border ${f.border} backdrop-blur-md flex flex-col items-center text-center space-y-4 hover:-translate-y-2 transition-transform duration-300 shadow-xl`}>
                <div className="text-4xl mb-2 filter drop-shadow-md">{f.icon}</div>
                <h3 className="font-extrabold text-slate-50 tracking-wide text-lg">{f.title}</h3>
                <p className="text-sm text-slate-400 font-medium leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Sign In Trigger */}
          {/* Sign In Trigger */}
          <div className="pt-8 flex flex-col items-center justify-center space-y-4">
            <form action={async () => { "use server"; await signIn("google", { redirectTo: "/dashboard" }); }} className="w-full max-w-sm">
              <button
                type="submit"
                className="w-full relative group overflow-visible rounded-2xl p-[2px] shadow-2xl shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:-translate-y-0.5 transition-all duration-300"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-indigo-400 to-indigo-600 opacity-60 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl" />
                <div className="relative flex items-center justify-center gap-3 px-8 py-4 bg-slate-900 rounded-2xl group-hover:bg-slate-800 transition-colors">
                  <svg className="w-6 h-6 shrink-0 bg-white rounded-full p-1" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <span className="text-slate-50 font-bold tracking-wide text-lg">
                    Continue with Google
                  </span>
                </div>
              </button>
            </form>
            <p className="text-[11px] text-slate-500 uppercase tracking-widest font-bold font-mono mt-4">
              Secure Auth Verified
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full py-8 text-center z-10 border-t border-slate-800 bg-slate-900/80 backdrop-blur-2xl">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-slate-400 font-medium">
          <span>&copy; {new Date().getFullYear()} Dias & PRL Auto Joiner.</span>
          <span className="hidden sm:inline text-slate-700">|</span>
          <div className="flex items-center gap-6">
            <Link href="/terms" className="hover:text-indigo-400 transition-colors">Terms of Service</Link>
            <Link href="/privacy" className="hover:text-indigo-400 transition-colors">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
