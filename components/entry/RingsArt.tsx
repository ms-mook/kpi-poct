// Concentric open rings — the ring of the POCT Center logo, repeated outward.
// Drawn with currentColor/theme tokens so it follows every theme. Each ring
// fades in once on load (see .ring-in in globals.css); nothing loops.

const RINGS = [
  { r: 120, w: 10, tone: "text-primary", o: 0.4, rot: -60 },
  { r: 180, w: 6, tone: "text-secondary", o: 0.32, rot: 20 },
  { r: 240, w: 3, tone: "text-primary", o: 0.24, rot: -130 },
  { r: 300, w: 2, tone: "text-secondary", o: 0.16, rot: 70 },
];

export function RingsArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 600" aria-hidden="true" className={className} fill="none">
      {RINGS.map((ring, i) => (
        <g key={ring.r} className="ring-in" style={{ animationDelay: `${i * 120}ms` }}>
          <circle
            cx="300" cy="300" r={ring.r} pathLength={100}
            strokeWidth={ring.w} strokeLinecap="round" strokeDasharray="78 22"
            transform={`rotate(${ring.rot} 300 300)`}
            className={ring.tone} stroke="currentColor" opacity={ring.o}
          />
        </g>
      ))}
    </svg>
  );
}
