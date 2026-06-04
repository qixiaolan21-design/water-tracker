const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'users.json');

// 确保数据目录存在
const dataDir = path.dirname(DATA_FILE);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// 加载数据
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            console.log('📂 数据已加载');
            return new Map(Object.entries(data));
        }
    } catch (err) {
        console.error('加载数据失败:', err);
    }
    return new Map();
}

// 保存数据
function saveData() {
    try {
        const data = Object.fromEntries(users);
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('保存数据失败:', err);
    }
}

// 内存数据库（从文件加载）
const users = loadData();

// 定期保存（每5分钟）
setInterval(saveData, 5 * 60 * 1000);

app.use(express.json());
app.use(express.static('public'));

// 用户登录/注册
app.post('/api/login', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: '用户名不能为空' });
    
    if (!users.has(username)) {
        // 新用户，初始化数据
        users.set(username, {
            username,
            dailyGoal: 2000,
            waterData: {},
            createdAt: new Date().toISOString()
        });
        saveData();
        console.log(`✨ 新用户注册: ${username}`);
    } else {
        console.log(`👤 用户登录: ${username}`);
    }
    
    const user = users.get(username);
    res.json({
        username: user.username,
        dailyGoal: user.dailyGoal,
        waterData: user.waterData
    });
});

// 保存用户数据
app.post('/api/save', (req, res) => {
    const { username, waterData, dailyGoal } = req.body;
    if (!username || !users.has(username)) {
        return res.status(404).json({ error: '用户不存在' });
    }
    
    const user = users.get(username);
    user.waterData = waterData;
    user.dailyGoal = dailyGoal;
    user.lastUpdated = new Date().toISOString();
    
    saveData();
    res.json({ success: true });
});

// 获取用户数据
app.get('/api/user/:username', (req, res) => {
    const user = users.get(req.params.username);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    
    res.json({
        username: user.username,
        dailyGoal: user.dailyGoal,
        waterData: user.waterData
    });
});

// 获取排行榜（所有用户的今日排名）
app.get('/api/leaderboard', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const leaderboard = [];
    
    users.forEach((user, username) => {
        const todayRecords = user.waterData[today] || [];
        const todayTotal = todayRecords.reduce((sum, r) => sum + r.amount, 0);
        leaderboard.push({
            username,
            todayTotal,
            drinkCount: todayRecords.length
        });
    });
    
    leaderboard.sort((a, b) => b.todayTotal - a.todayTotal);
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
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('📝 保存数据中...');
    saveData();
    process.exit(0);
});
