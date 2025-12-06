const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// 방 번호 생성
let currentRoomCode = generateRoomCode();
function generateRoomCode() { return (Math.floor(Math.random() * 900) + 100).toString(); }

let gameState = {
    isActive: false,
    currentPrice: 0,
    highestBidder: null,
    users: [],
    timer: 20
};

let timerInterval = null;

function startTimer() {
    clearInterval(timerInterval);
    gameState.timer = 20;
    io.emit('timer_update', gameState.timer);
    
    timerInterval = setInterval(() => {
        if (gameState.timer > 0) {
            gameState.timer--;
            io.emit('timer_update', gameState.timer);
        } else {
            clearInterval(timerInterval);
            // 시간 종료 -> 자동 낙찰 처리
            handleSold();
        }
    }, 1000);
}

function stopTimer() { clearInterval(timerInterval); }

// 낙찰 처리 함수 (시간초과 or 선생님 버튼)
function handleSold() {
    stopTimer();
    if (gameState.highestBidder) {
        // 점수 차감 로직
        const winnerIndex = gameState.users.findIndex(u => u.id === gameState.highestBidder.id);
        if (winnerIndex !== -1) {
            gameState.users[winnerIndex].budget -= gameState.currentPrice;
            // 개인에게 잔여 점수 업데이트 알림
            io.to(gameState.highestBidder.id).emit('update_budget', gameState.users[winnerIndex].budget);
        }

        io.emit('log', { type: 'win', text: `🎉 ${gameState.highestBidder.nickname} 님 ${gameState.currentPrice} 에 낙찰!` });
        io.emit('play_sound', 'win');
        io.emit('auto_win', gameState.highestBidder);
        io.emit('update_users', gameState.users); 
    } else {
        io.emit('log', { type: 'system', text: '입찰자 없이 종료되었습니다.' });
    }
    gameState.isActive = false;
    io.emit('auction_end');
}

io.on('connection', (socket) => {
    
    // 1. 입장
    socket.on('join', (data) => {
        if (data.role === 'student' && data.code !== currentRoomCode) {
            socket.emit('login_error', '방 번호가 틀렸습니다.');
            return;
        }

        const user = { 
            id: socket.id, 
            nickname: data.nickname, 
            avatar: data.avatar, 
            role: data.role,
            budget: parseInt(data.budget) || 0 
        };
        
        gameState.users.push(user);
        
        socket.emit('login_success', { role: user.role, roomCode: currentRoomCode, budget: user.budget });
        io.emit('update_users', gameState.users);
        
        if (user.role === 'student') {
            io.emit('log', { type: 'info', text: `✨ ${user.nickname} 님 입장` });
        }
        
        socket.emit('update_price', { price: gameState.currentPrice, bidder: gameState.highestBidder });
    });

    // 2. 경매 시작
    socket.on('teacher_start', () => {
        gameState.isActive = true;
        gameState.currentPrice = 0;
        gameState.highestBidder = null;
        startTimer();
        io.emit('auction_start');
        io.emit('update_price', { price: 0, bidder: null });
        io.emit('log', { type: 'system', text: '🔔 경매 시작! 20초 안에 입찰하세요!' });
    });

    // 3. 입찰
    socket.on('bid', (amount) => {
        if (!gameState.isActive) return;
        
        const bidder = gameState.users.find(u => u.id === socket.id);
        if (!bidder) return;

        if (amount > bidder.budget) {
            socket.emit('log', { type: 'system', text: '❌ 입찰 가능액이 부족합니다!' });
            return;
        }
        if (amount <= gameState.currentPrice) return;

        gameState.currentPrice = amount;
        gameState.highestBidder = bidder;

        startTimer(); // 시간 리셋

        io.emit('update_price', { price: amount, bidder: bidder });
        io.emit('log', { type: 'bid', nickname: bidder.nickname, amount: amount });
        io.emit('play_sound', 'bid');
    });

    // 4. 낙찰 (선생님 버튼)
    socket.on('teacher_sold', () => {
        handleSold();
    });

    // 5. 강퇴
    socket.on('kick_user', (userId) => {
        const user = gameState.users.find(u => u.id === userId);
        if (user) {
            io.to(userId).emit('kicked');
            io.sockets.sockets.get(userId)?.disconnect(true);
            gameState.users = gameState.users.filter(u => u.id !== userId);
            io.emit('update_users', gameState.users);
            io.emit('log', { type: 'system', text: `🚫 ${user.nickname} 님이 퇴장되었습니다.` });
        }
    });

    // 6. 방 리셋
    socket.on('teacher_reset_room', () => {
        stopTimer();
        currentRoomCode = generateRoomCode();
        gameState = { isActive: false, currentPrice: 0, highestBidder: null, users: [], timer: 20 };
        io.emit('force_reload');
    });

    // 7. 종료 (낙찰 없이)
    socket.on('teacher_end', () => {
        stopTimer();
        gameState.isActive = false;
        io.emit('auction_end');
        io.emit('log', { type: 'system', text: '⏹ 경매가 종료되었습니다.' });
    });

    socket.on('disconnect', () => {
        gameState.users = gameState.users.filter(u => u.id !== socket.id);
        io.emit('update_users', gameState.users);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ 서버 시작! 포트 ${PORT}`);
});