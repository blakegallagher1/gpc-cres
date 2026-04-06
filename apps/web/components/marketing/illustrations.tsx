/**
 * Vintage etching-style SVG illustrations for the public marketing shell.
 * Black-and-white linework with cross-hatching — communicates legacy, stability, timelessness.
 */

interface IllustrationProps {
  className?: string;
}

/* ── Shared SVG hatching patterns ── */
function HatchDefs() {
  return (
    <defs>
      <pattern id="hatch-fine" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="4" stroke="currentColor" strokeWidth="0.4" />
      </pattern>
      <pattern id="hatch-medium" patternUnits="userSpaceOnUse" width="3" height="3" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="3" stroke="currentColor" strokeWidth="0.5" />
      </pattern>
      <pattern id="cross-hatch" patternUnits="userSpaceOnUse" width="4" height="4">
        <line x1="0" y1="0" x2="0" y2="4" stroke="currentColor" strokeWidth="0.35" transform="rotate(45 2 2)" />
        <line x1="0" y1="0" x2="0" y2="4" stroke="currentColor" strokeWidth="0.35" transform="rotate(-45 2 2)" />
      </pattern>
      <pattern id="stipple" patternUnits="userSpaceOnUse" width="6" height="6">
        <circle cx="1" cy="1" r="0.4" fill="currentColor" />
        <circle cx="4" cy="4" r="0.3" fill="currentColor" />
      </pattern>
    </defs>
  );
}

/** Home — Classical building facade with columns, etched */
export function BuildingIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 480 560" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
      <HatchDefs />
      {/* Ground line */}
      <line x1="40" y1="480" x2="440" y2="480" stroke="currentColor" strokeWidth="1.2" />
      <line x1="30" y1="484" x2="450" y2="484" stroke="currentColor" strokeWidth="0.5" />

      {/* Building base */}
      <rect x="80" y="200" width="320" height="280" stroke="currentColor" strokeWidth="1" fill="url(#hatch-fine)" fillOpacity="0.12" />

      {/* Foundation steps */}
      <rect x="60" y="460" width="360" height="20" stroke="currentColor" strokeWidth="0.8" fill="url(#stipple)" fillOpacity="0.15" />
      <rect x="70" y="445" width="340" height="15" stroke="currentColor" strokeWidth="0.6" fill="none" />

      {/* Columns */}
      {[120, 200, 280, 360].map((x) => (
        <g key={x}>
          <rect x={x - 12} y="210" width="24" height="235" stroke="currentColor" strokeWidth="0.8" fill="none" />
          <line x1={x - 6} y1="215" x2={x - 6} y2="440" stroke="currentColor" strokeWidth="0.3" />
          <line x1={x + 6} y1="215" x2={x + 6} y2="440" stroke="currentColor" strokeWidth="0.3" />
          {/* Column capital */}
          <rect x={x - 16} y="205" width="32" height="8" stroke="currentColor" strokeWidth="0.6" fill="url(#hatch-medium)" fillOpacity="0.2" />
          {/* Column base */}
          <rect x={x - 15} y="440" width="30" height="6" stroke="currentColor" strokeWidth="0.6" fill="none" />
        </g>
      ))}

      {/* Pediment / triangular roof */}
      <polygon points="240,100 60,200 420,200" stroke="currentColor" strokeWidth="1" fill="url(#hatch-fine)" fillOpacity="0.08" />
      <line x1="60" y1="200" x2="420" y2="200" stroke="currentColor" strokeWidth="1.2" />

      {/* Tympanum detail */}
      <circle cx="240" cy="160" r="20" stroke="currentColor" strokeWidth="0.6" fill="url(#cross-hatch)" fillOpacity="0.1" />
      <circle cx="240" cy="160" r="12" stroke="currentColor" strokeWidth="0.4" fill="none" />

      {/* Windows row 1 */}
      {[140, 220, 300, 340].map((x, i) => (
        <g key={`w1-${x}`}>
          <rect x={x - (i < 2 ? 18 : 12)} y="260" width={i < 2 ? 36 : 24} height="50" stroke="currentColor" strokeWidth="0.6" fill="url(#cross-hatch)" fillOpacity="0.08" />
          <line x1={x} y1="260" x2={x} y2="310" stroke="currentColor" strokeWidth="0.3" />
        </g>
      ))}

      {/* Windows row 2 */}
      {[140, 220, 300, 340].map((x, i) => (
        <g key={`w2-${x}`}>
          <rect x={x - (i < 2 ? 18 : 12)} y="340" width={i < 2 ? 36 : 24} height="50" stroke="currentColor" strokeWidth="0.6" fill="url(#cross-hatch)" fillOpacity="0.06" />
        </g>
      ))}

      {/* Door */}
      <rect x="220" y="400" width="40" height="60" rx="20" stroke="currentColor" strokeWidth="0.8" fill="url(#hatch-medium)" fillOpacity="0.15" />
      <line x1="240" y1="400" x2="240" y2="460" stroke="currentColor" strokeWidth="0.4" />

      {/* Cornice line */}
      <line x1="55" y1="198" x2="425" y2="198" stroke="currentColor" strokeWidth="0.4" />

      {/* Roof apex detail */}
      <line x1="230" y1="95" x2="250" y2="95" stroke="currentColor" strokeWidth="0.6" />

      {/* Decorative horizontal lines on entablature */}
      <line x1="80" y1="207" x2="400" y2="207" stroke="currentColor" strokeWidth="0.3" />
      <line x1="80" y1="210" x2="400" y2="210" stroke="currentColor" strokeWidth="0.3" />

      {/* Ground shadows */}
      <line x1="80" y1="488" x2="400" y2="488" stroke="currentColor" strokeWidth="0.3" strokeDasharray="2 3" />
      <line x1="100" y1="492" x2="380" y2="492" stroke="currentColor" strokeWidth="0.2" strokeDasharray="1 4" />
    </svg>
  );
}

