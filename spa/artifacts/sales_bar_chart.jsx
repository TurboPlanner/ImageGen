import React from "react";
const { useState, useEffect, createElement: h } = React;

const COLORS = ["#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"];
const COLOR_MAP = {
  "Electronics": "#3B82F6",
  "Clothing": "#EF4444",
  "Food": "#10B981",
  "Books": "#F59E0B"
};

function formatCurrency(n) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", minimumFractionDigits: 0 }).format(n);
}

export default function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState("category"); // category | monthly

  useEffect(() => {
    setLoading(true);
    setError(null);

    const query = mode === "category"
      ? "SELECT category, SUM(amount) as value FROM sales GROUP BY category ORDER BY value DESC"
      : "SELECT strftime('%Y-%m', sale_date) as label, SUM(amount) as value FROM sales GROUP BY label ORDER BY label";

    window.safeApiCall("query_sales", { query })
      .then((res) => {
        if (res && res.data && res.data.length > 0) {
          setData(res.data);
        } else {
          setError("Нет данных");
        }
      })
      .catch((err) => setError(err.message || "Ошибка запроса"))
      .finally(() => setLoading(false));
  }, [mode]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <svg className="animate-spin h-10 w-10 text-blue-500 mx-auto mb-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-gray-500 text-lg">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-600 text-lg font-medium">Ошибка</p>
          <p className="text-red-500 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value));
  const BAR_HEIGHT = 40;
  const CHART_HEIGHT = data.length * (BAR_HEIGHT + 12) + 20;

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Продажи</h2>
          <p className="text-gray-500 text-sm mt-1">
            {mode === "category" ? "По категориям" : "По месяцам"}
          </p>
        </div>
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setMode("category")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              mode === "category" ? "bg-white shadow text-blue-600" : "text-gray-600 hover:text-gray-800"
            }`}
          >
            Категории
          </button>
          <button
            onClick={() => setMode("monthly")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              mode === "monthly" ? "bg-white shadow text-blue-600" : "text-gray-600 hover:text-gray-800"
            }`}
          >
            По месяцам
          </button>
        </div>
      </div>

      {/* Барчарт на SVG */}
      <svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 600 ${CHART_HEIGHT}`} className="overflow-visible">
        {data.map((d, i) => {
          const y = i * (BAR_HEIGHT + 12);
          const barWidth = maxValue > 0 ? (d.value / maxValue) * 400 : 0;
          const color = COLOR_MAP[d.category] || COLORS[i % COLORS.length];

          return (
            <g key={d.label || d.category}>
              {/* Подпись слева */}
              <text
                x="0"
                y={y + BAR_HEIGHT / 2}
                dy="0.35em"
                className="text-sm fill-gray-700 font-medium"
              >
                {d.label || d.category}
              </text>

              {/* Бар */}
              <rect
                x="120"
                y={y}
                width={Math.max(barWidth, 4)}
                height={BAR_HEIGHT}
                rx="6"
                ry="6"
                fill={color}
                opacity="0.85"
              >
                <animate
                  attributeName="width"
                  from="0"
                  to={Math.max(barWidth, 4)}
                  dur="0.5s"
                  fill="freeze"
                />
              </rect>

              {/* Значение справа */}
              <text
                x={120 + barWidth + 8}
                y={y + BAR_HEIGHT / 2}
                dy="0.35em"
                className="text-sm fill-gray-600 font-semibold"
              >
                {formatCurrency(d.value)}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-6 pt-4 border-t border-gray-100 text-center text-xs text-gray-400">
        Данные загружены через safeApiCall("query_sales", ...) — {data.length} записей
      </div>
    </div>
  );
}