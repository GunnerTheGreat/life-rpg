import React, { useState, useEffect } from 'react';
import { Shield, Zap, Bell, Plus, Star, Repeat, LayoutDashboard, PenTool, CheckCircle, Calendar, Clock, ChevronRight, LogOut, Trash2, User, RotateCcw, Settings, Moon, Sun, Monitor, Sword, Loader2 } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const THEMES = {
  light: {
    id: 'light', name: 'Day Mode', 
    bg: 'bg-gray-50', card: 'bg-white', text: 'text-gray-800', subtext: 'text-gray-500', 
    border: 'border-gray-200', input: 'bg-white border-gray-200', hover: 'hover:bg-gray-50', button: 'bg-black text-white hover:bg-gray-800', activeTab: 'bg-blue-600 text-white'
  },
  dark: {
    id: 'dark', name: 'Dark Mode', 
    bg: 'bg-gray-900', card: 'bg-gray-800', text: 'text-white', subtext: 'text-gray-400', 
    border: 'border-gray-700', input: 'bg-gray-700 border-gray-600 text-white', hover: 'hover:bg-gray-700', button: 'bg-blue-600 text-white hover:bg-blue-700', activeTab: 'bg-blue-500 text-white'
  },
  midnight: {
    id: 'midnight', name: 'Midnight', 
    bg: 'bg-slate-900', card: 'bg-slate-800', text: 'text-blue-50', subtext: 'text-slate-400', 
    border: 'border-slate-700', input: 'bg-slate-700 border-slate-600 text-white', hover: 'hover:bg-slate-700', button: 'bg-cyan-600 text-white hover:bg-cyan-700', activeTab: 'bg-cyan-500 text-white'
  }
};

