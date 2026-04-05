import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { 
  Phone, 
  RefreshCw, 
  History, 
  LogOut, 
  ShieldCheck, 
  Clock, 
  Copy, 
  CheckCircle2, 
  AlertCircle,
  Smartphone,
  MessageSquare,
  Loader2,
  Download
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface HistoryItem {
  phone_number: string;
  otps: string;
  full_sms_list: string;
  created_at: string;
  service_name?: string;
}

interface ActiveNumber {
  number: string;
  range: string;
  startTime: number;
}

export default function App() {
  const [email, setEmail] = useState("fahdiikhann@gmail.com");
  const [password, setPassword] = useState("ALIKHAN12");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [phpSessId, setPhpSessId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [manualRange, setManualRange] = useState("23276XXX");
  const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString('en-CA')); // YYYY-MM-DD
  const [activeNumber, setActiveNumber] = useState<ActiveNumber | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [serverOffset, setServerOffset] = useState(0);
  const [otp, setOtp] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isPolling, setIsPolling] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [logs, setLogs] = useState<{msg: string, time: string, type: 'info' | 'error' | 'success' | 'warn'}[]>([]);

  // Update current time for history timers
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const addLog = useCallback((msg: string, type: 'info' | 'error' | 'success' | 'warn' = 'info') => {
    const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [{ msg, time, type }, ...prev].slice(0, 50));
  }, []);

  // Load session from local storage
  useEffect(() => {
    const savedSess = localStorage.getItem("phpSessId");
    const savedActive = localStorage.getItem("activeNumber");
    if (savedSess) {
      setPhpSessId(savedSess);
      setIsLoggedIn(true);
      addLog("Session restored from local storage", "success");
    }
    if (savedActive) {
      const parsed = JSON.parse(savedActive);
      const elapsed = Math.floor((Date.now() - parsed.startTime) / 1000);
      if (elapsed < 1200) { // 20 minutes
        setActiveNumber(parsed);
        setTimeLeft(1200 - elapsed);
        setIsPolling(true);
        addLog(`Active number ${parsed.number} restored`, "info");
      } else {
        localStorage.removeItem("activeNumber");
        addLog("Previous number session expired", "warn");
      }
    }
  }, [addLog]);

  // Timer logic
  useEffect(() => {
    let timer: number;
    if (timeLeft > 0 && activeNumber) {
      timer = window.setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            setActiveNumber(null);
            setIsPolling(false);
            localStorage.removeItem("activeNumber");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [timeLeft, activeNumber]);

  // Polling logic for OTP
  useEffect(() => {
    let pollInterval: number;
    if (isPolling && activeNumber && !otp) {
      pollInterval = window.setInterval(async () => {
        try {
          const res = await axios.get("/api/get-history", {
            params: { phpSessId, limit: 20, date: selectedDate }
          });
          
          // Sync server time offset
          const serverDateHeader = res.headers['x-server-date'] || res.headers.date;
          if (serverDateHeader) {
            const serverTime = new Date(serverDateHeader).getTime();
            const localTime = Date.now();
            setServerOffset(serverTime - localTime);
          }

          if (res.data.status === "success") {
            const items = res.data.data as HistoryItem[];
            setHistory(items);
            
            // Find the most recent OTP for this number that is "new"
            // We'll look for the first one that matches the number
            const found = items.find(item => item.phone_number === activeNumber.number);
            
            if (found && found.otps && found.otps !== "null") {
              // Basic check: if it's in the history, and we haven't seen it yet
              // Ideally we'd compare timestamps, but timezone differences make it tricky.
              // For now, we'll assume the first one found in the current date's history is the one we want.
              setOtp(found.otps);
              setIsPolling(false);
              addLog(`OTP received for ${activeNumber.number}: ${found.otps}`, "success");
            }
          }
        } catch (err) {
          console.error("Polling error", err);
        }
      }, 5000);
    }
    return () => clearInterval(pollInterval);
  }, [isPolling, activeNumber, otp, phpSessId]);

  const getStatus = (createdAt: string) => {
    try {
      // Handle various date formats
      const normalizedDate = createdAt.includes(' ') ? createdAt.replace(' ', 'T') : createdAt;
      const created = new Date(normalizedDate).getTime();
      
      // Use server-synced time
      const now = currentTime + serverOffset;
      
      // Calculate raw elapsed seconds
      let elapsedSeconds = Math.floor((now - created) / 1000);
      
      // Timezone correction: If time is in the future, adjust by 30-min increments
      if (elapsedSeconds < -30) {
        const adjustment = Math.round(Math.abs(elapsedSeconds) / 1800) * 1800;
        elapsedSeconds += adjustment;
      }

      // 20 minutes = 1200 seconds
      const diff = 1200 - elapsedSeconds;
      
      if (diff <= 0 || isNaN(diff)) {
        return { label: "Expired", color: "text-red-500", time: null };
      }
      
      // Cap at 20 minutes if for some reason it's higher (due to clock sync)
      const displayDiff = Math.min(1200, diff);
      
      const mins = Math.floor(displayDiff / 60);
      const secs = displayDiff % 60;
      return { 
        label: "Active", 
        color: "text-emerald-500", 
        time: `${mins}:${secs.toString().padStart(2, '0')}` 
      };
    } catch (e) {
      return { label: "Unknown", color: "text-zinc-600", time: null };
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    addLog(`Initiating login for ${email}...`, "info");
    try {
      const res = await axios.post("/api/login", { email, password });
      if (res.data.success && res.data.phpSessId) {
        setPhpSessId(res.data.phpSessId);
        setIsLoggedIn(true);
        localStorage.setItem("phpSessId", res.data.phpSessId);
        addLog("Login successful. Session established.", "success");
      } else {
        const errMsg = res.data.error || "Login failed. Invalid credentials.";
        setError(errMsg);
        addLog(errMsg, "error");
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.error || "Network error during login.";
      setError(errMsg);
      addLog(`Login error: ${errMsg}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    addLog("User initiated logout", "warn");
    setIsLoggedIn(false);
    setPhpSessId("");
    localStorage.removeItem("phpSessId");
    localStorage.removeItem("activeNumber");
    setActiveNumber(null);
    setOtp(null);
  };

  const getNumber = async (specificRange?: string) => {
    setLoading(true);
    setError(null);
    setOtp(null);
    
    const targetRange = specificRange || manualRange;
    addLog(`Requesting virtual number for range: ${targetRange}...`, "info");
    
    try {
      const res = await axios.post("/api/get-number", { phpSessId, range: targetRange });
      
      // Sync server time offset
      const serverDateHeader = res.headers['x-server-date'] || res.headers.date;
      if (serverDateHeader) {
        const serverTime = new Date(serverDateHeader).getTime();
        const localTime = Date.now();
        setServerOffset(serverTime - localTime);
      }

      if (res.data.status === "success") {
        const newActive = {
          number: res.data.number,
          range: res.data.range || targetRange,
          startTime: Date.now()
        };
        setActiveNumber(newActive);
        setTimeLeft(1200);
        setIsPolling(true);
        localStorage.setItem("activeNumber", JSON.stringify(newActive));
        addLog(`Number acquired: ${res.data.number}`, "success");
      } else {
        const errMsg = res.data.message || "No numbers available in this range.";
        setError(errMsg);
        addLog(`Failed to acquire number: ${errMsg}`, "error");
      }
    } catch (err: any) {
      setError("Failed to fetch number. API error.");
      addLog("API Error while fetching number", "error");
    } finally {
      setLoading(false);
    }
  };

  const autoCycleNumber = async () => {
    setLoading(true);
    setError(null);
    setOtp(null);
    addLog("Initiating auto-cycle signal acquisition...", "info");
    
    const ranges = ["23276XXX", "23277XXX", "23278XXX", "23279XXX"];
    let success = false;
    
    for (const range of ranges) {
      try {
        addLog(`Testing range: ${range}`, "info");
        const res = await axios.post("/api/get-number", { phpSessId, range });
        
        // Sync server time offset
        const serverDateHeader = res.headers['x-server-date'] || res.headers.date;
        if (serverDateHeader) {
          const serverTime = new Date(serverDateHeader).getTime();
          const localTime = Date.now();
          setServerOffset(serverTime - localTime);
        }

        if (res.data.status === "success") {
          const newActive = {
            number: res.data.number,
            range: res.data.range || range,
            startTime: Date.now()
          };
          setActiveNumber(newActive);
          setTimeLeft(1200);
          setIsPolling(true);
          localStorage.setItem("activeNumber", JSON.stringify(newActive));
          success = true;
          addLog(`Number acquired: ${res.data.number}`, "success");
          break;
        }
      } catch (err) {
        continue;
      }
    }
    
    if (!success) {
      setError("Auto-cycle failed: All ranges exhausted.");
      addLog("Auto-cycle failed", "error");
    }
    setLoading(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4 font-mono selection:bg-emerald-500/30">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-[#0a0a0a] border border-zinc-800 rounded-lg p-8 shadow-[0_0_50px_-12px_rgba(16,185,129,0.1)] relative overflow-hidden"
        >
          {/* Decorative elements */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-50" />
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl" />
          
          <div className="flex flex-col items-center mb-10 relative">
            <div className="w-20 h-20 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center mb-6 shadow-inner group">
              <ShieldCheck className="text-emerald-500 w-12 h-12 group-hover:scale-110 transition-transform" />
            </div>
            <h1 className="text-2xl font-black text-white tracking-[0.2em] uppercase">MK-NET OPS</h1>
            <div className="flex items-center gap-2 mt-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">System Ready // Secure Link</p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-6 relative">
            <div className="space-y-1.5">
              <div className="flex justify-between items-center px-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Operator ID</label>
                <span className="text-[8px] text-zinc-700 font-mono">REQ_EMAIL_AUTH</span>
              </div>
              <div className="relative group">
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-900/50 border border-zinc-800 rounded-md px-4 py-3.5 text-emerald-500 placeholder:text-zinc-700 focus:outline-none focus:border-emerald-500/50 focus:bg-zinc-900 transition-all text-sm"
                  placeholder="operator@mknet.sys"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center px-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Access Key</label>
                <span className="text-[8px] text-zinc-700 font-mono">SEC_ENCRYPT_AES</span>
              </div>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-900/50 border border-zinc-800 rounded-md px-4 py-3.5 text-emerald-500 placeholder:text-zinc-700 focus:outline-none focus:border-emerald-500/50 focus:bg-zinc-900 transition-all text-sm"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-red-500/5 border border-red-500/20 rounded-md p-4 flex items-start gap-3 text-red-500 text-xs leading-relaxed"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold uppercase block mb-1">Auth Error</span>
                  {error}
                </div>
              </motion.div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-black font-black py-4 rounded-md shadow-[0_0_20px_-5px_rgba(16,185,129,0.3)] transition-all flex items-center justify-center gap-3 uppercase tracking-[0.2em] text-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Establishing...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5" />
                  <span>Initialize Session</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-10 pt-6 border-t border-zinc-900 flex justify-between items-center">
            <span className="text-[8px] text-zinc-700 uppercase tracking-widest">v4.2.0-stable</span>
            <div className="flex gap-4">
              <div className="w-1 h-1 bg-zinc-800 rounded-full" />
              <div className="w-1 h-1 bg-zinc-800 rounded-full" />
              <div className="w-1 h-1 bg-zinc-800 rounded-full" />
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-400 font-mono selection:bg-emerald-500/30">
      {/* Top Status Bar */}
      <header className="border-b border-zinc-900 bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-emerald-600 rounded flex items-center justify-center">
                <ShieldCheck className="text-black w-4 h-4" />
              </div>
              <span className="font-black text-white tracking-widest text-sm">MK-NET // TERMINAL</span>
            </div>
            <div className="h-4 w-px bg-zinc-800 hidden md:block" />
            <div className="hidden md:flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-emerald-500">Uplink Active</span>
              </div>
              <span className="text-zinc-600">Enc: AES-256</span>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden lg:flex items-center gap-3 bg-zinc-900/50 px-3 py-1.5 rounded border border-zinc-800">
              <Smartphone className="w-3 h-3 text-zinc-500" />
              <span className="text-[10px] text-zinc-400">{email}</span>
            </div>
            <button 
              onClick={handleLogout}
              className="group flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-red-500 transition-colors"
            >
              <span>Terminate</span>
              <LogOut className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Main Controls */}
        <main className="lg:col-span-8 space-y-6">
          {/* Active Module */}
          <section className="bg-[#0a0a0a] border border-zinc-800 rounded-lg overflow-hidden shadow-2xl relative">
            <div className="absolute top-0 left-0 w-1 h-full bg-emerald-600" />
            <div className="p-6 border-b border-zinc-900 flex items-center justify-between bg-zinc-900/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 rounded border border-emerald-500/20">
                  <Smartphone className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-white uppercase tracking-widest">Signal Acquisition Module</h2>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">Virtual SIM Interface // v2.4</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded px-2 py-1 gap-2">
                  <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">Range:</span>
                  <input 
                    type="text"
                    value={manualRange}
                    onChange={(e) => setManualRange(e.target.value)}
                    className="bg-transparent border-none text-[10px] text-emerald-500 font-bold focus:outline-none w-20 uppercase"
                    placeholder="23276XXX"
                  />
                </div>
                {!activeNumber && (
                  <button 
                    onClick={() => getNumber()}
                    disabled={loading}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-black px-5 py-2 rounded font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 shadow-[0_0_15px_-5px_rgba(16,185,129,0.4)]"
                  >
                    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Acquire Signal
                  </button>
                )}
              </div>
            </div>

            <div className="p-8">
              <AnimatePresence mode="wait">
                {activeNumber ? (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-8"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-zinc-900/30 border border-zinc-800 rounded-lg p-6 relative group">
                        <div className="absolute top-2 right-2 flex gap-1">
                          <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                          <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                        </div>
                        <span className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] block mb-3">Assigned Frequency</span>
                        <div className="flex items-center justify-between">
                          <span className="text-4xl font-black text-emerald-500 tracking-tighter tabular-nums">{activeNumber.number}</span>
                          <button 
                            onClick={() => {
                              copyToClipboard(activeNumber.number);
                              addLog(`Copied number: ${activeNumber.number}`, "info");
                            }}
                            className="p-2.5 hover:bg-emerald-500/10 text-zinc-500 hover:text-emerald-500 rounded border border-transparent hover:border-emerald-500/20 transition-all"
                          >
                            <Copy className="w-5 h-5" />
                          </button>
                        </div>
                      </div>

                      <div className="bg-zinc-900/30 border border-zinc-800 rounded-lg p-6 flex items-center gap-6">
                        <div className="w-14 h-14 bg-zinc-900 border border-zinc-800 rounded flex items-center justify-center shrink-0 shadow-inner">
                          <Clock className="text-emerald-500 w-7 h-7" />
                        </div>
                        <div className="flex-1">
                          <span className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] block mb-2">Signal TTL (20m Limit)</span>
                          <div className="flex items-end gap-2">
                            <span className="text-3xl font-black text-white tabular-nums leading-none">{formatTime(timeLeft)}</span>
                            <span className="text-[10px] text-zinc-500 font-bold mb-1">SEC</span>
                          </div>
                          <div className="mt-3 h-1 bg-zinc-800 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: "100%" }}
                              animate={{ width: `${(timeLeft / 1200) * 100}%` }}
                              className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Signal Content Area: OTP or Active Ranges */}
                    <div className="bg-[#050505] rounded-lg p-8 border border-zinc-800 relative overflow-hidden min-h-[300px] flex flex-col">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-16 -mt-16" />
                      
                      <AnimatePresence mode="wait">
                        {otp ? (
                          <motion.div 
                            key="otp-display"
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="flex-1 flex flex-col items-center justify-center text-center"
                          >
                            <div className="w-20 h-20 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.1)]">
                              <CheckCircle2 className="w-10 h-10" />
                            </div>
                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em] block mb-4">Decrypted OTP Payload</span>
                            <div 
                              onClick={() => {
                                copyToClipboard(otp);
                                addLog(`Copied OTP: ${otp}`, "success");
                              }}
                              className="flex items-center gap-6 bg-zinc-900/50 p-6 rounded-xl border border-zinc-800 group cursor-pointer hover:bg-emerald-500/[0.03] hover:border-emerald-500/30 transition-all"
                            >
                              <span className="text-7xl font-black text-white tracking-[-0.05em] tabular-nums drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]">{otp}</span>
                              <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-lg border border-emerald-500/20 group-hover:bg-emerald-500/20 transition-all">
                                <Copy className="w-6 h-6" />
                              </div>
                            </div>
                          </motion.div>
                        ) : (
                          <motion.div 
                            key="idle-display"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex-1 flex flex-col items-center justify-center text-center"
                          >
                            <div className="w-20 h-20 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center mb-6 shadow-inner">
                              <Smartphone className="text-zinc-700 w-8 h-8" />
                            </div>
                            <h3 className="text-sm font-black text-white uppercase tracking-[0.3em] mb-2">OWNER Fahdii🤍</h3>
                            <p className="text-zinc-500 text-[10px] uppercase tracking-widest max-w-xs leading-relaxed">System ready for signal acquisition. Initialize module to begin reception.</p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      
                      <div className="mt-8 pt-6 border-t border-zinc-800/50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <ShieldCheck className="w-4 h-4 text-emerald-500/40" />
                          <span className="text-[9px] text-zinc-600 uppercase font-black tracking-widest">Active Signal Interception</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                          <span className="text-[9px] text-zinc-700 font-black tracking-widest uppercase">OWNER: Fahdii🤍</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <button 
                        onClick={autoCycleNumber}
                        disabled={loading}
                        className="flex-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white font-bold py-4 rounded transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-[10px]"
                      >
                        <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                        Auto Cycle
                      </button>
                      <button 
                        onClick={() => getNumber()}
                        disabled={loading}
                        className="flex-1 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 text-emerald-500 font-bold py-4 rounded transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-[10px]"
                      >
                        <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                        Manual Range
                      </button>
                      <button 
                        onClick={() => {
                          addLog("Signal session terminated by operator", "warn");
                          setActiveNumber(null);
                          setIsPolling(false);
                          localStorage.removeItem("activeNumber");
                        }}
                        className="px-8 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 text-red-500 font-bold py-4 rounded transition-all uppercase tracking-widest text-[10px]"
                      >
                        Release
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <div className="py-12 flex flex-col items-center justify-center text-center border border-dashed border-zinc-800 rounded-lg bg-zinc-900/10">
                    <div className="w-16 h-16 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center mb-6 shadow-inner">
                      <Smartphone className="text-zinc-700 w-8 h-8" />
                    </div>
                    <h3 className="text-sm font-black text-white uppercase tracking-[0.3em] mb-2">Module Idle</h3>
                    <p className="text-zinc-500 text-[10px] uppercase tracking-widest max-w-xs leading-relaxed">System ready for signal acquisition. Initialize module to begin reception.</p>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </section>

          {/* Signal Logs Table */}
          <section className="bg-[#0a0a0a] border border-zinc-800 rounded-lg overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-zinc-900 flex items-center justify-between bg-zinc-900/20">
              <div className="flex items-center gap-3">
                <History className="w-4 h-4 text-emerald-500" />
                <h2 className="text-[10px] font-black text-white uppercase tracking-[0.3em]">Signal History Log</h2>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded px-2 py-1 gap-2">
                  <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">Date:</span>
                  <input 
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-transparent border-none text-[10px] text-emerald-500 font-bold focus:outline-none uppercase"
                  />
                </div>
              <div className="flex items-center gap-4">
                {history.length > 0 && (
                  <button
                    onClick={() => {
                      const content = history.map(h => 
                        `Number: ${h.phone_number}\nOTP: ${h.otps || 'Pending'}\nCreated: ${h.created_at}\n-------------------`
                      ).join('\n\n');
                      const blob = new Blob([content], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `sms_history_${new Date().toISOString().split('T')[0]}.txt`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                      addLog("History downloaded as .txt file", "success");
                    }}
                    className="text-[9px] font-black text-zinc-500 hover:text-emerald-500 uppercase tracking-widest flex items-center gap-2 transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    Download History
                  </button>
                )}
                <button 
                  onClick={async () => {
                  setLoading(true);
                  addLog("Refreshing history log...", "info");
                  try {
                    const res = await axios.get("/api/get-history", { 
                      params: { phpSessId, limit: 50, date: selectedDate } 
                    });
                    
                    // Sync server time offset
                    const serverDateHeader = res.headers['x-server-date'] || res.headers.date;
                    if (serverDateHeader) {
                      const serverTime = new Date(serverDateHeader).getTime();
                      const localTime = Date.now();
                      setServerOffset(serverTime - localTime);
                    }

                    if (res.data.status === "success") {
                      setHistory(res.data.data);
                      addLog("History log updated", "success");
                    }
                  } finally { setLoading(false); }
                }}
                className="text-[9px] font-black text-zinc-500 hover:text-emerald-500 uppercase tracking-widest flex items-center gap-2 transition-colors"
              >
                <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
                Sync
              </button>
            </div>
          </div>
        </div>

            {/* Signal Summary Card */}
            <div className="p-6 bg-zinc-900/10 border-b border-zinc-900">
              <div className="bg-zinc-900/30 border border-zinc-800 p-4 rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest block mb-1">Last Signal Status</span>
                  {history.length > 0 ? (
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-black text-white tabular-nums">{history[0].phone_number}</span>
                      <span className={cn("text-[8px] font-black uppercase px-1.5 py-0.5 rounded border", 
                        getStatus(history[0].created_at).label === "Active" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" : "bg-red-500/10 border-red-500/20 text-red-500"
                      )}>
                        {getStatus(history[0].created_at).label}
                      </span>
                    </div>
                  ) : (
                    <p className="text-[10px] text-zinc-700 uppercase font-black tracking-widest">No Signal</p>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest block mb-1">OWNER</span>
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Fahdii🤍</p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-900/50 text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] border-b border-zinc-900">
                    <th className="px-6 py-4">Frequency</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Payload</th>
                    <th className="px-6 py-4">Raw Data</th>
                    <th className="px-6 py-4 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {history.length > 0 ? (
                    history.map((item, idx) => {
                      const status = getStatus(item.created_at);
                      return (
                        <tr key={idx} className="hover:bg-emerald-500/[0.02] transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <span className={cn("text-[7px] font-black uppercase px-1 rounded border", 
                                  status.label === "Active" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" : "bg-red-500/10 border-red-500/20 text-red-500"
                                )}>
                                  {status.label}
                                </span>
                                {status.time && (
                                  <span className="text-[7px] text-zinc-600 font-mono tabular-nums">{status.time}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-black text-zinc-300 text-xs tabular-nums">{item.phone_number}</span>
                                <button 
                                  onClick={() => copyToClipboard(item.phone_number)}
                                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-800 rounded text-zinc-600 hover:text-emerald-500 transition-all"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className={cn("text-[9px] font-black uppercase tracking-widest", status.color)}>
                                {status.label}
                              </span>
                              {status.time && (
                                <span className="text-[8px] text-zinc-600 font-mono tabular-nums">
                                  EXP: {status.time}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {item.otps && item.otps !== "null" ? (
                              <button 
                                onClick={() => {
                                  copyToClipboard(item.otps);
                                  addLog(`Copied OTP from history: ${item.otps}`, "success");
                                }}
                                className="bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded text-[10px] font-black border border-emerald-500/20 tabular-nums hover:bg-emerald-500/20 transition-all cursor-pointer"
                              >
                                {item.otps}
                              </button>
                            ) : (
                              <span className="text-zinc-700 text-[10px] uppercase font-bold tracking-widest">Empty</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-[10px] text-zinc-500 max-w-[200px] truncate font-medium" title={item.full_sms_list}>
                              {item.full_sms_list || "---"}
                            </p>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="text-[10px] text-zinc-700 font-bold tabular-nums">{item.created_at}</span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-zinc-700 text-[10px] uppercase font-black tracking-[0.3em]">
                        No records found in buffer
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>

        {/* Right Column: System Console & Diagnostics */}
        <aside className="lg:col-span-4 space-y-6">
          {/* System Console */}
          <section className="bg-[#0a0a0a] border border-zinc-800 rounded-lg overflow-hidden shadow-2xl flex flex-col h-[500px]">
            <div className="p-4 border-b border-zinc-900 bg-zinc-900/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <h2 className="text-[10px] font-black text-white uppercase tracking-[0.3em]">System Console</h2>
              </div>
              <span className="text-[8px] text-zinc-600 font-bold uppercase tracking-widest">Live Stream</span>
            </div>
            <div className="flex-1 p-4 overflow-y-auto font-mono text-[10px] space-y-2 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
              {logs.map((log, i) => (
                <div key={i} className="flex gap-3 leading-relaxed group">
                  <span className="text-zinc-700 shrink-0">[{log.time}]</span>
                  <span className={cn(
                    "flex-1",
                    log.type === 'error' && "text-red-500",
                    log.type === 'success' && "text-emerald-500",
                    log.type === 'warn' && "text-yellow-500",
                    log.type === 'info' && "text-zinc-400"
                  )}>
                    <span className="font-bold mr-2">{log.type.toUpperCase()}:</span>
                    {log.msg}
                  </span>
                </div>
              ))}
              {logs.length === 0 && (
                <div className="text-zinc-800 italic">Console initialized. Awaiting system events...</div>
              )}
            </div>
            <div className="p-3 border-t border-zinc-900 bg-zinc-900/10 flex justify-between items-center">
              <span className="text-[8px] text-zinc-700 uppercase tracking-widest">Kernel: v4.2.0-mknet</span>
              <button 
                onClick={() => setLogs([])}
                className="text-[8px] text-zinc-600 hover:text-zinc-400 uppercase tracking-widest font-bold"
              >
                Clear Buffer
              </button>
            </div>
          </section>

          {/* System Diagnostics */}
          <section className="bg-[#0a0a0a] border border-zinc-800 rounded-lg p-6 shadow-2xl space-y-6">
            <h3 className="text-[10px] font-black text-white uppercase tracking-[0.3em] mb-4 flex items-center gap-2">
              <ShieldCheck className="w-3 h-3 text-emerald-500" />
              Diagnostics
            </h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-[9px] uppercase font-black tracking-widest">
                  <span className="text-zinc-600">CPU Load</span>
                  <span className="text-emerald-500">12.4%</span>
                </div>
                <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 w-[12.4%] shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-[9px] uppercase font-black tracking-widest">
                  <span className="text-zinc-600">Memory Usage</span>
                  <span className="text-emerald-500">442MB</span>
                </div>
                <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 w-[35%] shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                </div>
              </div>
              <div className="pt-4 space-y-3">
                <div className="flex items-center justify-between text-[9px] uppercase font-black tracking-widest">
                  <span className="text-zinc-600">Network Latency</span>
                  <span className="text-emerald-500">24ms</span>
                </div>
                <div className="flex items-center justify-between text-[9px] uppercase font-black tracking-widest">
                  <span className="text-zinc-600">Session Integrity</span>
                  <span className="text-emerald-500">Verified</span>
                </div>
                <div className="flex items-center justify-between text-[9px] uppercase font-black tracking-widest">
                  <span className="text-zinc-600">Uptime</span>
                  <span className="text-zinc-400">04:22:18</span>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <footer className="max-w-[1400px] mx-auto px-6 py-10 border-t border-zinc-900 mt-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 bg-zinc-900 border border-zinc-800 rounded flex items-center justify-center">
              <ShieldCheck className="text-zinc-700 w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.4em] block">MK-NET OPS TERMINAL</span>
              <span className="text-[8px] text-zinc-800 uppercase tracking-widest">Secure Virtual Infrastructure // BD Region</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={async () => {
                try {
                  const response = await fetch('/src/App.tsx');
                  const text = await response.text();
                  const blob = new Blob([text], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'App.tsx';
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  addLog("Source code (App.tsx) downloaded", "success");
                } catch (err) {
                  addLog("Failed to download source code", "error");
                }
              }}
              className="text-[9px] font-black text-zinc-600 hover:text-emerald-500 uppercase tracking-widest flex items-center gap-2 transition-colors"
            >
              <Download className="w-3 h-3" />
              Download App.tsx
            </button>
            <p className="text-[9px] text-zinc-800 font-bold uppercase tracking-[0.2em]">© 2026 MK Network BD. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