/** Focus — Two property types: housing community + industrial warehouse */
export function DualPropertyIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 480 560" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
      <HatchDefs />
      {/* Ground */}
      <line x1="20" y1="480" x2="460" y2="480" stroke="currentColor" strokeWidth="1" />

      {/* LEFT: Housing community (smaller buildings) */}
      {[60, 120, 180].map((x, i) => (
        <g key={`house-${x}`}>
          {/* House body */}
          <rect x={x} y={340 - i * 12} width="50" height={140 + i * 12} stroke="currentColor" strokeWidth="0.7" fill="url(#hatch-fine)" fillOpacity={0.06 + i * 0.03} />
          {/* Pitched roof */}
          <polygon points={`${x - 4},${340 - i * 12} ${x + 25},${310 - i * 16} ${x + 54},${340 - i * 12}`} stroke="currentColor" strokeWidth="0.7" fill="url(#hatch-medium)" fillOpacity="0.06" />
          {/* Door */}
          <rect x={x + 18} y="440" width="14" height="40" stroke="currentColor" strokeWidth="0.4" fill="url(#cross-hatch)" fillOpacity="0.08" />
          {/* Windows */}
          <rect x={x + 8} y={370 - i * 6} width="12" height="14" stroke="currentColor" strokeWidth="0.4" fill="url(#cross-hatch)" fillOpacity="0.06" />
          <rect x={x + 30} y={370 - i * 6} width="12" height="14" stroke="currentColor" strokeWidth="0.4" fill="url(#cross-hatch)" fillOpacity="0.06" />
        </g>
      ))}

      {/* Dividing vertical element — thin rule */}
      <line x1="240" y1="240" x2="240" y2="490" stroke="currentColor" strokeWidth="0.4" strokeDasharray="4 6" />

      {/* RIGHT: Industrial warehouse */}
      <rect x="270" y="310" width="170" height="170" stroke="currentColor" strokeWidth="0.9" fill="url(#hatch-fine)" fillOpacity="0.08" />

      {/* Warehouse roof (flat with slight pitch) */}
      <polygon points="265,310 355,270 445,310" stroke="currentColor" strokeWidth="0.8" fill="url(#stipple)" fillOpacity="0.06" />
      <line x1="265" y1="310" x2="445" y2="310" stroke="currentColor" strokeWidth="1" />

      {/* Loading bay doors */}
      {[290, 340, 390].map((x) => (
        <g key={`bay-${x}`}>
          <rect x={x} y="400" width="36" height="80" stroke="currentColor" strokeWidth="0.6" fill="url(#hatch-medium)" fillOpacity="0.1" />
          <line x1={x} y1="440" x2={x + 36} y2="440" stroke="currentColor" strokeWidth="0.3" />
          {/* Roll-up door lines */}
          {[410, 420, 430].map((y) => (
            <line key={`roll-${x}-${y}`} x1={x + 2} y1={y} x2={x + 34} y2={y} stroke="currentColor" strokeWidth="0.2" />
          ))}
        </g>
      ))}

      {/* Industrial windows strip */}
      <rect x="280" y="330" width="150" height="20" stroke="currentColor" strokeWidth="0.5" fill="url(#cross-hatch)" fillOpacity="0.06" />
      {[300, 330, 360, 390, 410].map((x) => (
        <line key={`wstrip-${x}`} x1={x} y1="330" x2={x} y2="350" stroke="currentColor" strokeWidth="0.3" />
      ))}

      {/* Ventilation on roof */}
      <rect x="340" y="278" width="30" height="12" stroke="currentColor" strokeWidth="0.4" fill="none" />
      <line x1="345" y1="278" x2="345" y2="290" stroke="currentColor" strokeWidth="0.2" />
      <line x1="355" y1="278" x2="355" y2="290" stroke="currentColor" strokeWidth="0.2" />
      <line x1="365" y1="278" x2="365" y2="290" stroke="currentColor" strokeWidth="0.2" />

      {/* Labels */}
      <text x="120" y="235" textAnchor="middle" fontSize="8" fontFamily="var(--font-mono)" letterSpacing="0.18em" fill="currentColor" fillOpacity="0.4">HOUSING</text>
      <text x="355" y="255" textAnchor="middle" fontSize="8" fontFamily="var(--font-mono)" letterSpacing="0.18em" fill="currentColor" fillOpacity="0.4">INDUSTRIAL</text>

      {/* Ground texture */}
      <line x1="20" y1="485" x2="460" y2="485" stroke="currentColor" strokeWidth="0.3" strokeDasharray="2 4" />
    </svg>
  );
}

