import { auth, signIn } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-between bg-[#09090b] text-white overflow-hidden relative selection:bg-amber-500/30">
      {/* Dynamic Background */}
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#0B0F19] to-black opacity-80" />
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-amber-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[150px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-violet-500/5 rounded-full blur-[150px]" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-5xl mx-auto z-10 py-20 px-6">
        <div className="text-center space-y-8 max-w-3xl mx-auto animate-fade-in">
          {/* Logo/Icon */}
          <div className="flex justify-center mb-6">
            <div className="relative group cursor-default">
              <div className="absolute inset-0 bg-gradient-to-r from-amber-500 to-amber-300 rounded-2xl blur-xl opacity-20 group-hover:opacity-40 transition-opacity duration-700" />
              <div className="relative w-24 h-24 rounded-2xl bg-[#111116] border border-white/10 flex items-center justify-center backdrop-blur-2xl shadow-2xl">
                <svg className="w-12 h-12 text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.5)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Hero Typography */}
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-white/60 mb-2 shadow-xl shadow-black/50">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
              Automation Engine Online
            </div>
            
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white leading-[1.1]">
              The Premium
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-500 drop-shadow-sm">
                Esports Joiner
              </span>
            </h1>
            
            <p className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto leading-relaxed font-light">
              Seamlessly consolidate Diamond Rewards and Pre-Registered Lists from hundreds of Community Handlers. Built for scale, designed for speed.
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8 pb-4">
            {[
              { title: "Diamond Sync", desc: "Automated reward consolidation", icon: "💎", color: "from-amber-500/20 to-amber-500/5", border: "border-amber-500/20" },
              { title: "PRL Processing", desc: "Smart 5v5 team validation", icon: "📋", color: "from-blue-500/20 to-blue-500/5", border: "border-blue-500/20" },
              { title: "API Verification", desc: "MooGold UID integrations", icon: "⚡", color: "from-violet-500/20 to-violet-500/5", border: "border-violet-500/20" }
            ].map((f, i) => (
              <div key={i} className={`p-6 rounded-2xl bg-gradient-to-br ${f.color} border ${f.border} backdrop-blur-md flex flex-col items-center text-center space-y-3 hover:-translate-y-1 transition-transform duration-300 shadow-xl shadow-black/20`}>
                <div className="text-3xl mb-1">{f.icon}</div>
                <h3 className="font-semibold text-white/90">{f.title}</h3>
                <p className="text-sm text-white/40 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Sign In Trigger */}
          <div className="pt-6 flex flex-col items-center justify-center space-y-4">
            <form action={async () => { "use server"; await signIn("google", { redirectTo: "/dashboard" }); }} className="w-full max-w-sm">
              <button
                type="submit"
                className="w-full relative group overflow-hidden rounded-2xl p-[1px] shadow-2xl shadow-amber-500/10"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-amber-400 via-amber-200 to-amber-500 opacity-60 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl" />
                <div className="relative flex items-center justify-center gap-3 px-8 py-4 bg-[#0A0A0A] rounded-2xl group-hover:bg-[#111] transition-colors">
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <span className="text-white font-medium tracking-wide">
                    Continue with Google
                  </span>
                </div>
              </button>
            </form>
            <p className="text-[11px] text-white/30 uppercase tracking-widest font-mono">
              Secure Auth Required
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full py-6 text-center z-10 border-t border-white/5 bg-black/40 backdrop-blur-2xl">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-xs text-white/40 font-medium">
          <span>&copy; {new Date().getFullYear()} Dias & PRL Auto Joiner.</span>
          <span className="hidden sm:inline text-white/10">|</span>
          <div className="flex items-center gap-6">
            <Link href="/terms" className="hover:text-amber-400 transition-colors">Terms of Service</Link>
            <Link href="/privacy" className="hover:text-amber-400 transition-colors">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
