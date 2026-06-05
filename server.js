const express = require('express');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'users.json');
const MONGODB_URI = process.env.MONGODB_URI;

// 确保数据目录存在
const dataDir = path.dirname(DATA_FILE);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// MongoDB 模型
let User;
if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI)
        .then(() => console.log('✅ MongoDB 连接成功'))
        .catch(err => console.log('⚠️ MongoDB 连接失败，使用本地文件:', err.message));
    
    const userSchema = new mongoose.Schema({
        username: { type: String, required: true, unique: true },
        dailyGoal: { type: Number, default: 2000 },
        waterData: { type: Object, default: {} },
        createdAt: { type: Date, default: Date.now },
        lastUpdated: { type: Date, default: Date.now }
    });
    
    User = mongoose.model('User', userSchema);
} else {
    console.log('ℹ️ 未配置 MongoDB，使用本地文件存储');
}

// 加载本地数据
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            console.log('📂 本地数据已加载');
            return new Map(Object.entries(data));
        }
    } catch (err) {
        console.error('加载本地数据失败:', err);
    }
    return new Map();
}

// 保存本地数据
function saveData() {
    try {
        const data = Object.fromEntries(users);
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('保存本地数据失败:', err);
    }
}

// 内存数据库（从文件加载）
const users = loadData();

// 定期保存（每5分钟）
setInterval(saveData, 5 * 60 * 1000);

app.use(express.json());
app.use(express.static('public'));

// 获取用户（优先从 MongoDB，否则用内存）
async function getUser(username) {
    if (User) {
        const user = await User.findOne({ username });
        if (user) return user;
    }
    return users.get(username);
}

// 保存用户（优先保存到 MongoDB，同时备份到内存）
async function saveUser(username, userData) {
    if (User) {
        await User.findOneAndUpdate(
            { username },
            { 
                ...userData,
                lastUpdated: new Date()
            },
            { upsert: true, new: true }
        );
    }
    users.set(username, userData);
    saveData();
}

// 获取所有用户
async function getAllUsers() {
    if (User) {
        return await User.find({});
    }
    return Array.from(users.values());
}

// 用户登录/注册
app.post('/api/login', async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: '用户名不能为空' });
    
    let user = await getUser(username);
    
    if (!user) {
        // 新用户，初始化数据
        user = {
            username,
            dailyGoal: 2000,
            waterData: {},
            createdAt: new Date().toISOString()
        };
        await saveUser(username, user);
        console.log(`✨ 新用户注册: ${username}`);
    } else {
        console.log(`👤 用户登录: ${username}`);
    }
    
    res.json({
        username: user.username,
        dailyGoal: user.dailyGoal,
        waterData: user.waterData
    });
});

// 保存用户数据
app.post('/api/save', async (req, res) => {
    const { username, waterData, dailyGoal } = req.body;
    if (!username) {
        return res.status(404).json({ error: '用户不存在' });
    }
    
    let user = await getUser(username);
    if (!user) {
        user = {
            username,
            dailyGoal: dailyGoal || 2000,
            waterData: waterData || {},
            createdAt: new Date().toISOString()
        };
    } else {
        user.waterData = waterData;
        user.dailyGoal = dailyGoal;
    }
    
    user.lastUpdated = new Date().toISOString();
    await saveUser(username, user);
    
    res.json({ success: true });
});

// 获取用户数据
app.get('/api/user/:username', async (req, res) => {
    const user = await getUser(req.params.username);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    
    res.json({
        username: user.username,
        dailyGoal: user.dailyGoal,
        waterData: user.waterData
    });
});

// 获取排行榜（所有用户的今日排名）
app.get('/api/leaderboard', async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const allUsers = await getAllUsers();
    const leaderboard = [];
    
    allUsers.forEach(user => {
        const todayRecords = user.waterData[today] || [];
        const todayTotal = todayRecords.reduce((sum, r) => sum + r.amount, 0);
        leaderboard.push({
            username: user.username,
            todayTotal,
            drinkCount: todayRecords.length
        });
    });
    
    leaderboard.sort((a, b) => b.todayTotal - a.todayTotal);
    res.json(leaderboard.slice(0, 10));
});

// 获取昨日排行榜
app.get('/api/leaderboard/yesterday', async (req, res) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const allUsers = await getAllUsers();
    const leaderboard = [];
    
    allUsers.forEach(user => {
        const yesterdayRecords = user.waterData[yesterdayStr] || [];
        const yesterdayTotal = yesterdayRecords.reduce((sum, r) => sum + r.amount, 0);
        leaderboard.push({
            username: user.username,
            yesterdayTotal,
            drinkCount: yesterdayRecords.length
        });
    });
    
    leaderboard.sort((a, b) => b.yesterdayTotal - a.yesterdayTotal);
    res.json(leaderboard.slice(0, 10));
});

// 页面路由
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 喝水记录系统运行在 http://localhost:${PORT}`);
    console.log(`📊 当前用户数: ${users.size}`);
});

// 进程退出前保存数据
process.on('SIGTERM', () => {
    console.log('📝 保存数据中...');
    saveData();
    if (mongoose.connection.readyState === 1) {
        mongoose.connection.close();
    }
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('📝 保存数据中...');
    saveData();
    if (mongoose.connection.readyState === 1) {
        mongoose.connection.close();
    }
    process.exit(0);
});