/** Strategy — Three connected stages: Buy → Build → Manage */
export function SequenceIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 480 560" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
      <HatchDefs />

      {/* Stage 1: BUY — Magnifying glass over land */}
      <g>
        <text x="120" y="105" textAnchor="middle" fontSize="7" fontFamily="var(--font-mono)" letterSpacing="0.2em" fill="currentColor" fillOpacity="0.4">01 — BUY</text>
        {/* Land parcel */}
        <rect x="60" y="130" width="120" height="80" stroke="currentColor" strokeWidth="0.7" fill="url(#stipple)" fillOpacity="0.08" />
        <line x1="60" y1="170" x2="180" y2="170" stroke="currentColor" strokeWidth="0.3" strokeDasharray="3 3" />
        <line x1="120" y1="130" x2="120" y2="210" stroke="currentColor" strokeWidth="0.3" strokeDasharray="3 3" />
        {/* Magnifying glass */}
        <circle cx="145" cy="155" r="28" stroke="currentColor" strokeWidth="0.8" fill="none" />
        <circle cx="145" cy="155" r="25" stroke="currentColor" strokeWidth="0.3" fill="url(#hatch-fine)" fillOpacity="0.04" />
        <line x1="164" y1="174" x2="185" y2="195" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </g>

      {/* Connecting arrow 1→2 */}
      <g opacity="0.35">
        <line x1="120" y1="225" x2="120" y2="265" stroke="currentColor" strokeWidth="0.6" />
        <polygon points="114,260 120,272 126,260" fill="currentColor" />
      </g>

      {/* Stage 2: BUILD — Scaffolding / construction */}
      <g>
        <text x="120" y="290" textAnchor="middle" fontSize="7" fontFamily="var(--font-mono)" letterSpacing="0.2em" fill="currentColor" fillOpacity="0.4">02 — BUILD</text>
        {/* Building under construction */}
        <rect x="70" y="310" width="100" height="90" stroke="currentColor" strokeWidth="0.7" fill="url(#hatch-fine)" fillOpacity="0.06" />
        {/* Scaffolding lines */}
        <line x1="65" y1="320" x2="175" y2="320" stroke="currentColor" strokeWidth="0.4" />
        <line x1="65" y1="350" x2="175" y2="350" stroke="currentColor" strokeWidth="0.4" />
        <line x1="65" y1="380" x2="175" y2="380" stroke="currentColor" strokeWidth="0.4" />
        {/* Vertical scaffolding */}
        <line x1="65" y1="310" x2="65" y2="400" stroke="currentColor" strokeWidth="0.4" />
        <line x1="175" y1="310" x2="175" y2="400" stroke="currentColor" strokeWidth="0.4" />
        {/* Cross bracing */}
        <line x1="65" y1="320" x2="175" y2="350" stroke="currentColor" strokeWidth="0.25" />
        <line x1="175" y1="320" x2="65" y2="350" stroke="currentColor" strokeWidth="0.25" />
        <line x1="65" y1="350" x2="175" y2="380" stroke="currentColor" strokeWidth="0.25" />
        {/* Roof frame */}
        <line x1="70" y1="310" x2="120" y2="285" stroke="currentColor" strokeWidth="0.5" />
        <line x1="170" y1="310" x2="120" y2="285" stroke="currentColor" strokeWidth="0.5" />
      </g>

      {/* Connecting arrow 2→3 */}
      <g opacity="0.35">
        <line x1="120" y1="415" x2="120" y2="455" stroke="currentColor" strokeWidth="0.6" />
        <polygon points="114,450 120,462 126,450" fill="currentColor" />
      </g>

      {/* Stage 3: MANAGE — Completed building with key */}
      <g>
        <text x="120" y="475" textAnchor="middle" fontSize="7" fontFamily="var(--font-mono)" letterSpacing="0.2em" fill="currentColor" fillOpacity="0.4">03 — MANAGE</text>
        {/* Completed building */}
        <rect x="75" y="490" width="90" height="55" stroke="currentColor" strokeWidth="0.8" fill="url(#hatch-fine)" fillOpacity="0.1" />
        <line x1="75" y1="490" x2="120" y2="472" stroke="currentColor" strokeWidth="0.6" />
        <line x1="165" y1="490" x2="120" y2="472" stroke="currentColor" strokeWidth="0.6" />
        {/* Windows */}
        <rect x="88" y="500" width="14" height="12" stroke="currentColor" strokeWidth="0.4" fill="url(#cross-hatch)" fillOpacity="0.06" />
        <rect x="138" y="500" width="14" height="12" stroke="currentColor" strokeWidth="0.4" fill="url(#cross-hatch)" fillOpacity="0.06" />
        {/* Door */}
        <rect x="110" y="525" width="20" height="20" stroke="currentColor" strokeWidth="0.5" fill="url(#hatch-medium)" fillOpacity="0.1" />
      </g>

      {/* Right-side decorative vertical line */}
      <line x1="380" y1="100" x2="380" y2="540" stroke="currentColor" strokeWidth="0.25" strokeDasharray="1 8" />

      {/* Right-side timeline dots */}
      {[170, 360, 520].map((y) => (
        <circle key={`dot-${y}`} cx="380" cy={y} r="2.5" stroke="currentColor" strokeWidth="0.5" fill="none" />
      ))}
    </svg>
  );
}

