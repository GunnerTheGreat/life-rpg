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

// --- 1. DATABASE CONNECTION ---
if (process.env.MONGO_URI) {
    mongoose.connect(process.env.MONGO_URI)
        .then(() => console.log("✅ Connected to MongoDB"))
        .catch(err => console.error("❌ DB Error:", err));
} else {
    console.log("⚠️ MONGO_URI missing in .env file");
}

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    ign: { type: String, default: "Adventurer" },
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

// --- 2. GOOGLE CONFIG ---
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.CLIENT_URL || 'http://localhost:5173'
);

// --- 3. API ROUTES ---

app.post('/api/user/login', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });
        if (user) res.json({ exists: true, user });
        else res.json({ exists: false });
    } catch (e) { res.status(500).json({ error: "DB Error" }); }
});

app.post('/api/user/signup', async (req, res) => {
    const { email, ign } = req.body;
    try {
        const newUser = await User.create({ 
            email, ign,
            stats: { level: 1, coins: 0, hp: 1000, maxHp: 1000, exp: 0, maxExp: 1000 }
        });
        res.json({ success: true, user: newUser });
    } catch (e) { res.status(500).json({ error: "Creation Error" }); }
});

app.post('/api/user/update', async (req, res) => {
    try {
        const { email, stats } = req.body;
        await User.findOneAndUpdate({ email }, { stats });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Save Error" }); }
});

app.post('/api/sync-calendar', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "No Token" });
    
    oauth2Client.setCredentials({ access_token: token });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
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
        
        const rawEvents = response.data.items
            .filter(event => {
                if (!event.summary) return false;
                const eventDate = new Date(event.start.dateTime || event.start.date);
                const type = event.description || 'side';
                if (type === 'routine') return eventDate < endOfToday && eventDate > startOfSearch;
                return true; 
            })
            .map(event => ({
                id: event.id,
                task: event.summary.replace(/^✅\s*/, ''), 
                time: event.start.dateTime || event.start.date,
                type: event.description || 'side',
                completed: event.summary.startsWith('✅')
            }));

        const uniqueEvents = [];
        const seen = new Set();
        rawEvents.forEach(event => {
            const name = event.task.trim().toLowerCase();
            const dateObj = new Date(event.time);
            const timeKey = `${dateObj.getHours()}:${dateObj.getMinutes()}`;
            const uniqueKey = `${name}-${timeKey}`;
            if (!seen.has(uniqueKey)) {
                seen.add(uniqueKey);
                uniqueEvents.push(event);
            }
        });

        res.json({ success: true, events: uniqueEvents });
    } catch (error) {
        console.error("Sync Error:", error.message);
        res.status(500).json({ success: false });
    }
});

app.post('/api/add-quest', async (req, res) => {
    const { token, task, type, deadline, days } = req.body;
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
        if (days && days > 0) event.recurrence = [`RRULE:FREQ=DAILY;COUNT=${days}`];
        else event.recurrence = ['RRULE:FREQ=DAILY'];
    }

    try {
        await calendar.events.insert({ calendarId: 'primary', requestBody: event });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ✅ COMPLETE QUEST (Adds Checkmark)
app.post('/api/complete-quest', async (req, res) => {
    const { token, eventId, task } = req.body;
    oauth2Client.setCredentials({ access_token: token });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    try {
        await calendar.events.patch({ calendarId: 'primary', eventId: eventId, requestBody: { summary: `✅ ${task}` } });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

// ↩️ UN-COMPLETE QUEST (Removes Checkmark - NEW!)
app.post('/api/uncomplete-quest', async (req, res) => {
    const { token, eventId, task } = req.body;
    oauth2Client.setCredentials({ access_token: token });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    try {
        // We set the summary back to just the task name (removing ✅)
        await calendar.events.patch({ calendarId: 'primary', eventId: eventId, requestBody: { summary: task } });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.post('/api/delete-quest', async (req, res) => {
    const { token, eventId, type } = req.body;
    oauth2Client.setCredentials({ access_token: token });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    try {
        let targetId = eventId;
        if (type === 'routine' && eventId.includes('_')) targetId = eventId.split('_')[0];
        await calendar.events.delete({ calendarId: 'primary', eventId: targetId });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.post('/api/send-reminder', async (req, res) => { res.json({success:true}); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));