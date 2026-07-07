import React from "react";
const { useState, useEffect } = React;

const COLORS = ["#3B82F6", "#EF4444", "#10B981", "#F59E0B"];
const COLOR_MAP = {
  "Electronics": "#3B82F6",
  "Clothing": "#EF4444",
  "Food": "#10B981",
  "Books": "#F59E0B"
};

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
  return ["M", cx, cy, "L", start.x, start.y, "A", r, r, 0, largeArcFlag, 0, end.x, end.y, "Z"].join(" ");
}

function fmt(n) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", minimumFractionDigits: 0 }).format(n);
}

export default function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    window.safeApiCall("query_sales", {
      query: "SELECT category, SUM(amount) as total FROM sales GROUP BY category ORDER BY total DESC"
    })
      .then(res => { if (res?.data) setData(res.data); else setError("No data"); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <svg className="animate-spin h-10 w-10 text-blue-500 mx-auto mb-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-gray-500 text-lg">Loading sales data...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-600 text-lg font-medium">Error</p>
        <p className="text-red-500 mt-1">{error}</p>
      </div>
    </div>
  );

  const total = data.reduce((s, d) => s + d.total, 0);
  let cur = 0;
  const arcs = data.map(d => {
    const slice = (d.total / total) * 360;
    const s = cur, e = cur + slice, m = s + slice / 2;
    cur = e;
    return { ...d, s, e, m, p: ((d.total / total) * 100).toFixed(1) };
  });

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-1 text-center">Sales by Category</h2>
      <p className="text-gray-500 text-center mb-6 text-sm">Pie chart — live data from DB via safeApiCall</p>

      <div className="flex flex-col md:flex-row items-center justify-center gap-8">
        <svg width="320" height="320" viewBox="0 0 320 320">
          {arcs.map(d => {
            const c = COLOR_MAP[d.category];
            const hov = hovered === d.category;
            const off = hov ? 10 : 0;
            const mr = ((d.m - 90) * Math.PI) / 180;
            return (
              <g key={d.category}
                onMouseEnter={() => setHovered(d.category)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: "pointer", transition: "transform 0.2s" }}
                transform={`translate(${off * Math.cos(mr)}, ${off * Math.sin(mr)})`}
              >
                <path d={describeArc(160, 160, 130, d.s, d.e)}
                  fill={c} stroke="white" strokeWidth="2"
                  opacity={hovered && !hov ? 0.5 : 1} />
                {d.p > 8 && (
                  <text x={160 + 85 * Math.cos(mr)} y={160 + 85 * Math.sin(mr)}
                    fill="white" textAnchor="middle" dominantBaseline="middle"
                    className="text-sm font-bold drop-shadow-md" style={{ pointerEvents: "none" }}>
                    {d.p}%
                  </text>
                )}
              </g>
            );
          })}
          <circle cx="160" cy="160" r="45" fill="white" />
          <text x="160" y="153" textAnchor="middle" className="text-xl font-bold fill-gray-800">
            {total.toLocaleString("ru-RU")}
          </text>
          <text x="160" y="172" textAnchor="middle" className="text-xs fill-gray-500">RUB</text>
        </svg>

        <div className="space-y-2 min-w-[180px]">
          {arcs.map(d => {
            const c = COLOR_MAP[d.category];
            const hov = hovered === d.category;
            return (
              <div key={d.category}
                className="flex items-center gap-3 p-2 rounded-lg transition-all duration-150 cursor-pointer"
                style={{ backgroundColor: hov ? `${c}18` : "transparent", transform: hov ? "translateX(4px)" : "none" }}
                onMouseEnter={() => setHovered(d.category)}
                onMouseLeave={() => setHovered(null)}
              >
                <div className="w-3.5 h-3.5 rounded-sm flex-shrink-0" style={{ backgroundColor: c }} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700">{d.category}</p>
                  <p className="text-xs text-gray-500">{fmt(d.total)}</p>
                </div>
                <span className="text-sm font-semibold text-gray-600">{d.p}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}