const LifeRPG = () => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [stats, setStats] = useState({ level: 1, coins: 0, hp: 1000, maxHp: 1000, exp: 0, maxExp: 1000 });
  const [quests, setQuests] = useState([]);
  const [logs, setLogs] = useState([{ id: 1, text: "System Initialized.", type: "gain", time: "Now" }]);
  const [authToken, setAuthToken] = useState(null);
  const [userEmail, setUserEmail] = useState(null);
  const [ign, setIgn] = useState("Adventurer");
  const [showIgnModal, setShowIgnModal] = useState(false);
  const [newIgnInput, setNewIgnInput] = useState("");
  const [theme, setTheme] = useState(THEMES.light);  
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [newTask, setNewTask] = useState(""); 
  const [questType, setQuestType] = useState("side"); 
  const [deadline, setDeadline] = useState(""); 
  const [timeFrame, setTimeFrame] = useState("09:00"); 
  const [routineDays, setRoutineDays] = useState("");

  let cleanedQuests = quests.filter((q, index, self) =>
    index === self.findIndex((t) => (
      t.task === q.task && new Date(t.time).getTime() === new Date(q.time).getTime()
    ))
  );
  cleanedQuests.sort((a, b) => new Date(a.time) - new Date(b.time));

  const isToday = (dateString) => {
      const d = new Date(dateString);
      const today = new Date();
      return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  };

  const getProgress = (type) => {
      const typeQuests = cleanedQuests.filter(q => q.type === type && (isToday(q.time) || !q.completed));
      const total = typeQuests.length;
      if (total === 0) return 0;
      const completed = typeQuests.filter(q => q.completed).length;
      return (completed / total) * 100;
  };

  const routineProgress = getProgress('routine');
  const mainProgress = getProgress('main');
  const sideProgress = getProgress('side');

  const filterList = (type) => cleanedQuests.filter(q => q.type === type && (!q.completed || isToday(q.time)));
  const routineQuests = filterList('routine');
  const mainQuests = filterList('main');
  const sideQuests = filterList('side');

  useEffect(() => {
    const restoreSession = async () => {
        const savedToken = localStorage.getItem('googleAuthToken');
        const savedEmail = localStorage.getItem('userEmail');
        const savedTheme = localStorage.getItem('appTheme');
        if (savedTheme && THEMES[savedTheme]) setTheme(THEMES[savedTheme]);

        if (savedToken && savedEmail) {
            setLoadingMessage("Restoring Session...");
            setIsLoading(true);
            try {
                const res = await axios.post(`${API_URL}/api/user/login`, { email: savedEmail });
                if (res.data.exists) {
                    setAuthToken(savedToken);
                    setUserEmail(savedEmail);
                    setStats(res.data.user.stats);
                    setIgn(res.data.user.ign);
                    addLog(`Welcome back, ${res.data.user.ign}!`, "gain");
                    fetchCalendar(savedToken);
                } else logout();
            } catch (err) { 
                console.error("Restore failed");
            } finally {
                setIsLoading(false);
            }
        }
    };
    restoreSession();
  }, []);

  const changeTheme = (themeKey) => {
      setTheme(THEMES[themeKey]);
      localStorage.setItem('appTheme', themeKey);
  };

  const saveStats = async (newStats) => {
    setStats(newStats); 
    if (userEmail) {
        try { await axios.post(`${API_URL}/api/user/update`, { email: userEmail, stats: newStats }); } catch (err) {}
    }
  };

  const login = useGoogleLogin({
    onSuccess: async (res) => {
      setIsLoading(true);
      setLoadingMessage("Connecting to Server...");
      const token = res.access_token;
      
      try {
          const googleUser = await axios.get('https://www.googleapis.com/oauth2/v1/userinfo', { headers: { Authorization: `Bearer ${token}` } });
          const email = googleUser.data.email;
          localStorage.setItem('googleAuthToken', token);
          localStorage.setItem('userEmail', email);
          setUserEmail(email);

          const dbCheck = await axios.post(`${API_URL}/api/user/login`, { email });
          if (dbCheck.data.exists) {
              setStats(dbCheck.data.user.stats);
              setIgn(dbCheck.data.user.ign);
              setAuthToken(token); 
              fetchCalendar(token);
              addLog(`Welcome back, ${dbCheck.data.user.ign}!`, "gain");
          } else {
              setAuthToken(token); 
              setShowIgnModal(true);
          }
      } catch (err) { 
          alert(`Login Failed: ${err.message}. Please try again.`);
      } finally {
          setIsLoading(false);
      }
    },
    onError: () => { alert("Google Login Failed."); setIsLoading(false); },
    scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email'
  });

  const handleIgnSubmit = async () => {
      if (!newIgnInput) return alert("Please enter a name!");
      setIsLoading(true);
      try {
          const res = await axios.post(`${API_URL}/api/user/signup`, { email: userEmail, ign: newIgnInput });
          if (res.data.success) {
              setStats(res.data.user.stats);
              setIgn(res.data.user.ign);
              setShowIgnModal(false); 
              fetchCalendar(authToken); 
              addLog(`Character Created: ${newIgnInput}`, "gain");
          }
      } catch (err) { alert("Failed to create character"); }
      finally { setIsLoading(false); }
  };

  const logout = () => {
      localStorage.removeItem('googleAuthToken');
      localStorage.removeItem('userEmail');
      setAuthToken(null);
      setUserEmail(null);
      setQuests([]);
      setStats({ level: 1, coins: 0, hp: 1000, maxHp: 1000, exp: 0, maxExp: 1000 });
      setIgn("Adventurer");
  };

  const fetchCalendar = async (token) => {
    try {
      const res = await axios.post(`${API_URL}/api/sync-calendar`, { token });
      if(res.data.success) setQuests(res.data.events); 
    } catch (err) { if (err.response && err.response.status === 500) logout(); }
  };

  const addQuest = async () => {
    if (!newTask || !authToken) return;
    let finalDeadline = deadline;
    if (questType === 'routine') {
        const date = new Date();
        const [hours, minutes] = timeFrame.split(':');
        date.setHours(hours, minutes, 0, 0);
        finalDeadline = date.toISOString();
    } 
    try {
      await axios.post(`${API_URL}/api/add-quest`, { token: authToken, task: newTask, type: questType, deadline: finalDeadline, days: routineDays });
      setTimeout(() => fetchCalendar(authToken), 1000);
      setNewTask("");
      setRoutineDays("");
      setActiveTab("dashboard"); 
    } catch (err) { alert("Failed to save quest"); }
  };

  const toggleQuest = async (q) => {
      const isUndoing = q.completed;
      setQuests(prev => prev.map(item => item.id === q.id ? { ...item, completed: !isUndoing } : item));
      let xpGain = q.type === 'main' ? 200 : q.type === 'routine' ? 30 : 50;
      let coinGain = q.type === 'main' ? 100 : 20;
      const multiplier = isUndoing ? -1 : 1;
      const newStats = { ...stats, exp: Math.max(0, stats.exp + (xpGain * multiplier)), coins: Math.max(0, stats.coins + (coinGain * multiplier)) };
      if (!isUndoing && newStats.exp >= newStats.maxExp) {
          newStats.level += 1; newStats.exp -= newStats.maxExp; newStats.maxExp = Math.round(newStats.maxExp * 1.2); newStats.hp = newStats.maxHp; 
          addLog(`LEVEL UP! You are now Level ${newStats.level}`, "gain");
      }
      saveStats(newStats); 
      addLog(`${isUndoing ? 'Undid' : 'Completed'} ${q.type} quest! ${isUndoing ? '-' : '+'}${xpGain} XP`, isUndoing ? 'loss' : 'gain');
      if (authToken) {
          try {
              if (isUndoing) await axios.post(`${API_URL}/api/uncomplete-quest`, { token: authToken, eventId: q.id, task: q.task });
              else await axios.post(`${API_URL}/api/complete-quest`, { token: authToken, eventId: q.id, task: q.task });
          } catch (err) {}
      }
  };

  const deleteQuest = async (id, type) => {
      setQuests(prev => prev.filter(q => q.id !== id));
      addLog(`Deleted ${type} quest.`, 'loss');
      if (authToken) { try { await axios.post(`${API_URL}/api/delete-quest`, { token: authToken, eventId: id, type: type }); } catch (err) {} }
  };

  const sendReminder = async (quest) => {
    const userEmail = "gunned25845@gmail.com"; 
    try { await axios.post(`${API_URL}/api/send-reminder`, { email: userEmail, task: quest.task }); alert("Email sent!"); } catch (e) { alert("Email failed"); }
  };

  const addLog = (text, type) => { setLogs(prev => [{ id: Date.now(), text, type, time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) }, ...prev]); };

  const QuestItem = ({ q }) => (
    <div className={`flex items-center justify-between p-4 rounded-xl shadow-sm mb-3 border-l-4 transition-all hover:translate-x-1 ${theme.card} ${theme.border} ${
        q.type === 'main' ? 'border-l-yellow-500' : q.type === 'routine' ? 'border-l-blue-400' : 'border-l-gray-300'
    } ${q.completed ? 'opacity-60' : ''}`}>
        <div className="flex items-center gap-3">
            {q.type === 'main' && <Star className="text-yellow-500 fill-yellow-500" size={20}/>}
            {q.type === 'routine' && <Repeat className="text-blue-500" size={20}/>}
            {q.type === 'side' && <div className={`w-5 h-5 rounded-full border-2 ${theme.border}`}></div>}
            <div>
                <p className={`font-bold ${theme.text} ${q.completed ? 'line-through opacity-50' : ''}`}>{q.task}</p>
                <p className={`text-xs ${theme.subtext} font-bold tracking-wide uppercase mt-0.5 flex items-center gap-1`}>
                   <Clock size={10}/> {new Date(q.time).toLocaleDateString([], {weekday: 'short', month: 'short', day: 'numeric'})} • {new Date(q.time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                </p>
            </div>
        </div>
        <div className="flex gap-2">
            <button onClick={() => sendReminder(q)} className={`p-2 ${theme.subtext} hover:text-blue-500 rounded-lg`}><Bell size={18} /></button>
            <button onClick={() => deleteQuest(q.id, q.type)} className="p-2 text-red-300 hover:text-red-500 rounded-lg"><Trash2 size={18} /></button>
            <button onClick={() => toggleQuest(q)} className={`px-3 py-1.5 font-bold text-sm rounded-lg flex items-center gap-1 transition-all ${q.completed ? 'bg-gray-200 text-gray-600' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}>
                {q.completed ? <><RotateCcw size={14}/> Undo</> : <><CheckCircle size={14}/> Done</>}
            </button>
        </div>
    </div>
  );

  return (
    <div className={`min-h-screen ${theme.bg} ${theme.text} font-sans flex flex-col relative transition-colors duration-300`}>
      
      {showIgnModal && (
          <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4">
              <div className={`${theme.card} rounded-2xl p-8 max-w-md w-full shadow-2xl text-center`}>
                  <div className="mx-auto bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mb-4"><User size={32} className="text-blue-600"/></div>
                  <h2 className={`text-2xl font-bold mb-2 ${theme.text}`}>Welcome, Hero!</h2>
                  <p className={`${theme.subtext} mb-6`}>What shall we call you in this world?</p>
                  <input type="text" value={newIgnInput} onChange={(e) => setNewIgnInput(e.target.value)} placeholder="Enter your IGN..." className={`w-full p-4 border-2 rounded-xl text-lg font-bold text-center focus:outline-none focus:border-blue-500 mb-6 ${theme.input}`} autoFocus />
                  <button onClick={handleIgnSubmit} disabled={isLoading} className={`w-full py-4 rounded-xl font-bold text-lg transition flex justify-center items-center gap-2 ${theme.button}`}>
                    {isLoading ? <Loader2 className="animate-spin"/> : "Start Adventure"}
                  </button>
              </div>
          </div>
      )}

      {/*LOGIN SCREEN */}
      {!authToken ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
             <div className="mb-6 bg-blue-100 p-6 rounded-full inline-block animate-bounce"><Sword size={64} className="text-blue-600" /></div>
             <h1 className="text-5xl font-black mb-2 tracking-tight">LifeRPG</h1>
             <p className={`text-xl ${theme.subtext} mb-12 max-w-md`}>Gamify your life. Turn your daily tasks into epic quests.</p>
             <button onClick={() => login()} disabled={isLoading} className={`px-8 py-4 rounded-2xl font-bold text-lg flex items-center gap-3 shadow-lg transform hover:scale-105 transition-all ${theme.button} ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}>
                {isLoading ? <Loader2 className="animate-spin" size={24}/> : <Calendar size={24}/>}
                {isLoading ? loadingMessage || "Connecting..." : "Sync with Google Calendar"}
             </button>
             <div className={`mt-12 flex gap-8 ${theme.subtext} text-sm font-bold opacity-60`}>
                <div className="flex items-center gap-2"><CheckCircle size={16}/> Auto-Sync</div>
                <div className="flex items-center gap-2"><Shield size={16}/> Secure</div>
             </div>
        </div>
      ) : (
        /*DASHBOARD LAYOUT */
        <div className="flex flex-col md:flex-row h-screen">
          {/*DESKTOP SIDEBAR */}
          <div className={`w-full md:w-64 ${theme.card} border-r ${theme.border} flex flex-col justify-between hidden md:flex`}>
            <div>
                <div className={`p-6 flex items-center gap-3 font-bold text-xl border-b ${theme.border}`}><Shield className="text-blue-600"/> LifeRPG</div>
                <nav className="p-4 space-y-2">
                    <button onClick={() => setActiveTab("dashboard")} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${activeTab === 'dashboard' ? theme.activeTab : `${theme.subtext} ${theme.hover}`}`}><LayoutDashboard size={20}/> Dashboard</button>
                    <button onClick={() => setActiveTab("add")} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${activeTab === 'add' ? theme.activeTab : `${theme.subtext} ${theme.hover}`}`}><PenTool size={20}/> Quest Hub</button>
                    <button onClick={() => setActiveTab("settings")} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${activeTab === 'settings' ? theme.activeTab : `${theme.subtext} ${theme.hover}`}`}><Settings size={20}/> Settings</button>
                </nav>
            </div>
            <div className={`p-6 ${theme.bg} border-t ${theme.border}`}>
                <div className={`text-sm font-bold ${theme.text} mb-1 flex items-center gap-2`}><User size={14}/> {ign}</div>
                <div className={`text-xs font-bold ${theme.subtext} uppercase mb-2`}>Lvl {stats.level}</div>
                <div className="mb-3"><div className="flex justify-between text-xs font-bold mb-1"><span>HP ❤️</span><span>{stats.hp}</span></div><div className="w-full bg-gray-200 rounded-full h-1.5"><div className="bg-red-500 h-1.5 rounded-full" style={{ width: `${(stats.hp / stats.maxHp) * 100}%` }}></div></div></div>
                <div><div className="flex justify-between text-xs font-bold mb-1"><span>XP ⚡</span><span>{stats.exp} / {stats.maxExp}</span></div><div className="w-full bg-gray-200 rounded-full h-1.5"><div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${(stats.exp / stats.maxExp) * 100}%` }}></div></div></div>
            </div>
          </div>

          <div className="flex-1 flex flex-col h-screen overflow-hidden">
            <header className={`${theme.card} h-16 border-b ${theme.border} flex items-center justify-between px-6 shadow-sm z-10`}>
                <div className="md:hidden font-bold text-lg"><Shield className="inline mr-2 text-blue-600"/> LifeRPG</div>
                <div className="hidden md:block font-bold text-lg capitalize">{activeTab}</div>
                <button onClick={logout} className="text-sm bg-red-100 text-red-600 px-4 py-2 rounded-lg hover:bg-red-200 transition flex items-center gap-2"><LogOut size={16}/> Logout</button>
            </header>

            <div className="flex-1 overflow-y-auto p-6 pb-24 md:pb-6">
                {activeTab === 'dashboard' && (
                    <div className="max-w-4xl mx-auto">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                            <div className={`${theme.card} p-5 rounded-xl shadow-sm border border-blue-100`}>
                                <div className="flex justify-between text-sm font-bold text-blue-500 mb-2"><span>Routines</span><span>{Math.round(routineProgress)}%</span></div>
                                <div className="w-full bg-blue-100 rounded-full h-2 overflow-hidden"><div className="bg-blue-500 h-2 rounded-full transition-all duration-700" style={{ width: `${routineProgress}%` }}></div></div>
                            </div>
                            <div className={`${theme.card} p-5 rounded-xl shadow-sm border border-yellow-100`}>
                                <div className="flex justify-between text-sm font-bold text-yellow-500 mb-2"><span>Main Quests</span><span>{Math.round(mainProgress)}%</span></div>
                                <div className="w-full bg-yellow-100 rounded-full h-2 overflow-hidden"><div className="bg-yellow-500 h-2 rounded-full transition-all duration-700" style={{ width: `${mainProgress}%` }}></div></div>
                            </div>
                            <div className={`${theme.card} p-5 rounded-xl shadow-sm border border-gray-100`}>
                                <div className="flex justify-between text-sm font-bold text-gray-500 mb-2"><span>Side Quests</span><span>{Math.round(sideProgress)}%</span></div>
                                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden"><div className="bg-gray-400 h-2 rounded-full transition-all duration-700" style={{ width: `${sideProgress}%` }}></div></div>
                            </div>
                        </div>
                        {routineQuests.length > 0 && <div className="mb-8"><h3 className={`font-bold ${theme.subtext} uppercase tracking-wider text-sm mb-3 flex items-center gap-2`}><Repeat size={16}/> Daily Routines</h3>{routineQuests.map(q => <QuestItem key={q.id} q={q} />)}</div>}
                        {mainQuests.length > 0 && <div className="mb-8"><h3 className={`font-bold ${theme.subtext} uppercase tracking-wider text-sm mb-3 flex items-center gap-2`}><Star size={16}/> Main Quests</h3>{mainQuests.map(q => <QuestItem key={q.id} q={q} />)}</div>}
                        {sideQuests.length > 0 && <div className="mb-8"><h3 className={`font-bold ${theme.subtext} uppercase tracking-wider text-sm mb-3 flex items-center gap-2`}><ChevronRight size={16}/> Side Quests</h3>{sideQuests.map(q => <QuestItem key={q.id} q={q} />)}</div>}
                        {cleanedQuests.length === 0 && <div className={`text-center py-10 ${theme.subtext}`}>No active quests. Sync Google or Add one!</div>}
                    </div>
                )}

                {activeTab === 'add' && (
                    <div className="max-w-2xl mx-auto">
                        <div className={`${theme.card} p-8 rounded-xl shadow-sm border ${theme.border}`}>
                            <h2 className={`text-2xl font-bold mb-6 flex items-center gap-2 ${theme.text}`}><PenTool/> Create New Quest</h2>
                            <div className="space-y-6">
                                <div><label className={`block text-sm font-bold mb-2 ${theme.subtext}`}>Quest Name</label><input type="text" value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="e.g. Morning Jog" className={`w-full p-4 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 ${theme.input}`}/></div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div><label className={`block text-sm font-bold mb-2 ${theme.subtext}`}>Quest Type</label><select value={questType} onChange={(e) => setQuestType(e.target.value)} className={`w-full p-4 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 ${theme.input}`}><option value="side">Side Quest (50 XP)</option><option value="main">Main Quest (200 XP)</option><option value="routine">Routine (Daily / 30 XP)</option></select></div>
                                    <div>
                                        {questType === 'routine' ? (
                                            <>
                                                <label className={`block text-sm font-bold mb-2 ${theme.subtext}`}>Target Time</label>
                                                <div className="relative">
                                                    <select value={timeFrame} onChange={(e) => setTimeFrame(e.target.value)} className={`w-full p-4 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none font-bold ${theme.input}`}>
                                                        {(() => { const t=[]; for(let i=0;i<24;i++) for(let j=0;j<60;j+=30) t.push(<option key={`${i}:${j}`} value={`${i.toString().padStart(2,'0')}:${j===0?'00':'30'}`}>{`${i%12||12}:${j===0?'00':'30'} ${i>=12?'PM':'AM'}`}</option>); return t; })()}
                                                    </select>
                                                    <Clock className="absolute right-4 top-4 text-blue-400" size={20}/>
                                                </div>
                                                <label className={`block text-sm font-bold mt-4 mb-2 ${theme.subtext}`}>Duration (Days)</label>
                                                <input type="number" value={routineDays} onChange={(e) => setRoutineDays(e.target.value)} placeholder="e.g. 30" className={`w-full p-4 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 ${theme.input}`}/>
                                            </>
                                        ) : (
                                            <>
                                                <label className={`block text-sm font-bold mb-2 ${theme.subtext}`}>Deadline</label>
                                                <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={`w-full p-4 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 ${theme.input}`}/>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <button onClick={addQuest} className={`w-full py-4 rounded-xl font-bold text-lg transition flex items-center justify-center gap-2 mt-4 ${theme.button}`}><Plus size={24}/> Initialize Quest</button>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'settings' && (
                    <div className="max-w-2xl mx-auto">
                        <div className={`${theme.card} p-8 rounded-xl shadow-sm border ${theme.border}`}>
                            <h2 className={`text-2xl font-bold mb-6 flex items-center gap-2 ${theme.text}`}><Settings/> Settings</h2>
                            <h3 className={`font-bold uppercase tracking-wider text-sm mb-4 ${theme.subtext}`}>Visual Theme</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <button onClick={() => changeTheme('light')} className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${theme.id === 'light' ? 'border-blue-500 bg-blue-50' : `border-gray-200 ${theme.hover}`}`}><Sun size={24} className="text-orange-500"/><span className="font-bold text-gray-800">Day Mode</span></button>
                                <button onClick={() => changeTheme('dark')} className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${theme.id === 'dark' ? 'border-blue-500 bg-gray-700' : 'border-gray-600 bg-gray-800'}`}><Moon size={24} className="text-purple-400"/><span className="font-bold text-white">Dark Mode</span></button>
                                <button onClick={() => changeTheme('midnight')} className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${theme.id === 'midnight' ? 'border-blue-500 bg-slate-700' : 'border-slate-700 bg-slate-900'}`}><Monitor size={24} className="text-cyan-400"/><span className="font-bold text-blue-100">Midnight</span></button>
                            </div>
                            <h3 className={`font-bold uppercase tracking-wider text-sm mt-8 mb-4 ${theme.subtext}`}>Account</h3>
                            <div className={`p-4 rounded-xl ${theme.bg} border ${theme.border} flex items-center justify-between`}>
                                <div><div className={`font-bold ${theme.text}`}>{ign}</div><div className={`text-sm ${theme.subtext}`}>{userEmail}</div></div>
                                <button onClick={logout} className="text-sm bg-red-100 text-red-600 px-4 py-2 rounded-lg hover:bg-red-200 font-bold">Log Out</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* MOBILE BOTTOM NAVIGATION */}
            <div className={`fixed bottom-0 left-0 right-0 h-20 ${theme.card} border-t ${theme.border} flex justify-around items-center z-50 md:hidden`}>
                <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center gap-1 ${activeTab === 'dashboard' ? 'text-blue-500 font-bold' : theme.subtext}`}>
                    <LayoutDashboard size={24} />
                    <span className="text-xs">Dashboard</span>
                </button>
                <button onClick={() => setActiveTab('add')} className={`flex flex-col items-center gap-1 ${activeTab === 'add' ? 'text-blue-500 font-bold' : theme.subtext}`}>
                    <div className="bg-blue-600 text-white p-3 rounded-full -mt-6 shadow-lg border-4 border-white"><Plus size={24} /></div>
                </button>
                <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center gap-1 ${activeTab === 'settings' ? 'text-blue-500 font-bold' : theme.subtext}`}>
                    <Settings size={24} />
                    <span className="text-xs">Settings</span>
                </button>
            </div>
          </div>

          <div className={`w-64 ${theme.card} border-l ${theme.border} hidden xl:block p-4 overflow-y-auto`}>
            <h3 className={`font-bold mb-4 flex items-center gap-2 text-sm uppercase tracking-wider ${theme.subtext}`}><Zap size={16}/> Activity Log</h3>
            <div className="space-y-4">{logs.map(log => (<div key={log.id} className={`text-sm border-b pb-3 ${theme.border}`}><span className={`font-bold block ${theme.text}`}>{log.text}</span><span className={`text-xs ${theme.subtext}`}>{log.time}</span></div>))}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LifeRPG;