const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 内存数据库（实际生产环境建议用 MongoDB/PostgreSQL）
const users = new Map();

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
            createdAt: new Date()
        });
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