/** Platform — System diagram with connected nodes */
export function SystemIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 480 560" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
      <HatchDefs />

      {/* Central hub */}
      <circle cx="240" cy="280" r="50" stroke="currentColor" strokeWidth="0.8" fill="url(#hatch-fine)" fillOpacity="0.06" />
      <circle cx="240" cy="280" r="35" stroke="currentColor" strokeWidth="0.5" fill="none" />
      <circle cx="240" cy="280" r="8" stroke="currentColor" strokeWidth="0.6" fill="currentColor" fillOpacity="0.1" />

      {/* Connecting lines to satellite nodes */}
      {/* Top: Origination */}
      <line x1="240" y1="230" x2="240" y2="140" stroke="currentColor" strokeWidth="0.5" />
      <rect x="190" y="100" width="100" height="40" rx="4" stroke="currentColor" strokeWidth="0.6" fill="url(#stipple)" fillOpacity="0.06" />
      <text x="240" y="124" textAnchor="middle" fontSize="7" fontFamily="var(--font-mono)" letterSpacing="0.15em" fill="currentColor" fillOpacity="0.5">ORIGINATION</text>

      {/* Right: Execution */}
      <line x1="290" y1="280" x2="370" y2="280" stroke="currentColor" strokeWidth="0.5" />
      <rect x="370" y="260" width="90" height="40" rx="4" stroke="currentColor" strokeWidth="0.6" fill="url(#stipple)" fillOpacity="0.06" />
      <text x="415" y="284" textAnchor="middle" fontSize="7" fontFamily="var(--font-mono)" letterSpacing="0.15em" fill="currentColor" fillOpacity="0.5">EXECUTION</text>

      {/* Bottom: Hold */}
      <line x1="240" y1="330" x2="240" y2="420" stroke="currentColor" strokeWidth="0.5" />
      <rect x="195" y="420" width="90" height="40" rx="4" stroke="currentColor" strokeWidth="0.6" fill="url(#stipple)" fillOpacity="0.06" />
      <text x="240" y="444" textAnchor="middle" fontSize="7" fontFamily="var(--font-mono)" letterSpacing="0.15em" fill="currentColor" fillOpacity="0.5">HOLD</text>

      {/* Left: Evidence */}
      <line x1="190" y1="280" x2="110" y2="280" stroke="currentColor" strokeWidth="0.5" />
      <rect x="20" y="260" width="90" height="40" rx="4" stroke="currentColor" strokeWidth="0.6" fill="url(#stipple)" fillOpacity="0.06" />
      <text x="65" y="284" textAnchor="middle" fontSize="7" fontFamily="var(--font-mono)" letterSpacing="0.15em" fill="currentColor" fillOpacity="0.5">EVIDENCE</text>

      {/* Diagonal connections */}
      <line x1="215" y1="248" x2="140" y2="180" stroke="currentColor" strokeWidth="0.3" strokeDasharray="3 4" />
      <line x1="265" y1="248" x2="340" y2="180" stroke="currentColor" strokeWidth="0.3" strokeDasharray="3 4" />
      <line x1="215" y1="312" x2="140" y2="380" stroke="currentColor" strokeWidth="0.3" strokeDasharray="3 4" />
      <line x1="265" y1="312" x2="340" y2="380" stroke="currentColor" strokeWidth="0.3" strokeDasharray="3 4" />

      {/* Smaller satellite nodes */}
      {[
        { cx: 130, cy: 170, label: "MAP" },
        { cx: 350, cy: 170, label: "SCREEN" },
        { cx: 130, cy: 390, label: "MEMORY" },
        { cx: 350, cy: 390, label: "WORKFLOW" },
      ].map((node) => (
        <g key={node.label}>
          <circle cx={node.cx} cy={node.cy} r="24" stroke="currentColor" strokeWidth="0.5" fill="url(#hatch-fine)" fillOpacity="0.04" />
          <text x={node.cx} y={node.cy + 3} textAnchor="middle" fontSize="5.5" fontFamily="var(--font-mono)" letterSpacing="0.12em" fill="currentColor" fillOpacity="0.4">{node.label}</text>
        </g>
      ))}

      {/* Outer ring detail */}
      <circle cx="240" cy="280" r="180" stroke="currentColor" strokeWidth="0.2" strokeDasharray="2 8" fill="none" />

      {/* Corner decorative marks */}
      <line x1="40" y1="60" x2="70" y2="60" stroke="currentColor" strokeWidth="0.4" />
      <line x1="40" y1="60" x2="40" y2="90" stroke="currentColor" strokeWidth="0.4" />
      <line x1="440" y1="60" x2="410" y2="60" stroke="currentColor" strokeWidth="0.4" />
      <line x1="440" y1="60" x2="440" y2="90" stroke="currentColor" strokeWidth="0.4" />
      <line x1="40" y1="500" x2="70" y2="500" stroke="currentColor" strokeWidth="0.4" />
      <line x1="40" y1="500" x2="40" y2="470" stroke="currentColor" strokeWidth="0.4" />
      <line x1="440" y1="500" x2="410" y2="500" stroke="currentColor" strokeWidth="0.4" />
      <line x1="440" y1="500" x2="440" y2="470" stroke="currentColor" strokeWidth="0.4" />
    </svg>
  );
}
