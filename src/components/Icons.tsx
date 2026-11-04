type IconProps = { className?: string };

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const CheckIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3.4 8.4l3.2 3.2 6-6.2" />
  </svg>
);

export const PlusIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round">
    <path d="M10 4.6v10.8M4.6 10h10.8" />
  </svg>
);

export const ClockIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth={1.8}>
    <circle cx="8" cy="8" r="5.8" />
    <path d="M8 5v3.2l2 1.4" strokeLinecap="round" />
  </svg>
);

export const SearchIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
    <circle cx="7" cy="7" r="4.2" />
    <path d="M10.2 10.2L13.4 13.4" />
  </svg>
);

export const CalendarIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 20 20" className={className} {...base}>
    <rect x="3" y="4" width="14" height="13" rx="4" />
    <path d="M6.8 2.6v2.6M13.2 2.6v2.6M3.2 8.2h13.6" />
    <circle cx="10" cy="12.2" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

export const UpcomingIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 20 20" className={className} {...base}>
    <path d="M3.6 5.6h12.8M3.6 10h12.8M3.6 14.4h7.6" />
  </svg>
);

export const AllIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 20 20" className={className} {...base}>
    <rect x="3.2" y="3.2" width="13.6" height="13.6" rx="4.2" />
    <path d="M6.8 10.2l2.2 2.2 4.2-4.4" />
  </svg>
);

export const DoneIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 20 20" className={className} {...base}>
    <circle cx="10" cy="10" r="7.2" />
    <path d="M6.8 10.2l2.2 2.2 4.2-4.6" />
  </svg>
);

export const GearIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 20 20" className={className} {...base}>
    <circle cx="10" cy="10" r="2.6" />
    <path d="M10 2.4v2M10 15.6v2M2.4 10h2M15.6 10h2M4.6 4.6l1.4 1.4M14 14l1.4 1.4M15.4 4.6L14 6M6 14l-1.4 1.4" />
  </svg>
);

export const TrashIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3.4 5.2h9.2M6.2 5.2V3.6h3.6v1.6M4.6 5.2l.5 7.4h5.8l.5-7.4" />
  </svg>
);

export const PencilIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.6 3.2l2.2 2.2M3.2 10.6l7-7 2.2 2.2-7 7-3 .8.8-3z" />
  </svg>
);

export const BarsIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round">
    <path d="M4.4 16.2V11M10 16.2V5.4M15.6 16.2V8.6" />
  </svg>
);

export const Sparkles = () => (
  <svg className="sparkles" viewBox="0 0 46 40" fill="none">
    <path d="M8 30l-4 6M18 24l-2 8M26 18l2 6" stroke="#F7C86A" strokeWidth="3.2" strokeLinecap="round" opacity=".85" />
  </svg>
);
