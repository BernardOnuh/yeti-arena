/** Yeti Arena's own yeti (an original drawing, matching the in-game character). */
export function YetiMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <path d="M20 14q-6-9-4-12 4 4 10 9z M44 14q6-9 4-12-4 4-10 9z" fill="#cdb48a" />
      <path d="M32 6c9 0 13 3 16 6 4 1 7 4 8 8 3 3 4 7 3 11 2 4 1 8-1 11 0 5-3 9-7 11-3 4-9 6-19 6s-16-2-19-6c-4-2-7-6-7-11-2-3-3-7-1-11-1-4 0-8 3-11 1-4 4-7 8-8 3-3 7-6 16-6z" fill="#fff" stroke="#b9c8e6" strokeWidth="2" />
      <ellipse cx="32" cy="30" rx="14" ry="12" fill="#a8d8f0" />
      <ellipse cx="26.5" cy="27.5" rx="2.4" ry="3" fill="#14213d" /><ellipse cx="37.5" cy="27.5" rx="2.4" ry="3" fill="#14213d" />
      <circle cx="27.3" cy="26.4" r=".9" fill="#fff" /><circle cx="38.3" cy="26.4" r=".9" fill="#fff" />
      <path d="M28 34q4 4 8 0" stroke="#14213d" strokeWidth="2" fill="none" strokeLinecap="round" />
      <ellipse cx="22" cy="33" rx="2.6" ry="1.7" fill="#f472b6" opacity=".45" /><ellipse cx="42" cy="33" rx="2.6" ry="1.7" fill="#f472b6" opacity=".45" />
    </svg>
  );
}
