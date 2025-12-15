import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// --- 1. DEBUG LOGGING ---
app.use((req, res, next) => {
    console.log(`📡 [${req.method}] ${req.url}`);
    next();
});

// --- 2. DATABASE CONNECTION ---
if (process.env.MONGO_URI) {
    mongoose.connect(process.env.MONGO_URI)
        .then(() => console.log("✅ Connected to MongoDB"))
        .catch(err => console.error("❌ DB Error:", err));
} else {
    console.log("⚠️ MONGO_URI missing in .env file");
}

const userSchema = new mongoose.Schema({
    userId: { type: String, default: "player1" },
    stats: {
        level: { type: Number, default: 1 },
        coins: { type: Number, default: 0 },
        hp: { type: Number, default: 1000 },
        maxHp: { type: Number, default: 1000 },
        exp: { type: Number, default: 0 },
        maxExp: { type: Number, default: 1000 }
    }
});
const User = mongoose.model('User', userSchema);

// --- 3. GOOGLE CONFIG ---
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.CLIENT_URL || 'http://localhost:5173'
);

// --- 4. API ROUTES ---

// LOAD GAME
app.get('/api/user', async (req, res) => {
    try {
        let user = await User.findOne({ userId: "player1" });
        if (!user) user = await User.create({ userId: "player1" });
        res.json(user.stats);
    } catch (e) {
        console.error("Load Error:", e);
        res.status(500).json({ error: "DB Error" });
    }
});

// SAVE GAME
app.post('/api/user/update', async (req, res) => {
    try {
        const { stats } = req.body;
        await User.findOneAndUpdate({ userId: "player1" }, { stats });
        res.json({ success: true });
    } catch (e) {
        console.error("Save Error:", e);
        res.status(500).json({ error: "Save Error" });
    }
});

// SYNC CALENDAR (UPDATED: Now includes completed quests for Progress Bar)
app.post('/api/sync-calendar', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "No Token" });
    
    oauth2Client.setCredentials({ access_token: token });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Timezone Fix: Look back 24h
    const startOfSearch = new Date(); 
    startOfSearch.setDate(startOfSearch.getDate() - 1); 
    startOfSearch.setHours(0, 0, 0, 0);
    
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    try {
        const response = await calendar.events.list({
            calendarId: 'primary',
            timeMin: startOfSearch.toISOString(),
            maxResults: 100,
            singleEvents: true,
            orderBy: 'startTime',
        });
        
        const activeEvents = response.data.items
            .filter(event => {
                // CHANGE 1: We DO NOT filter out '✅' anymore. We keep them!
                if (!event.summary) return false;

                const eventDate = new Date(event.start.dateTime || event.start.date);
                const type = event.description || 'side';

                // Routine Filter: Only show if it belongs to Today
                if (type === 'routine') {
                    return eventDate < endOfToday && eventDate > startOfSearch;
                }
                return true; 
            })
            .map(event => ({
                id: event.id,
                // CHANGE 2: Clean the name (remove ✅ for display)
                task: event.summary.replace(/^✅\s*/, ''), 
                time: event.start.dateTime || event.start.date,
                type: event.description || 'side',
                // CHANGE 3: Add a "completed" flag so the Frontend knows
                completed: event.summary.startsWith('✅')
            }));

        res.json({ success: true, events: activeEvents });
    } catch (error) {
        console.error("Sync Error:", error.message);
        res.status(500).json({ success: false });
    }
});

// ADD QUEST
app.post('/api/add-quest', async (req, res) => {
    console.log("📝 Adding Quest:", req.body); 

    const { token, task, type, deadline } = req.body;
    if(!token) return res.status(400).json({ success: false, message: "No Token" });

    oauth2Client.setCredentials({ access_token: token });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    let startTime;
    try {
        startTime = deadline ? new Date(deadline) : new Date();
        if (isNaN(startTime.getTime())) startTime = new Date();
    } catch (err) { startTime = new Date(); }

    const endTime = new Date(startTime.getTime() + 3600000); 

    let event = {
        summary: (type === 'main' ? '★ ' : '') + task,
        description: type,
        start: { dateTime: startTime.toISOString(), timeZone: 'Asia/Manila' },
        end: { dateTime: endTime.toISOString(), timeZone: 'Asia/Manila' },
    };

    if (type === 'routine') {
        event.recurrence = ['RRULE:FREQ=DAILY'];
    }

    try {
        await calendar.events.insert({
            calendarId: 'primary',
            requestBody: event,
        });
        res.json({ success: true });
    } catch (error) {
        console.error("❌ Google Calendar Error:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// COMPLETE QUEST
app.post('/api/complete-quest', async (req, res) => {
    const { token, eventId, task } = req.body;
    if(!token || !eventId) return res.status(400).json({ error: "Missing Data" });

    oauth2Client.setCredentials({ access_token: token });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    try {
        await calendar.events.patch({
            calendarId: 'primary',
            eventId: eventId,
            requestBody: { summary: `✅ ${task}` }
        });
        res.json({ success: true });
    } catch (error) {
        console.error("Complete Error:", error.message);
        res.status(500).json({ success: false });
    }
});

// SEND EMAIL
app.post('/api/send-reminder', async (req, res) => {
    const { email, task } = req.body;
    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        tls: { rejectUnauthorized: false }
    });
    try {
        await transporter.sendMail({
            from: '"Life RPG" <noreply@liferpg.com>',
            to: email,
            subject: "Quest Reminder: " + task,
            text: `Hero! Task due: ${task}.`
        });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));