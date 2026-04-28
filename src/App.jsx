import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  Cloud, 
  Sun, 
  CloudRain, 
  Wind, 
  Droplets, 
  Zap, 
  Globe, 
  Navigation,
  Timer,
  Search,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utility for Tailwind classes ---
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// --- Chart.js Registration ---
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

// --- Configuration ---
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const OPENWEATHER_KEY = import.meta.env.VITE_OPENWEATHER_KEY;
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/weather`;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Helpers ---
const getWeatherEmoji = (desc) => {
  const d = desc.toLowerCase();
  if (d.includes('sun') || d.includes('clear')) return '☀️';
  if (d.includes('cloud')) return '☁️';
  if (d.includes('rain') || d.includes('drizzle')) return '🌧️';
  if (d.includes('thunder')) return '⛈️';
  if (d.includes('snow')) return '❄️';
  return '🌡️';
};

export default function App() {
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);
  const [normalResult, setNormalResult] = useState(null);
  const [edgeResult, setEdgeResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);

  // --- Normal API Route ---
  const fetchWeatherNormal = async (cityName) => {
    const startTime = Date.now();
    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${cityName}&appid=${OPENWEATHER_KEY}&units=metric`
      );
      const data = await response.json();
      
      if (data.cod !== 200) throw new Error(data.message);

      const responseTime = Date.now() - startTime;
      const result = {
        city: data.name,
        temperature: data.main.temp,
        description: data.weather[0].description,
        humidity: data.main.humidity,
        wind_speed: data.wind.speed,
        response_time_ms: responseTime,
        total_roundtrip_ms: responseTime, // For Normal API, these are the same
        server_location: "Origin Server (Global API)",
        request_type: "normal"
      };

      // Log to Supabase (Background)
      supabase.from('api_logs').insert({
        request_type: 'normal',
        city: result.city,
        response_time_ms: result.response_time_ms,
        server_location: result.server_location
      });

      return result;
    } catch (err) {
      console.error("Normal Fetch Error:", err);
      throw err;
    }
  };

  // --- Edge Function Route ---
  const fetchWeatherEdge = async (cityName) => {
    const startTime = Date.now();
    try {
      const response = await fetch(`${EDGE_FUNCTION_URL}?city=${cityName}`);
      const data = await response.json();
      const totalTime = Date.now() - startTime;

      if (data.error) throw new Error(data.error);
      
      return {
        ...data,
        total_roundtrip_ms: totalTime,
        internal_response_time_ms: data.response_time_ms
      };
    } catch (err) {
      console.error("Edge Fetch Error:", err);
      throw err;
    }
  };

  const handleCompare = async (e) => {
    e.preventDefault();
    if (!city) return;
    
    setLoading(true);
    setError(null);
    setNormalResult(null);
    setEdgeResult(null);

    try {
      const [normal, edge] = await Promise.all([
        fetchWeatherNormal(city),
        fetchWeatherEdge(city)
      ]);

      setNormalResult(normal);
      setEdgeResult(edge);
      
      const newComparison = {
        city: normal.city,
        normalTime: normal.total_roundtrip_ms,
        edgeTime: edge.total_roundtrip_ms,
        timestamp: Date.now()
      };

      setHistory(prev => [newComparison, ...prev].slice(0, 5));
    } catch (err) {
      setError(err.message || "Failed to fetch weather data. Please check your API keys.");
    } finally {
      setLoading(false);
    }
  };

  // --- Stats Calculations ---
  const stats = useMemo(() => {
    if (history.length === 0) return null;
    const avgNormal = history.reduce((acc, h) => acc + h.normalTime, 0) / history.length;
    const avgEdge = history.reduce((acc, h) => acc + h.edgeTime, 0) / history.length;
    const improvement = ((avgNormal - avgEdge) / avgNormal) * 100;
    return {
      avgNormal: Math.round(avgNormal),
      avgEdge: Math.round(avgEdge),
      improvement: Math.round(improvement)
    };
  }, [history]);

  // --- Chart Data ---
  const chartData = {
    labels: history.map(h => h.city),
    datasets: [
      {
        label: 'Normal API (ms)',
        data: history.map(h => h.normalTime),
        backgroundColor: '#f97316',
        borderRadius: 6,
      },
      {
        label: 'Edge Function (ms)',
        data: history.map(h => h.edgeTime),
        backgroundColor: '#14b8a6',
        borderRadius: 6,
      }
    ]
  };

  const chartOptions = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: '#94a3b8' } },
      title: { display: false }
    },
    scales: {
      x: { grid: { color: '#1e293b' }, ticks: { color: '#94a3b8' } },
      y: { grid: { display: false }, ticks: { color: '#94a3b8' } }
    }
  };

  const isEdgeFaster = normalResult && edgeResult && edgeResult.total_roundtrip_ms < normalResult.total_roundtrip_ms;
  const isNormalFaster = normalResult && edgeResult && normalResult.total_roundtrip_ms < edgeResult.total_roundtrip_ms;

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      {/* Header */}
      <header className="text-center mb-16 space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-sm font-medium mb-4">
          <Zap size={14} className="fill-indigo-400" />
          <span>Performance Seminar Demo</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold font-outfit tracking-tight text-white mb-6">
          Normal API <span className="text-indigo-500">vs</span> Edge
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto">
          Compare the speed and localization of traditional Origin servers versus globally distributed Edge functions in real-time.
        </p>
      </header>

      {/* Search Input */}
      <form onSubmit={handleCompare} className="max-w-md mx-auto mb-16 relative">
        <div className="relative group">
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Enter city (e.g. Mumbai, New York, London)..."
            className="w-full bg-slate-900/50 border border-slate-700/50 rounded-2xl py-4 pl-12 pr-32 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-white placeholder:text-slate-500"
          />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors" size={20} />
          <button
            disabled={loading}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-6 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-600/20"
          >
            {loading ? 'Comparing...' : 'Compare'}
          </button>
        </div>
        {error && (
          <div className="mt-4 flex items-center gap-2 text-rose-400 text-sm bg-rose-400/10 p-3 rounded-lg border border-rose-400/20">
            <AlertCircle size={16} />
            {error}
          </div>
        )}
      </form>

      {/* Comparison Cards */}
      <div className="grid md:grid-cols-2 gap-8 mb-16">
        {/* Normal API Card */}
        <div className={cn(
          "glass rounded-3xl p-8 relative transition-all duration-500",
          normalResult ? "opacity-100 translate-y-0" : "opacity-50",
          isNormalFaster && "ring-2 ring-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.2)]"
        )}>
          {isNormalFaster && <div className="faster-badge">⚡ Faster</div>}
          <div className="flex justify-between items-start mb-8">
            <div className="space-y-1">
              <span className="text-orange-400 text-xs font-bold uppercase tracking-widest">Traditional Architecture</span>
              <h2 className="text-2xl font-bold text-white">Normal API</h2>
            </div>
            <div className="p-3 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-400">
              <Globe size={24} />
            </div>
          </div>

          {!normalResult ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-600">
              {loading ? (
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-orange-500/20 border-t-orange-500" />
              ) : (
                <>
                  <Cloud size={48} className="mb-4 opacity-20" />
                  <p>Awaiting search...</p>
                </>
              )}
            </div>
          ) : (
            <div className="animate-fade-in space-y-6">
              <div className="flex items-center gap-4">
                <span className="text-6xl">{getWeatherEmoji(normalResult.description)}</span>
                <div>
                  <div className="text-4xl font-black text-white">{Math.round(normalResult.temperature)}°C</div>
                  <div className="text-slate-400 font-medium capitalize">{normalResult.description}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-900/40 p-4 rounded-2xl border border-white/5">
                  <div className="text-slate-500 text-xs flex items-center gap-1.5 mb-1">
                    <Droplets size={12} /> Humidity
                  </div>
                  <div className="text-lg font-bold text-white">{normalResult.humidity}%</div>
                </div>
                <div className="bg-slate-900/40 p-4 rounded-2xl border border-white/5">
                  <div className="text-slate-500 text-xs flex items-center gap-1.5 mb-1">
                    <Wind size={12} /> Wind
                  </div>
                  <div className="text-lg font-bold text-white">{normalResult.wind_speed} m/s</div>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-white/5">
                <div className="flex justify-between items-end">
                  <div className="text-slate-500 text-sm flex items-center gap-2">
                    <Timer size={16} /> Total Latency
                  </div>
                  <div className="text-3xl font-black text-orange-500 leading-none">{normalResult.total_roundtrip_ms} <span className="text-sm font-normal text-slate-500">ms</span></div>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <div className="text-slate-500 flex items-center gap-2">
                    <Navigation size={16} /> Infrastructure
                  </div>
                  <div className="text-slate-300 font-medium">{normalResult.server_location}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Edge Function Card */}
        <div className={cn(
          "glass rounded-3xl p-8 relative transition-all duration-500",
          edgeResult ? "opacity-100 translate-y-0" : "opacity-50",
          isEdgeFaster && "ring-2 ring-teal-400 shadow-[0_0_30px_rgba(20,184,166,0.2)]"
        )}>
          {isEdgeFaster && <div className="faster-badge">⚡ Faster</div>}
          <div className="flex justify-between items-start mb-8">
            <div className="space-y-1">
              <span className="text-teal-400 text-xs font-bold uppercase tracking-widest">Serverless Edge</span>
              <h2 className="text-2xl font-bold text-white">Edge Function</h2>
            </div>
            <div className="p-3 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-400">
              <Zap size={24} />
            </div>
          </div>

          {!edgeResult ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-600">
              {loading ? (
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-teal-500/20 border-t-teal-500" />
              ) : (
                <>
                  <Zap size={48} className="mb-4 opacity-20" />
                  <p>Awaiting search...</p>
                </>
              )}
            </div>
          ) : (
            <div className="animate-fade-in space-y-6">
              <div className="flex items-center gap-4">
                <span className="text-6xl">{getWeatherEmoji(edgeResult.description)}</span>
                <div>
                  <div className="text-4xl font-black text-white">{Math.round(edgeResult.temperature)}°C</div>
                  <div className="text-slate-400 font-medium capitalize">{edgeResult.description}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-900/40 p-4 rounded-2xl border border-white/5">
                  <div className="text-slate-500 text-xs flex items-center gap-1.5 mb-1">
                    <Droplets size={12} /> Humidity
                  </div>
                  <div className="text-lg font-bold text-white">{edgeResult.humidity}%</div>
                </div>
                <div className="bg-slate-900/40 p-4 rounded-2xl border border-white/5">
                  <div className="text-slate-500 text-xs flex items-center gap-1.5 mb-1">
                    <Wind size={12} /> Wind
                  </div>
                  <div className="text-lg font-bold text-white">{edgeResult.wind_speed} m/s</div>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-white/5">
                <div className="flex justify-between items-end">
                  <div className="text-slate-500 text-sm flex items-center gap-2">
                    <Timer size={16} /> Total Roundtrip
                  </div>
                  <div className="text-3xl font-black text-teal-500 leading-none">{edgeResult.total_roundtrip_ms} <span className="text-sm font-normal text-slate-500">ms</span></div>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <div className="text-slate-500 flex items-center gap-2">
                    <Zap size={14} /> Edge Fetch Time
                  </div>
                  <div className="text-teal-500/70 font-medium">{edgeResult.internal_response_time_ms}ms</div>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <div className="text-slate-500 flex items-center gap-2">
                    <Navigation size={16} /> Edge Location
                  </div>
                  <div className="text-teal-400 font-medium">{edgeResult.server_location}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Comparison Table */}
      <section className="mb-16">
        <h3 className="text-2xl font-bold text-white mb-8 text-center">Infrastructure Comparison</h3>
        <div className="glass rounded-3xl overflow-hidden border border-white/10">
          <table className="w-full text-left">
            <thead className="bg-white/5">
              <tr>
                <th className="px-6 py-4 text-sm font-bold text-slate-400 uppercase tracking-wider">Feature</th>
                <th className="px-6 py-4 text-sm font-bold text-orange-400 uppercase tracking-wider">Normal API</th>
                <th className="px-6 py-4 text-sm font-bold text-teal-400 uppercase tracking-wider">Edge Function</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <tr>
                <td className="px-6 py-4 text-slate-300 font-medium">Server Location</td>
                <td className="px-6 py-4 text-slate-400">Fixed (Single Region)</td>
                <td className="px-6 py-4 text-teal-300 font-semibold flex items-center gap-2">
                  <Globe size={14} /> Nearest Edge Node
                </td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-slate-300 font-medium">Internal Latency</td>
                <td className="px-6 py-4 text-orange-300">{normalResult ? `${normalResult.response_time_ms}ms` : '--'}</td>
                <td className="px-6 py-4 text-teal-300">{edgeResult ? `${edgeResult.internal_response_time_ms}ms` : '--'}</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-slate-300 font-medium">Total Roundtrip</td>
                <td className="px-6 py-4 text-orange-400">{normalResult ? `${normalResult.total_roundtrip_ms}ms` : '--'}</td>
                <td className="px-6 py-4 text-teal-400 font-bold">{edgeResult ? `${edgeResult.total_roundtrip_ms}ms` : '--'}</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-slate-300 font-medium">Cold Start Impact</td>
                <td className="px-6 py-4 text-slate-400">None (Persistent)</td>
                <td className="px-6 py-4 text-slate-300">~50-200ms (Initial)</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-slate-300 font-medium">Best For</td>
                <td className="px-6 py-4 text-slate-400">Simple, single-region apps</td>
                <td className="px-6 py-4 text-teal-300 font-semibold">Global, high-performance apps</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Chart Section */}
      <section className="grid lg:grid-cols-3 gap-8 items-start">
        <div className="lg:col-span-2 glass rounded-3xl p-8">
          <h3 className="text-xl font-bold text-white mb-6">Response Time Comparison (Last 5)</h3>
          <div className="h-64">
            {history.length > 0 ? (
              <Bar data={chartData} options={chartOptions} />
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600 border-2 border-dashed border-white/5 rounded-2xl">
                Start comparing to see data
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass rounded-3xl p-8 border border-white/10">
            <h3 className="text-xl font-bold text-white mb-6">Efficiency Stats</h3>
            {!stats ? (
              <p className="text-slate-500 italic">No data yet...</p>
            ) : (
              <div className="space-y-6">
                <div>
                  <div className="text-slate-500 text-sm mb-1">Avg. Normal API</div>
                  <div className="text-3xl font-black text-white">{stats.avgNormal}ms</div>
                </div>
                <div>
                  <div className="text-slate-500 text-sm mb-1">Avg. Edge Function</div>
                  <div className="text-3xl font-black text-white">{stats.avgEdge}ms</div>
                </div>
                <div className="pt-4 border-t border-white/10">
                  <div className="flex items-center gap-2 text-teal-400 font-bold mb-1">
                    <CheckCircle2 size={18} />
                    <span>Speed Boost</span>
                  </div>
                  <div className="text-4xl font-black text-teal-400">{stats.improvement}% Faster</div>
                </div>
              </div>
            )}
          </div>
          
          <div className="p-6 rounded-3xl bg-indigo-600/10 border border-indigo-600/20">
            <p className="text-indigo-300 text-sm leading-relaxed">
              <strong>Tip:</strong> Ask the audience to scan the QR code and search from their own devices to see the "Server Location" change based on their connectivity!
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
