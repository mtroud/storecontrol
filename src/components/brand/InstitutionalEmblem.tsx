interface InstitutionalEmblemProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  inverted?: boolean;
}

export function InstitutionalEmblem({
  size = 'md',
  showText = true,
  inverted = false,
}: InstitutionalEmblemProps) {
  const dimensions =
    size === 'sm' ? 'h-9 w-9' : size === 'lg' ? 'h-14 w-14' : 'h-10 w-10';

  return (
    <div className="flex items-center gap-3 select-none">
      <div
        className={`${dimensions} shrink-0 rounded-lg border flex items-center justify-center ${
          inverted
            ? 'bg-white/10 border-white/15 text-[#D4AE60]'
            : 'bg-[#0F2544] border-[#1E3A63] text-[#D4AE60] dark:bg-[#13294B] dark:border-slate-700'
        }`}
      >
        <svg
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-7 h-7"
          aria-hidden="true"
        >
          {/* Outer octagram geometric frame inspired by Shrine architectural heritage */}
          <rect
            x="10"
            y="10"
            width="28"
            height="28"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <rect
            x="10"
            y="10"
            width="28"
            height="28"
            rx="2"
            transform="rotate(45 24 24)"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeOpacity="0.85"
          />
          {/* Inner IT control & network node core */}
          <circle cx="24" cy="24" r="5.5" stroke="#FFFFFF" strokeWidth="1.6" />
          <path
            d="M24 14V18.5M24 29.5V34M14 24H18.5M29.5 24H34"
            stroke="#FFFFFF"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="24" cy="24" r="2" fill="currentColor" />
        </svg>
      </div>

      {showText && (
        <div className="min-w-0">
          <div
            className={`text-sm font-bold leading-snug truncate ${
              inverted ? 'text-white' : 'text-[#0F2544] dark:text-slate-100'
            }`}
          >
            شعبة السيطرة والإنترنت
          </div>
          <div
            className={`text-[11px] leading-snug truncate ${
              inverted ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            مجمع سيد الشهداء (ع) الخدمي
          </div>
        </div>
      )}
    </div>
  );
}
