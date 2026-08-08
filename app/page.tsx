import { auth, signIn } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Background3D } from "@/components/Background3D";
import { Sparkles, Layers, ShieldCheck, Zap, ArrowRight } from "lucide-react";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-between bg-slate-950 text-slate-50 overflow-hidden relative selection:bg-indigo-500/40 font-sans">
      <Background3D />

      {/* Main Hero Container */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-6xl mx-auto z-10 py-16 px-6">
        <div className="text-center space-y-10 max-w-4xl mx-auto animate-fade-in">
          {/* Logo / Badge */}
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full glass-panel-3d border border-indigo-500/30 text-xs font-extrabold text-indigo-300 shadow-[0_0_20px_rgba(99,102,241,0.2)]">
              <Sparkles className="w-4 h-4 text-indigo-400 animate-spin-slow" />
              <span>COMMUNITY HERO PLATFORM • 3D ENGINE ACTIVE</span>
            </div>
          </div>

          {/* Hero Typography */}
          <div className="space-y-6">
            <h1 className="text-5xl md:text-7xl font-black tracking-tight text-white leading-[1.1]">
              Diamonds & PRL
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-cyan-300 to-indigo-500 glow-text-indigo">
                Auto Joiner Studio
              </span>
            </h1>

            <p className="text-base md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed font-medium">
              Automatically extract, validate, and compile Diamond Rewards and PRL entries from multiple CH Handlers into a single consolidated Google Sheet in real time.
            </p>
          </div>

          {/* 3D Interactive Feature Showcase */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 pb-2">
            <div className="glass-card-3d p-8 rounded-3xl flex flex-col items-center text-center space-y-4 border border-amber-500/20 shadow-xl group">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-3xl shadow-lg shadow-amber-500/10 group-hover:scale-110 transition-transform">
                💎
              </div>
              <h3 className="font-extrabold text-white text-lg tracking-wide">Diamond Sync</h3>
              <p className="text-xs text-slate-400 font-medium leading-relaxed">
                Automated reward table extraction across Official and Trainee CH response sheets.
              </p>
            </div>

            <div className="glass-card-3d p-8 rounded-3xl flex flex-col items-center text-center space-y-4 border border-indigo-500/20 shadow-xl group">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-3xl shadow-lg shadow-indigo-500/10 group-hover:scale-110 transition-transform">
                📋
              </div>
              <h3 className="font-extrabold text-white text-lg tracking-wide">PRL Roster Engine</h3>
              <p className="text-xs text-slate-400 font-medium leading-relaxed">
                Smart 5v5/3v3 team validation and duplicate player ID resolution across sheets.
              </p>
            </div>

            <div className="glass-card-3d p-8 rounded-3xl flex flex-col items-center text-center space-y-4 border border-cyan-500/20 shadow-xl group">
              <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-3xl shadow-lg shadow-cyan-500/10 group-hover:scale-110 transition-transform">
                ⚡
              </div>
              <h3 className="font-extrabold text-white text-lg tracking-wide">MooGold API</h3>
              <p className="text-xs text-slate-400 font-medium leading-relaxed">
                Direct MLBB Server & User ID validation API verification before sheet writes.
              </p>
            </div>
          </div>

          {/* Sign In CTA */}
          <div className="pt-6 flex flex-col items-center justify-center space-y-4">
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/dashboard" });
              }}
              className="w-full max-w-sm"
            >
              <button
                type="submit"
                className="w-full relative group overflow-hidden rounded-2xl p-[2px] shadow-2xl shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:-translate-y-1 transition-all duration-300 cursor-pointer"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-cyan-400 to-indigo-600 opacity-80 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl animate-pulse-slow" />
                <div className="relative flex items-center justify-center gap-3 px-8 py-4 bg-slate-950 rounded-2xl group-hover:bg-slate-900 transition-colors">
                  <svg className="w-6 h-6 shrink-0 bg-white rounded-full p-1 shadow-md" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  <span className="text-white font-extrabold tracking-wide text-lg flex items-center gap-2">
                    Continue with Google <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                </div>
              </button>
            </form>

            <p className="text-[11px] text-slate-500 uppercase tracking-widest font-bold font-mono pt-2">
              SECURE GOOGLE OAUTH 2.0 AUTHORIZATION
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full py-8 text-center z-10 border-t border-slate-800/80 bg-slate-950/80 backdrop-blur-2xl">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 text-xs text-slate-400 font-semibold">
          <span>&copy; {new Date().getFullYear()} Dias & PRL Auto Joiner Engine.</span>
          <span className="hidden sm:inline text-slate-700">|</span>
          <div className="flex items-center gap-6">
            <Link href="/terms" className="hover:text-indigo-400 transition-colors">
              Terms of Service
            </Link>
            <Link href="/privacy" className="hover:text-indigo-400 transition-colors">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
