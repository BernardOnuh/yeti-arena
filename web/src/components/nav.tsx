"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { YetiMark } from "./yeti-mark";

const LINKS = [["/play", "Play"], ["/leaderboard", "Leaderboard"], ["/fairness", "Fair play"]] as const;

export function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-night/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2"><YetiMark /><span className="font-display text-xl font-bold">Yeti <span className="text-ice">Arena</span></span></Link>
        <nav className="flex items-center gap-1 text-[14px] font-bold">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className={`rounded-xl px-2.5 py-2 sm:px-3.5 ${path === href ? "bg-white/10 text-white" : "text-sky-100/70 hover:text-white"} ${href === "/fairness" ? "hidden sm:block" : ""}`}>{label}</Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
