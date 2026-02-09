"use client";

import React, { useState, useEffect } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import dynamic from "next/dynamic";
import { useRef } from "react";
import {
  TrendingUp,
  Wallet,
  Cpu,
  History,
  LineChart as LineChartIcon,
  Settings,
  Bell,
  ArrowUpRight,
  ArrowDownRight,
  Circle,
  LogIn,
  LogOut,
  PlusCircle,
  Play,
  Square
} from "lucide-react";

// Usuwam statyczny import 'Turnstile' i zostawiam tylko wersję dynamiczną
// aby uniknąć błędu "the name Turnstile is defined multiple times"
const Turnstile = dynamic(() => import("@marsidev/react-turnstile").then((mod) => mod.Turnstile), {
  ssr: false,
});

// Dynamiczny import charta z osobnego pliku
const CandleChart = dynamic(() => import("@/components/CandleChart"), {
  ssr: false,
  loading: () => <div className="w-full h-[350px] bg-muted/20 animate-pulse rounded-xl flex items-center justify-center text-muted-foreground">Ładowanie wykresu...</div>
});

// Helper function for RSI calculation
function calculateRSI(prices: number[], period: number = 14): number[] {
  if (prices.length < period + 1) return [];

  const rsiArray: number[] = [];
  let gains = 0;
  let losses = 0;

  // Calculate initial average gain/loss
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  let rsi = 100 - (100 / (1 + rs));
  rsiArray.push(rsi);

  // Calculate subsequent values using smoothed averages
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;

    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi = 100 - (100 / (1 + rs));
    rsiArray.push(rsi);
  }

  return rsiArray;
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const [mounted, setMounted] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState(false);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  const [btcPrice, setBtcPrice] = useState(0);
  const [ethPrice, setEthPrice] = useState(0);
  const [candleData, setCandleData] = useState<any[]>([]);
  const [userBalance, setUserBalance] = useState(100.00);
  const [trades, setTrades] = useState<any[]>([]);
  const [strategies, setStrategies] = useState<any[]>([]);
  const [newStrategy, setNewStrategy] = useState({ pair: "BTC", type: "BUY", targetPrice: 0, amount: 0 });
  const lastTradeRef = useRef<number>(0); // Prevent double trading within same candle

  useEffect(() => {
    setMounted(true);

    if (session) {
      // Initialize data from API
      fetch("/api/user")
        .then(res => res.json())
        .then(data => {
          if (data.balance !== undefined) {
            setUserBalance(data.balance);
            setTrades(data.trades || []);
            setStrategies(data.strategies || []);
          }
        });
    }

    const fetchPricesAndKlines = async () => {
      try {
        // Fetch current prices
        const priceRes = await fetch("https://api.binance.com/api/v3/ticker/price?symbols=[%22BTCUSDT%22,%22ETHUSDT%22]");
        const priceData = await priceRes.json();

        const btc = parseFloat(priceData.find((item: any) => item.symbol === "BTCUSDT")?.price || "0");
        const eth = parseFloat(priceData.find((item: any) => item.symbol === "ETHUSDT")?.price || "0");

        setBtcPrice(btc);
        setEthPrice(eth);

        // Fetch 1m Klines for chart
        const klineRes = await fetch("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=100");
        const klineData = await klineRes.json();

        const formattedKlines = klineData.map((k: any) => ({
          time: k[0] / 1000,
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
        }));

        setCandleData(formattedKlines);

        // -- AUTOMATED BOT LOGIC --
        // Calculate indicators
        const closes = formattedKlines.map(k => k.close);
        const rsi = calculateRSI(closes, 14);
        const currentRSI = rsi[rsi.length - 1];

        // Calculate current BTC holding from trade history
        const btcPosition = trades
          .filter(t => t.pair === "BTC")
          .reduce((acc, t) => t.type === "BUY" ? acc + t.amount : acc - t.amount, 0);

        if (currentRSI) {
           // Strategy: RSI Mean Reversion
           // Buy when Oversold (<30) and we don't have a position
           // Sell when Overbought (>70) and we have a position

           const tradeAmount = 0.002; // Fixed trade amount
           const cost = tradeAmount * btc;

           if (currentRSI < 30 && btcPosition < 0.01 && userBalance > cost) {
              // Strong Buy signal
              autoExecuteTrade("BTC", "BUY", btc, tradeAmount);
           } else if (currentRSI > 70 && btcPosition >= tradeAmount) {
              // Strong Sell signal
              autoExecuteTrade("BTC", "SELL", btc, tradeAmount);
           }
        }

        // Manual Agent Logic
        strategies.forEach(strat => {
          if (strat.active) {
            const currentPrice = strat.pair === "BTC" ? btc : eth;
            if (currentPrice > 0) {
              if (strat.type === "BUY" && currentPrice <= strat.targetPrice) {
                executeTrade(strat, currentPrice);
              } else if (strat.type === "SELL" && currentPrice >= strat.targetPrice) {
                executeTrade(strat, currentPrice);
              }
            }
          }
        });
      } catch (error) {
        console.error("Failed to fetch markets", error);
      }
    };

    fetchPricesAndKlines();
    const interval = setInterval(fetchPricesAndKlines, 60000); // 1 minute interval as requested

    return () => clearInterval(interval);
  }, [strategies, userBalance, session, trades]);

  const autoExecuteTrade = async (pair: string, type: string, price: number, amount: number) => {
    // Avoid double trading in the same minute
    if (Date.now() - lastTradeRef.current < 45000) return;

    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        body: JSON.stringify({ pair, type, price, amount })
      });
      const data = await res.json();

      setTrades(prev => [data, ...prev]);
      const cost = price * amount;
      setUserBalance(prev => type === "BUY" ? prev - cost : prev + cost);

      lastTradeRef.current = Date.now();
    } catch (e) {}
  };

  const executeTrade = async (strat: any, price: number) => {
    const cost = strat.amount * price;
    if (strat.type === "BUY" && userBalance < cost) return;

    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        body: JSON.stringify({
          pair: strat.pair,
          type: strat.type,
          price: price,
          amount: strat.amount
        })
      });
      const data = await res.json();

      setUserBalance(prev => strat.type === "BUY" ? prev - cost : prev + cost);
      setTrades(prev => [data, ...prev]);
      deactivateStrategy(strat.id);
    } catch (e) {
      console.error("Trade execution failed", e);
    }
  };

  const deactivateStrategy = (id: string) => {
     setStrategies(prev => prev.map(s => s.id === id ? { ...s, active: false } : s));
  };

  const handleAddStrategy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newStrategy.targetPrice > 0 && newStrategy.amount > 0) {
      const res = await fetch("/api/strategies", {
        method: "POST",
        body: JSON.stringify({
          pair: newStrategy.pair,
          buyAt: newStrategy.type === "BUY" ? newStrategy.targetPrice : null,
          sellAt: newStrategy.type === "SELL" ? newStrategy.targetPrice : null,
          amount: newStrategy.amount,
        })
      });
      const data = await res.json();
      setStrategies(prev => [...prev, data]);
      setNewStrategy({ pair: "BTC", type: "BUY", targetPrice: 0, amount: 0 });
    }
  };

  const handleLogin = () => {
    if (!captchaToken) {
      return;
    }
    signIn("google");
  };

  if (!mounted || status === "loading") return null;

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4 leading-none">
        <div className="bg-card p-10 rounded-3xl border border-border text-center max-w-sm w-full shadow-[0_0_50px_-12px_rgba(59,130,246,0.3)] relative overflow-hidden">
          {/* Decorative element */}
          <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-transparent via-primary to-transparent opacity-50" />

          <div className="bg-primary/20 p-4 rounded-2xl w-20 h-20 flex items-center justify-center mx-auto mb-6 border border-primary/30">
            <Cpu className="text-primary w-10 h-10" />
          </div>

          <h1 className="text-3xl font-black mb-2 tracking-tight text-foreground">CRYPTO.AI</h1>
          <p className="text-muted-foreground mb-8 text-sm leading-relaxed">
            Wymagana weryfikacja konta <br />
            <span className="text-primary font-bold">@technischools.com</span>
          </p>

          <div className="mb-8 flex flex-col items-center justify-center w-full">
            <div className="bg-black/40 border border-border rounded-2xl p-4 w-full min-h-[100px] flex flex-col items-center justify-center gap-3">
              {turnstileSiteKey ? (
                <Turnstile
                  siteKey={turnstileSiteKey}
                  options={{
                    theme: "dark",
                    appearance: "always",
                  }}
                  onSuccess={(token) => {
                    setCaptchaToken(token);
                    setCaptchaError(false);
                  }}
                  onError={() => {
                    setCaptchaError(true);
                    setCaptchaToken(null);
                  }}
                />
              ) : (
                <span className="text-[10px] text-destructive font-bold uppercase tracking-widest text-center">
                  Brak NEXT_PUBLIC_TURNSTILE_SITE_KEY
                </span>
              )}

              {!captchaToken && !captchaError && (
                <span className="text-[10px] text-muted-foreground animate-pulse font-bold tracking-widest uppercase">
                  Oczekiwanie na weryfikację...
                </span>
              )}
            </div>

            {captchaError && (
              <div className="mt-3 p-2 bg-destructive/10 rounded-lg w-full">
                <p className="text-[10px] text-destructive font-bold uppercase tracking-tight">
                  Błąd połączenia z Cloudflare.
                </p>
              </div>
            )}
          </div>

          <button
            onClick={handleLogin}
            disabled={!captchaToken}
            className="w-full bg-primary text-white py-4 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-primary/90 hover:shadow-[0_0_20px_rgba(59,130,246,0.5)] transition-all active:scale-95 disabled:opacity-20 disabled:grayscale disabled:cursor-not-allowed group"
          >
            <LogIn size={20} className="group-hover:translate-x-1 transition-transform" />
            Zaloguj przez Google
          </button>

          <div className="mt-8 pt-6 border-t border-border flex items-center justify-center gap-2">
            <div className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
              System Secure-Auth Active
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground font-sans">
      {/* Header / Navbar */}
      <header className="h-16 border-b border-border bg-card px-8 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Cpu className="text-primary h-6 w-6" />
            <span className="text-xl font-bold tracking-tight">CRYPTO.AI</span>
          </div>
          <nav className="hidden md:flex items-center gap-4 ml-4">
            <button className="text-sm font-medium px-3 py-1.5 rounded-lg bg-muted text-foreground">Dashboard</button>
            <button className="text-sm font-medium px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">Market</button>
            <button className="text-sm font-medium px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">Portfolio</button>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col text-right mr-2">
            <span className="text-xs text-muted-foreground">Virtual Balance</span>
            <span className="text-sm font-bold text-success">${userBalance.toFixed(2)}</span>
          </div>
          <button className="p-2 hover:bg-muted rounded-lg transition-colors relative">
            <Bell size={18} />
          </button>
          <button
            onClick={() => signOut()}
            className="flex items-center gap-2 text-sm font-medium bg-muted hover:bg-destructive/10 hover:text-destructive px-3 py-1.5 rounded-lg transition-all"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-8 max-w-7xl mx-auto w-full space-y-8">
        {/* Top Stats */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            label="BTC/USDT"
            value={btcPrice > 0 ? `$${btcPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Loading..."}
            trend={btcPrice > 0 ? "up" : undefined}
            icon={<LineChartIcon className="text-primary" size={24} />}
          />
          <StatCard
            label="ETH/USDT"
            value={ethPrice > 0 ? `$${ethPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Loading..."}
            trend={ethPrice > 0 ? "up" : undefined}
            icon={<TrendingUp className="text-blue-400" size={24} />}
          />
          <StatCard
            label="User Balance"
            value={`$${userBalance.toFixed(2)}`}
            subtitle="Virtual USD"
            icon={<Wallet className="text-success" size={24} />}
          />
          <StatCard
            label="Live Trades"
            value={`${trades.length}`}
            subtitle="Total Executed"
            icon={<History className="text-primary" size={24} />}
          />
          <StatCard
            label="Active Bots"
            value={`${strategies.filter(s => s.active).length} Bots`}
            subtitle="Monitoring Market"
            icon={<Cpu className="text-primary" size={24} />}
          />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Chart Area */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-xl font-bold">Bitcoin Live Chart (1m)</h2>
                  <p className="text-sm text-muted-foreground italic text-primary animate-pulse">Bot is analyzing candles every 60s...</p>
                </div>
              </div>
              <div className="h-[350px] w-full">
                <CandleChart data={candleData} />
              </div>
            </div>

            {/* Trading History */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="p-6 border-b border-border flex items-center justify-between font-bold text-lg">
                Trade Logs
              </div>
              <div className="divide-y divide-border min-h-[200px]">
                {trades.length === 0 ? (
                  <div className="p-10 text-center text-muted-foreground italic">No trades executed yet...</div>
                ) : (
                  trades.map((trade) => (
                    <div key={trade.id} className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-full ${trade.type === "BUY" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                          {trade.type === "BUY" ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                        </div>
                        <div>
                          <p className="font-semibold">{trade.pair}/USDT</p>
                          <p className="text-xs text-muted-foreground">{trade.time}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-sm">{trade.amount} @ ${trade.price}</p>
                        <p className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block bg-success/20 text-success`}>
                          {trade.status}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Agent Configuration */}
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 bg-primary/20 rounded-full flex items-center justify-center text-primary">
                  <Cpu size={24} />
                </div>
                <h2 className="font-bold text-lg">Bot Configurator</h2>
              </div>

              <form onSubmit={handleAddStrategy} className="space-y-4 mb-8">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Type</label>
                    <select
                      value={newStrategy.type}
                      onChange={e => setNewStrategy({...newStrategy, type: e.target.value})}
                      className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:ring-1 ring-primary outline-none"
                    >
                      <option value="BUY">BUY</option>
                      <option value="SELL">SELL</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Pair</label>
                    <select
                      value={newStrategy.pair}
                      onChange={e => setNewStrategy({...newStrategy, pair: e.target.value})}
                      className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:ring-1 ring-primary outline-none"
                    >
                      <option value="BTC">BTC/USDT</option>
                      <option value="ETH">ETH/USDT</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase">Target Price ($)</label>
                  <input
                    type="number"
                    value={newStrategy.targetPrice || ""}
                    onChange={e => setNewStrategy({...newStrategy, targetPrice: parseFloat(e.target.value)})}
                    placeholder="e.g. 44500"
                    className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:ring-1 ring-primary outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase">Amount (BTC)</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={newStrategy.amount || ""}
                    onChange={e => setNewStrategy({...newStrategy, amount: parseFloat(e.target.value)})}
                    placeholder="0.001"
                    className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:ring-1 ring-primary outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-primary text-white py-2 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-all text-sm"
                >
                  <PlusCircle size={16} />
                  Add Strategy Bot
                </button>
              </form>

              <div className="space-y-3">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Active Bots</h3>
                {strategies.map(strat => (
                  <div key={strat.id} className={`p-3 rounded-xl border ${strat.active ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30 opacity-60"} flex items-center justify-between`}>
                    <div className="flex items-center gap-3">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center ${strat.type === "BUY" ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"}`}>
                        <Cpu size={14} />
                      </div>
                      <div>
                        <p className="text-xs font-bold">{strat.type} {strat.pair} @ ${strat.targetPrice}</p>
                        <p className="text-[10px] text-muted-foreground">{strat.amount} BTC</p>
                      </div>
                    </div>
                    {strat.active ? (
                      <span className="flex items-center gap-1.5 text-[10px] font-bold text-success">
                        <Circle className="h-1.5 w-1.5 fill-success animate-pulse" />
                        RUNNING
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-muted-foreground">DONE</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Hint Box */}
            <div className="bg-linear-to-br from-primary to-blue-600 rounded-2xl p-6 text-white overflow-hidden relative group">
              <div className="relative z-10">
                <h3 className="text-lg font-bold mb-2">TechniSchools Alpha</h3>
                <p className="text-sm text-blue-50/90 leading-relaxed">
                  Your balance is virtual. Trades are executed on real-time price feeds. Stay tuned for leaderboard!
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, subtitle, trend, icon }: any) {
  return (
    <div className="bg-card border border-border rounded-2xl p-6 hover:shadow-xl hover:shadow-primary/5 transition-all">
      <div className="flex items-center justify-between mb-4">
        <div className="p-2 bg-muted rounded-lg">{icon}</div>
        {trend && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${trend === "up" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
            {trend === "up" ? "LIVE" : "LIVE"}
          </span>
        )}
      </div>
      <div>
        <p className="text-sm text-muted-foreground mb-1">{label}</p>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-2">{subtitle}</p>}
      </div>
    </div>
  );
}
