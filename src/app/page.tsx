"use client";

import React, { useState, useEffect } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
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
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";

export default function Dashboard() {
  const { data: session, status } = useSession();
  const [mounted, setMounted] = useState(false);
  const [btcPrice, setBtcPrice] = useState(45000);
  const [chartData, setChartData] = useState<any[]>([]);
  const [userBalance, setUserBalance] = useState(100.00);
  const [trades, setTrades] = useState<any[]>([]);
  const [strategies, setStrategies] = useState<any[]>([]);
  const [newStrategy, setNewStrategy] = useState({ pair: "BTC", type: "BUY", targetPrice: 0, amount: 0 });

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

    // Simulate live market data and agent behavior
    const interval = setInterval(() => {
      const newPrice = 45000 + (Math.random() - 0.5) * 500;
      setBtcPrice(newPrice);

      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setChartData(prev => [...prev.slice(-19), { time, price: newPrice }]);

      // Simple Agent Logic
      strategies.forEach(strat => {
        if (strat.active) {
          if (strat.type === "BUY" && newPrice <= strat.targetPrice) {
            executeTrade(strat, newPrice);
          } else if (strat.type === "SELL" && newPrice >= strat.targetPrice) {
            executeTrade(strat, newPrice);
          }
        }
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [strategies, userBalance]);

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
        })
      });
      const data = await res.json();
      setStrategies(prev => [...prev, data]);
      setNewStrategy({ pair: "BTC", type: "BUY", targetPrice: 0, amount: 0 });
    }
  };

  if (!mounted || status === "loading") return null;

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="bg-card p-10 rounded-2xl border border-border text-center max-w-sm w-full mx-4">
          <div className="bg-primary/20 p-4 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6">
            <Cpu className="text-primary w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Welcome to CRYPTO.AI</h1>
          <p className="text-muted-foreground mb-8">Login with your @technischools.com account to start trading.</p>
          <button
            onClick={() => signIn("google")}
            className="w-full bg-primary text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-all"
          >
            <LogIn size={20} />
            Login with Google
          </button>
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
            value={`$${btcPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            trend={btcPrice > 45000 ? "up" : "down"}
            icon={<LineChartIcon className="text-primary" size={24} />}
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
                  <h2 className="text-xl font-bold">Bitcoin Live Feed</h2>
                  <p className="text-sm text-muted-foreground">Real-time market analysis</p>
                </div>
              </div>
              <div className="h-87.5 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                    <XAxis dataKey="time" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis domain={['auto', 'auto']} stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `$${(val/1000).toFixed(1)}k`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px" }}
                      itemStyle={{ color: "#fafafa" }}
                    />
                    <Area isAnimationActive={false} type="monotone" dataKey="price" stroke="var(--color-primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorPrice)" />
                  </AreaChart>
                </ResponsiveContainer>
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
                    <select className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:ring-1 ring-primary outline-none">
                      <option>BTC/USDT</option>
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
