export default function Sparkline({ values, min, max, normal, width = 120, height = 32, fluid = false }) {
  if (!values?.length) return null
  const lo = Math.min(min, ...values)
  const hi = Math.max(max, ...values)
  const span = hi - lo || 1
  const y = (v) => height - ((v - lo) / span) * (height - 4) - 2
  const points = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * width},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg
      className="sparkline"
      width={fluid ? '100%' : width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={fluid ? 'none' : undefined}
      aria-hidden="true"
    >
      {normal && (
        <rect x="0" y={y(normal.max)} width={width} height={Math.max(1, y(normal.min) - y(normal.max))} className="sparkline-band" />
      )}
      <polyline points={points} className="sparkline-line" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
