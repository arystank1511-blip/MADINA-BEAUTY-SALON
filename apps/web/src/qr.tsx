import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/** QR code as an SVG path, so it stays sharp on paper. */
export function Qr({ text, className = 'gc-qr' }: { text: string; className?: string }) {
  const { path, size } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { path: d, size: n };
  }, [text]);
  return (
    <svg
      className={className}
      viewBox={`-2 -2 ${size + 4} ${size + 4}`}
      role="img"
      aria-label="QR"
      shapeRendering="crispEdges"
    >
      <rect x="-2" y="-2" width={size + 4} height={size + 4} fill="#fff" />
      <path d={path} fill="currentColor" />
    </svg>
  );
}
