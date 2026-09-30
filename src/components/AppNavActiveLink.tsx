"use client";
// ============================================================
// AppNavActiveLink — client component for active nav styling
// Uses usePathname() to detect the current route.
// ============================================================
import Link from "next/link";
import { usePathname } from "next/navigation";

interface Props {
  href: string;
  label: string;
}

export function AppNavActiveLink({ href, label }: Props) {
  const pathname = usePathname();

  // "/" only matches exactly; other links match prefix
  const isActive =
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      className={[
        "font-mono text-[10px] tracking-[0.15em] py-2 px-3 border-b-2 transition-colors inline-block",
        isActive
          ? "border-jh-text text-jh-text"
          : "border-transparent text-jh-dim hover:text-jh-text",
      ].join(" ")}
      aria-current={isActive ? "page" : undefined}
    >
      {label}
    </Link>
  );
}
