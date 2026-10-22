import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#05070f] text-slate-100 flex flex-col items-center justify-center p-6 text-center">
      <div className="inline-flex items-center gap-2 rounded-full border border-pink-500/30 bg-pink-500/10 px-4 py-1.5 text-xs font-mono uppercase tracking-widest text-pink-300">
        404 · Coordinates Lost in Deep Space
      </div>
      <h1 className="mt-4 text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-violet-300 to-pink-400">
        Orbital Trajectory Not Found
      </h1>
      <p className="mt-2 text-sm text-slate-400 max-w-md">
        The requested orbital coordinate does not exist in the active constellation.
      </p>
      <Link
        href="/"
        className="mt-6 px-4 py-2 rounded-xl bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 text-xs font-semibold hover:bg-cyan-500/30 transition"
      >
        Return to Singularity Core
      </Link>
    </main>
  );
}
