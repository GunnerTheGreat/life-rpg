import React, { useState, useEffect } from 'react';
import { Shield, Zap, Bell, Plus, Star, Repeat, LayoutDashboard, PenTool, CheckCircle, Calendar, Clock, ChevronRight, LogOut, Trash2, User } from 'lucide-react';
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
  
  // USER IDENTITY
  const [userEmail, setUserEmail] = useState(null);
  const [ign, setIgn] = useState("Adventurer");
  const [showIgnModal, setShowIgnModal] = useState(false);
  const [newIgnInput, setNewIgnInput] = useState("");

  // FORM INPUTS
  const [newTask, setNewTask] = useState(""); 
  const [questType, setQuestType] = useState("side"); 
  const [deadline, setDeadline] = useState(""); 
  const [timeFrame, setTimeFrame] = useState("09:00"); 
  const [routineDays, setRoutineDays] = useState("");

  // 🛡️ FRONTEND DEDUPLICATION
  const cleanedQuests = quests.filter((q, index, self) =>
    index === self.findIndex((t) => (
      t.task === q.task && new Date(t.time).getTime() === new Date(q.time).getTime()
    ))
  );

  // --- SPLIT PROGRESS MATH ---
  // Helper to calculate % for a specific type
  const getProgress = (type) => {
      const typeQuests = cleanedQuests.filter(q => q.type === type);
      const total = typeQuests.length;
      if (total === 0) return 0;
      const completed = typeQuests.filter(q => q.completed).length;
      return (completed / total) * 100;
  };

  const routineProgress = getProgress('routine');
  const mainProgress = getProgress('main');
  const sideProgress = getProgress('side');

  // VISUAL LISTS (Only Uncompleted for display)
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

  // --- INITIAL LOAD ---
  useEffect(() => {
    const restoreSession = async () => {
        const savedToken = localStorage.getItem('googleAuthToken');
        const savedEmail = localStorage.getItem('userEmail');
        
        if (savedToken && savedEmail) {
            setAuthToken(savedToken);
            setUserEmail(savedEmail);
            try {
                const res = await axios.post(`${API_URL}/api/user/login`, { email: savedEmail });
                if (res.data.exists) {
                    setStats(res.data.user.stats);
                    setIgn(res.data.user.ign);
                    addLog(`Welcome back, ${res.data.user.ign}!`, "gain");
                    fetchCalendar(savedToken);
                } else {
                    logout();
                }
            } catch (err) { console.error("Restore failed"); }
        }
    };
    restoreSession();
  }, []);

  const saveStats = async (newStats) => {
    setStats(newStats); 
    if (userEmail) {
        try { await axios.post(`${API_URL}/api/user/update`, { email: userEmail, stats: newStats }); } catch (err) {}
    }
  };

  const login = useGoogleLogin({
    onSuccess: async (res) => {
      const token = res.access_token;
      try {
          const googleUser = await axios.get('https://www.googleapis.com/oauth2/v1/userinfo', {
              headers: { Authorization: `Bearer ${token}` }
          });
          const email = googleUser.data.email;
          localStorage.setItem('googleAuthToken', token);
          localStorage.setItem('userEmail', email);
          setAuthToken(token);
          setUserEmail(email);

          const dbCheck = await axios.post(`${API_URL}/api/user/login`, { email });
          if (dbCheck.data.exists) {
              setStats(dbCheck.data.user.stats);
              setIgn(dbCheck.data.user.ign);
              fetchCalendar(token);
              addLog(`Welcome back, ${dbCheck.data.user.ign}!`, "gain");
          } else {
              setShowIgnModal(true);
          }
      } catch (err) { console.error("Login Error", err); }
    },
    scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email'
  });

  const handleIgnSubmit = async () => {
      if (!newIgnInput) return alert("Please enter a name!");
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
  };

  const logout = () => {
      localStorage.removeItem('googleAuthToken');
      localStorage.removeItem('userEmail');
      setAuthToken(null);
      setUserEmail(null);
      setQuests([]);
      setStats({ level: 1, coins: 0, hp: 1000, maxHp: 1000, exp: 0, maxExp: 1000 });
      setIgn("Adventurer");
      addLog("Logged out.", "loss");
  };

  const fetchCalendar = async (token) => {
    try {
      const res = await axios.post(`${API_URL}/api/sync-calendar`, { token });
      if(res.data.success) {
        setQuests(res.data.events); 
        if(!authToken) addLog("Synced with Google!", "gain");
      }
    } catch (err) { 
        if (err.response && err.response.status === 500) logout();
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
        try { await axios.post(`${API_URL}/api/complete-quest`, { token: authToken, eventId: id, task: taskName }); } catch (err) {}
    }
  };

  const deleteQuest = async (id, type) => {
      setQuests(prev => prev.filter(q => q.id !== id));
      addLog(`Deleted ${type} quest.`, 'loss');
      if (authToken) {
          try { await axios.post(`${API_URL}/api/delete-quest`, { token: authToken, eventId: id, type: type }); } catch (err) { console.error("Failed to delete", err); }
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
                   {/* 🆕 DATE DISPLAY ADDED HERE */}
                   <Clock size={10}/> 
                   {new Date(q.time).toLocaleDateString([], {weekday: 'short', month: 'short', day: 'numeric'})} • {new Date(q.time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
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
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans flex flex-col md:flex-row relative">
      
      {showIgnModal && (
          <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl text-center">
                  <div className="mx-auto bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mb-4"><User size={32} className="text-blue-600"/></div>
                  <h2 className="text-2xl font-bold mb-2">Welcome, Hero!</h2>
                  <p className="text-gray-500 mb-6">What shall we call you in this world?</p>
                  <input type="text" value={newIgnInput} onChange={(e) => setNewIgnInput(e.target.value)} placeholder="Enter your IGN..." className="w-full p-4 border-2 border-gray-200 rounded-xl text-lg font-bold text-center focus:outline-none focus:border-blue-500 mb-6" autoFocus />
                  <button onClick={handleIgnSubmit} className="w-full py-4 bg-black text-white rounded-xl font-bold text-lg hover:bg-gray-800 transition">Start Adventure</button>
              </div>
          </div>
      )}

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
            <div className="text-sm font-bold text-gray-800 mb-1 flex items-center gap-2"><User size={14}/> {ign}</div>
            <div className="text-xs font-bold text-gray-400 uppercase mb-2">Lvl {stats.level}</div>
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
                    
                    {/* 🆕 NEW SPLIT PROGRESS BARS */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                        {/* 1. ROUTINE BAR */}
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-blue-100">
                            <div className="flex justify-between text-sm font-bold text-blue-600 mb-2"><span>Routines</span><span>{Math.round(routineProgress)}%</span></div>
                            <div className="w-full bg-blue-50 rounded-full h-2 overflow-hidden"><div className="bg-blue-500 h-2 rounded-full transition-all duration-700" style={{ width: `${routineProgress}%` }}></div></div>
                        </div>

                        {/* 2. MAIN QUEST BAR */}
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-yellow-100">
                            <div className="flex justify-between text-sm font-bold text-yellow-600 mb-2"><span>Main Quests</span><span>{Math.round(mainProgress)}%</span></div>
                            <div className="w-full bg-yellow-50 rounded-full h-2 overflow-hidden"><div className="bg-yellow-500 h-2 rounded-full transition-all duration-700" style={{ width: `${mainProgress}%` }}></div></div>
                        </div>

                        {/* 3. SIDE QUEST BAR */}
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                            <div className="flex justify-between text-sm font-bold text-gray-600 mb-2"><span>Side Quests</span><span>{Math.round(sideProgress)}%</span></div>
                            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden"><div className="bg-gray-400 h-2 rounded-full transition-all duration-700" style={{ width: `${sideProgress}%` }}></div></div>
                        </div>
                    </div>

                    {routineQuests.length > 0 && (
                        <div className="mb-8">
                            <h3 className="font-bold text-gray-500 uppercase tracking-wider text-sm mb-3 flex items-center gap-2"><Repeat size={16}/> Daily Routines</h3>
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
      
      <div className="w-64 bg-white border-l border-gray-200 hidden xl:block p-4 overflow-y-auto">
        <h3 className="font-bold mb-4 flex items-center gap-2 text-sm text-gray-500 uppercase tracking-wider"><Zap size={16}/> Activity Log</h3>
        <div className="space-y-4">{logs.map(log => (<div key={log.id} className="text-sm border-b border-gray-100 pb-3"><span className="font-bold text-gray-800 block">{log.text}</span><span className="text-xs text-gray-400">{log.time}</span></div>))}</div>
      </div>
    </div>
  );
};

export default LifeRPG;