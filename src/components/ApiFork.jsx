import { useState, useEffect, useRef, useCallback } from "react";

export default function ApiFork() {
  const [price, setPrice] = useState(null);
  const [currency, setCurrency] = useState("bitcoin");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState(null);
  const [days, setDays] = useState(1);
  const canvasRef = useRef(null);
  const cacheRef = useRef({});

  const currencyConfig = {
    bitcoin: {
      id: "bitcoin",
      name: "Bitcoin",
      symbol: "BTC"
    },
    ethereum: {
      id: "ethereum",
      name: "Ethereum",
      symbol: "ETH"
    }
  };

  const fetchWithRetry = async (url, retries = 3, delay = 2000) => {
    const cacheKey = url;
    const cached = cacheRef.current[cacheKey];
    if (cached && Date.now() - cached.timestamp < 60000) {
      console.log("Используем кэшированные данные");
      return cached.data;
    }

    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url);
        
        if (response.status === 10012) {
          if (i < retries - 1) {
            const waitTime = delay * (i + 1);
            console.log(`Ждем ${waitTime}мс перед повторной попыткой...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
          throw new Error("Превышен лимит запросов. Подождите минуту и попробуйте снова.");
        }
        
        if (!response.ok) {
          throw new Error(`Ошибка HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        
        cacheRef.current[cacheKey] = {
          data: data,
          timestamp: Date.now()
        };
        
        return data;
      } catch (error) {
        if (i === retries - 1) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  };

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    const loadPrice = async () => {
      const coinId = currencyConfig[currency].id;
      
      try {
        const data = await fetchWithRetry(
          `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`
        );
        
        if (isMounted && data[coinId]) {
          setPrice(data[coinId].usd);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      }
    };

    loadPrice();

    return () => {
      isMounted = false;
    };
  }, [currency]);

  useEffect(() => {
    let isMounted = true;
    setChartLoading(true);
    setChartError(null);

    const loadChartData = async () => {
      const coinId = currencyConfig[currency].id;
      const cacheKey = `chart_${coinId}_${days}`;
      
      const cached = cacheRef.current[cacheKey];
      if (cached && Date.now() - cached.timestamp < 120000) {
        console.log("Используем кэшированные данные графика");
        if (isMounted) {
          setChartData(cached.data);
          setChartLoading(false);
        }
        return;
      }
      
      try {
        const data = await fetchWithRetry(
          `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`
        );
        
        if (isMounted) {
          if (data.prices && data.prices.length > 0) {
            setChartData(data.prices);
            cacheRef.current[cacheKey] = {
              data: data.prices,
              timestamp: Date.now()
            };
          } else {
            setChartError("Нет данных для выбранного периода");
          }
          setChartLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setChartError(err.message);
          setChartLoading(false);
        }
      }
    };

    const timeoutId = setTimeout(() => {
      loadChartData();
    }, 500);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [currency, days]);

  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chartData || chartData.length === 0) return;

    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = rect.height;
    const padding = { top: 20, right: 20, bottom: 30, left: 70 };

    ctx.clearRect(0, 0, width, height);

    const prices = chartData.map(([, price]) => price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;

    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const getX = (index) => padding.left + (index / (chartData.length - 1)) * chartWidth;
    const getY = (price) => padding.top + chartHeight - ((price - minPrice) / priceRange) * chartHeight;

    // Сетка
    ctx.strokeStyle = "rgba(75, 85, 99, 0.2)";
    ctx.lineWidth = 1;
    
    const gridLines = 8;
    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (chartHeight / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      const price = maxPrice - (priceRange / gridLines) * i;
      ctx.fillStyle = "#9ca3af";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "right";
      
      let priceText;
      if (price >= 1000) {
        priceText = `$${(price / 1000).toFixed(2)}k`;
      } else if (price >= 1) {
        priceText = `$${price.toFixed(2)}`;
      } else {
        priceText = `$${price.toFixed(4)}`;
      }
      
      ctx.fillText(priceText, padding.left - 10, y + 4);
    }

    // Линия графика
    ctx.beginPath();
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    chartData.forEach(([, price], index) => {
      const x = getX(index);
      const y = getY(price);

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Точка на последнем значении
    const lastPrice = chartData[chartData.length - 1];
    const lastX = getX(chartData.length - 1);
    const lastY = getY(lastPrice[1]);

    ctx.beginPath();
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#3b82f6";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Градиент под графиком
    const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    gradient.addColorStop(0, "rgba(59, 130, 246, 0.2)");
    gradient.addColorStop(1, "rgba(59, 130, 246, 0)");

    ctx.lineTo(lastX, lastY);
    ctx.lineTo(lastX, height - padding.bottom);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Подписи дат
    ctx.fillStyle = "#9ca3af";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    
    const datePointsCount = Math.min(6, chartData.length);
    const datePoints = [];
    for (let i = 0; i < datePointsCount; i++) {
      datePoints.push(Math.floor((i / (datePointsCount - 1)) * (chartData.length - 1)));
    }
    
    datePoints.forEach(index => {
      if (chartData[index]) {
        const date = new Date(chartData[index][0]);
        const x = getX(index);
        let dateStr;
        
        if (days === 1) {
          dateStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (days <= 7) {
          dateStr = date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
        } else {
          dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
        
        ctx.fillText(dateStr, x, height - 8);
      }
    });

  }, [chartData, days]);

  useEffect(() => {
    drawChart();
  }, [drawChart]);

  useEffect(() => {
    const handleResize = () => {
      drawChart();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [drawChart]);

  const formatDaysLabel = (d) => {
    if (d === 1) return "24ч";
    if (d === 7) return "7д";
    if (d === 30) return "30д";
    if (d === 90) return "90д";
    if (d === 365) return "1г";
    return `${d}д`;
  };

  const handleRetry = () => {
    setError(null);
    setChartError(null);
    setLoading(true);
    setChartLoading(true);
    setCurrency(prev => prev);
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Верхняя панель */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            {/* Заголовок и цена */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📈</span>
                <h1 className="text-xl font-bold text-white">
                  Crypto Tracker
                </h1>
              </div>
              
              {!error && !loading && price && (
                <div className="flex items-center gap-2 pl-6 border-l border-gray-700">
                  <span className="text-gray-400 text-sm">
                    {currencyConfig[currency].name}
                  </span>
                  <span className="text-2xl font-bold text-white">
                    ${price?.toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {/* Управление */}
            <div className="flex items-center gap-3">
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="px-4 py-2 text-white bg-gray-800 border border-gray-700 rounded-lg 
                           outline-none cursor-pointer transition-all hover:border-gray-500 focus:border-blue-500 text-sm"
              >
                <option value="bitcoin">Bitcoin (BTC)</option>
                <option value="ethereum">Ethereum (ETH)</option>
              </select>

              <div className="flex gap-1">
                {[1, 7, 30, 90, 365].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDays(d)}
                    className={`px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                      days === d
                        ? "bg-blue-500 text-white"
                        : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
                    }`}
                  >
                    {formatDaysLabel(d)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Основной контент */}
      <main className="flex-1 flex flex-col">
        {/* Статус */}
        {error && (
          <div className="mx-6 mt-6 bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">⚠️</span>
              <p className="text-red-400 text-sm">{error}</p>
            </div>
            <button
              onClick={handleRetry}
              className="px-4 py-2 bg-red-500/20 text-red-400 text-sm rounded-lg hover:bg-red-500/30 transition-colors"
            >
              Попробовать снова
            </button>
          </div>
        )}

        {loading && (
          <div className="mx-6 mt-6 flex items-center gap-3 text-gray-400">
            <div className="w-5 h-5 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
            <span className="text-sm">Загрузка данных...</span>
          </div>
        )}

        {/* График */}
        <div className="flex-1 m-6 bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          {chartLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="w-12 h-12 border-4 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-gray-400">Загрузка графика...</p>
            </div>
          ) : chartError ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <span className="text-4xl">⚠️</span>
              <p className="text-red-400">{chartError}</p>
              <button
                onClick={handleRetry}
                className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
              >
                Попробовать снова
              </button>
            </div>
          ) : chartData ? (
            <canvas
              ref={canvasRef}
              className="w-full h-full"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-500">Нет данных для отображения</p>
            </div>
          )}
        </div>

        {/* Футер */}
        <footer className="px-6 pb-4 text-center text-gray-600 text-xs">
          Данные предоставлены CoinGecko API • Обновляется в реальном времени
        </footer>
      </main>
    </div>
  );
}