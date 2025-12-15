import React, { useState, useEffect } from 'react';
import { Shield, Zap, Bell, Plus, Star, Repeat, LayoutDashboard, PenTool, CheckCircle, Calendar, Clock, ChevronRight, LogOut, Trash2 } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';
import axios from 'axios';

// 🌎 AUTOMATIC URL SWITCHER
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const LifeRPG = () => {
  // --- STATE ---
  const [activeTab, setActiveTab] = useState("dashboard");
  const [stats, setStats] = useState({ level: 1, coins: 0, hp: 1000, maxHp: 1000, exp: 0, maxExp: 1000 });
  const [quests, setQuests] = useState([]);
  const [logs, setLogs] = useState([{ id: 1, text: "System Initialized.", type: "gain", time: "Now" }]);
  const [authToken, setAuthToken] = useState(null);

  // FORM INPUTS
  const [newTask, setNewTask] = useState(""); 
  const [questType, setQuestType] = useState("side"); 
  const [deadline, setDeadline] = useState(""); 
  const [timeFrame, setTimeFrame] = useState("09:00"); 
  const [routineDays, setRoutineDays] = useState("");

  // 🛡️ FRONTEND DEDUPLICATION (The Final Guard)
  // This removes duplicate quests if they have the same Name AND Time.
  const cleanedQuests = quests.filter((q, index, self) =>
    index === self.findIndex((t) => (
      t.task === q.task && new Date(t.time).getTime() === new Date(q.time).getTime()
    ))
  );

  // --- MATH (Uses cleaned list) ---
  const completedCount = cleanedQuests.filter(q => q.completed).length;
  const progressPercent = cleanedQuests.length > 0 ? (completedCount / cleanedQuests.length) * 100 : 0;

  // --- VISUAL FILTERS (Uses cleaned list) ---
  const routineQuests = cleanedQuests.filter(q => q.type === 'routine' && !q.completed);
  const mainQuests = cleanedQuests.filter(q => q.type === 'main' && !q.completed);
  const sideQuests = cleanedQuests.filter(q => q.type === 'side' && !q.completed);

  const generateTimeOptions = () => {
    const times = [];
    for (let i = 0; i < 24; i++) {
        for (let j = 0; j < 60; j += 30) {
            const hour = i;
            const minute = j === 0 ? "00" : "30";
            const ampm = hour >= 12 ? "PM" : "AM";
            const displayHour = hour % 12 || 12;
            times.push({ value: `${hour.toString().padStart(2, '0')}:${minute}`, label: `${displayHour}:${minute} ${ampm}` });
        }
    }
    return times;
  };
  const timeOptions = generateTimeOptions();

  // --- LOAD GAME ---
  useEffect(() => {
    const loadGame = async () => {
        try {
            const res = await axios.get(`${API_URL}/api/user`);
            if (res.data) setStats(res.data);
        } catch (err) {}

        const savedToken = localStorage.getItem('googleAuthToken');
        if (savedToken) {
            setAuthToken(savedToken);
            addLog("Restoring Session...", "gain");
            fetchCalendar(savedToken); 
        }
    };
    loadGame();
  }, []);

  const saveStats = async (newStats) => {
    setStats(newStats); 
    try { await axios.post(`${API_URL}/api/user/update`, { stats: newStats }); } catch (err) {}
  };

  const login = useGoogleLogin({
    onSuccess: async (res) => {
      localStorage.setItem('googleAuthToken', res.access_token);
      setAuthToken(res.access_token);
      fetchCalendar(res.access_token);
      addLog("Google Calendar Synced", "gain");
    },
    scope: 'https://www.googleapis.com/auth/calendar.events'
  });

  const logout = () => {
      localStorage.removeItem('googleAuthToken');
      setAuthToken(null);
      setQuests([]);
      addLog("Logged out.", "loss");
  };

  const fetchCalendar = async (token) => {
    try {
      const res = await axios.post(`${API_URL}/api/sync-calendar`, { token });
      if(res.data.success) {
        setQuests(res.data.events); 
        if(!authToken) addLog("Auto-Sync Complete!", "gain");
      }
    } catch (err) { 
        if (err.response && err.response.status === 500) {
            localStorage.removeItem('googleAuthToken');
            setAuthToken(null);
        }
    }
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
      await axios.post(`${API_URL}/api/add-quest`, {
        token: authToken, task: newTask, type: questType, deadline: finalDeadline, days: routineDays
      });
      setTimeout(() => fetchCalendar(authToken), 1000);
      setNewTask("");
      setRoutineDays("");
      setActiveTab("dashboard"); 
    } catch (err) { alert("Failed to save quest"); }
  };

  const completeQuest = async (id, taskName, type) => {
    // Optimistic Update
    setQuests(prev => prev.map(q => q.id === id ? { ...q, completed: true } : q));
    
    let xpGain = type === 'main' ? 200 : type === 'routine' ? 30 : 50;
    let coinGain = type === 'main' ? 100 : 20;

    const newStats = { ...stats, exp: stats.exp + xpGain, coins: stats.coins + coinGain };

    if (newStats.exp >= newStats.maxExp) {
        newStats.level += 1;
        newStats.exp = newStats.exp - newStats.maxExp;
        newStats.maxExp = Math.round(newStats.maxExp * 1.2); 
        newStats.hp = newStats.maxHp; 
        addLog(`LEVEL UP! You are now Level ${newStats.level}`, "gain");
    }

    saveStats(newStats); 
    addLog(`Completed ${type} quest! +${xpGain} XP`, 'gain');

    if (authToken) {
        try {
            await axios.post(`${API_URL}/api/complete-quest`, {
                token: authToken, eventId: id, task: taskName
            });
        } catch (err) {}
    }
  };

  const deleteQuest = async (id, type) => {
      setQuests(prev => prev.filter(q => q.id !== id));
      addLog(`Deleted ${type} quest.`, 'loss');
      if (authToken) {
          try {
              await axios.post(`${API_URL}/api/delete-quest`, {
                  token: authToken, eventId: id, type: type
              });
          } catch (err) { console.error("Failed to delete", err); }
      }
  };

  const sendReminder = async (quest) => {
    const userEmail = "gunned25845@gmail.com"; 
    try {
        await axios.post(`${API_URL}/api/send-reminder`, { email: userEmail, task: quest.task });
        alert("Email sent!");
    } catch (e) { alert("Email failed"); }
  };

  const addLog = (text, type) => { setLogs(prev => [{ id: Date.now(), text, type, time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) }, ...prev]); };

  const QuestItem = ({ q }) => (
    <div className={`flex items-center justify-between p-4 rounded-xl shadow-sm bg-white mb-3 border-l-4 transition-all hover:translate-x-1 ${
        q.type === 'main' ? 'border-yellow-500' : q.type === 'routine' ? 'border-blue-400' : 'border-gray-300'
    }`}>
        <div className="flex items-center gap-3">
            {q.type === 'main' && <Star className="text-yellow-500 fill-yellow-500" size={20}/>}
            {q.type === 'routine' && <Repeat className="text-blue-500" size={20}/>}
            {q.type === 'side' && <div className="w-5 h-5 rounded-full border-2 border-gray-300"></div>}
            
            <div>
                <p className="font-bold text-gray-800">{q.task}</p>
                <p className="text-xs text-gray-400 font-bold tracking-wide uppercase mt-0.5 flex items-center gap-1">
                   <Clock size={10}/> {new Date(q.time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                </p>
            </div>
        </div>
        <div className="flex gap-2">
            <button onClick={() => sendReminder(q)} className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg"><Bell size={18} /></button>
            <button onClick={() => deleteQuest(q.id, q.type)} className="p-2 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={18} /></button>
            <button onClick={() => completeQuest(q.id, q.task, q.type)} className="px-3 py-1.5 bg-green-100 text-green-700 font-bold text-sm rounded-lg hover:bg-green-200 flex items-center gap-1"><CheckCircle size={14}/> Done</button>
        </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans flex flex-col md:flex-row">
      {/* SIDEBAR */}
      <div className="w-full md:w-64 bg-white border-r border-gray-200 flex flex-col justify-between hidden md:flex">
        <div>
            <div className="p-6 flex items-center gap-3 font-bold text-xl border-b border-gray-100"><Shield className="text-blue-600"/> LifeRPG</div>
            <nav className="p-4 space-y-2">
                <button onClick={() => setActiveTab("dashboard")} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${activeTab === 'dashboard' ? 'bg-blue-50 text-blue-600 font-bold' : 'text-gray-500 hover:bg-gray-50'}`}><LayoutDashboard size={20}/> Dashboard</button>
                <button onClick={() => setActiveTab("add")} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${activeTab === 'add' ? 'bg-blue-50 text-blue-600 font-bold' : 'text-gray-500 hover:bg-gray-50'}`}><PenTool size={20}/> Quest Hub</button>
            </nav>
        </div>
        <div className="p-6 bg-gray-50 border-t border-gray-200">
            <div className="text-xs font-bold text-gray-400 uppercase mb-2">Status (Lvl {stats.level})</div>
            <div className="mb-3"><div className="flex justify-between text-xs font-bold mb-1"><span>HP ❤️</span><span>{stats.hp}</span></div><div className="w-full bg-gray-200 rounded-full h-1.5"><div className="bg-red-500 h-1.5 rounded-full" style={{ width: `${(stats.hp / stats.maxHp) * 100}%` }}></div></div></div>
            <div><div className="flex justify-between text-xs font-bold mb-1"><span>XP ⚡</span><span>{stats.exp} / {stats.maxExp}</span></div><div className="w-full bg-gray-200 rounded-full h-1.5"><div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${(stats.exp / stats.maxExp) * 100}%` }}></div></div></div>
        </div>
      </div>

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-white h-16 border-b border-gray-200 flex items-center justify-between px-6 shadow-sm z-10">
            <div className="md:hidden font-bold text-lg"><Shield className="inline mr-2 text-blue-600"/> LifeRPG</div>
            <div className="hidden md:block font-bold text-lg capitalize">{activeTab}</div>
            {authToken ? ( <button onClick={logout} className="text-sm bg-gray-100 text-red-600 px-4 py-2 rounded-lg hover:bg-red-50 transition flex items-center gap-2"><LogOut size={16}/> Logout</button> ) : ( <button onClick={() => login()} className="text-sm bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition flex items-center gap-2"><Calendar size={16}/> Sync Google</button> )}
        </header>

        <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'dashboard' && (
                <div className="max-w-4xl mx-auto">
                    {/* PROGRESS BAR */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
                        <div className="flex justify-between items-end mb-2">
                            <div><h2 className="text-2xl font-bold">Today's Progress</h2><p className="text-gray-500 text-sm">Completed {completedCount} / {cleanedQuests.length} quests.</p></div>
                            <span className="text-3xl font-bold text-blue-600">{Math.round(progressPercent)}%</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden"><div className="bg-green-500 h-4 rounded-full transition-all duration-700 ease-out" style={{ width: `${progressPercent}%` }}></div></div>
                    </div>

                    {routineQuests.length > 0 && (
                        <div className="mb-8">
                            <h3 className="font-bold text-gray-500 uppercase tracking-wider text-sm mb-3 flex items-center gap-2"><Repeat size={16}/> Daily Routines (Today)</h3>
                            {routineQuests.map(q => <QuestItem key={q.id} q={q} />)}
                        </div>
                    )}
                    {mainQuests.length > 0 && (
                        <div className="mb-8">
                            <h3 className="font-bold text-gray-500 uppercase tracking-wider text-sm mb-3 flex items-center gap-2"><Star size={16}/> Main Quests</h3>
                            {mainQuests.map(q => <QuestItem key={q.id} q={q} />)}
                        </div>
                    )}
                    {sideQuests.length > 0 && (
                        <div className="mb-8">
                            <h3 className="font-bold text-gray-500 uppercase tracking-wider text-sm mb-3 flex items-center gap-2"><ChevronRight size={16}/> Side Quests</h3>
                            {sideQuests.map(q => <QuestItem key={q.id} q={q} />)}
                        </div>
                    )}
                    {cleanedQuests.length === 0 && <div className="text-center py-10 text-gray-400">No active quests. Sync Google or Add one!</div>}
                </div>
            )}

            {activeTab === 'add' && (
                <div className="max-w-2xl mx-auto">
                    <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
                        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2"><PenTool/> Create New Quest</h2>
                        <div className="space-y-6">
                            <div><label className="block text-sm font-bold text-gray-700 mb-2">Quest Name</label><input type="text" value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="e.g. Morning Jog" className="w-full p-4 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"/></div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div><label className="block text-sm font-bold text-gray-700 mb-2">Quest Type</label><select value={questType} onChange={(e) => setQuestType(e.target.value)} className="w-full p-4 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"><option value="side">Side Quest (50 XP)</option><option value="main">Main Quest (200 XP)</option><option value="routine">Routine (Daily / 30 XP)</option></select></div>
                                <div>
                                    {questType === 'routine' ? (
                                        <>
                                            <label className="block text-sm font-bold text-gray-700 mb-2">Target Time</label>
                                            <div className="relative">
                                                <select value={timeFrame} onChange={(e) => setTimeFrame(e.target.value)} className="w-full p-4 border border-blue-200 bg-blue-50 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none font-bold text-blue-800">
                                                    {timeOptions.map((time, index) => (<option key={index} value={time.value}>{time.label}</option>))}
                                                </select>
                                                <Clock className="absolute right-4 top-4 text-blue-400" size={20}/>
                                            </div>
                                            
                                            <label className="block text-sm font-bold text-gray-700 mt-4 mb-2">Duration (Days)</label>
                                            <input type="number" value={routineDays} onChange={(e) => setRoutineDays(e.target.value)} placeholder="e.g. 30 (Leave empty for Forever)" className="w-full p-4 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-500"/>
                                        </>
                                    ) : (
                                        <>
                                            <label className="block text-sm font-bold text-gray-700 mb-2">Deadline</label>
                                            <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="w-full p-4 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-500"/>
                                        </>
                                    )}
                                </div>
                            </div>
                            <button onClick={addQuest} className="w-full py-4 bg-black text-white rounded-xl font-bold text-lg hover:bg-gray-800 transition flex items-center justify-center gap-2 mt-4"><Plus size={24}/> Initialize Quest</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default LifeRPG;