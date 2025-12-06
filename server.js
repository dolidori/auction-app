const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// 초기 방 번호 생성
let currentRoomCode = generateRoomCode();

function generateRoomCode() {
    return (Math.floor(Math.random() * 900) + 100).toString();
}

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
            // 시간 종료 시 자동 낙찰 처리
            if (gameState.highestBidder) {
                // 예산 차감
                const winnerIndex = gameState.users.findIndex(u => u.id === gameState.highestBidder.id);
                if (winnerIndex !== -1) {
                    gameState.users[winnerIndex].budget -= gameState.currentPrice;
                    io.to(gameState.highestBidder.id).emit('update_budget', gameState.users[winnerIndex].budget); // 개인 예산 업데이트
                }

                io.emit('log', { type: 'win', text: `🎉 ${gameState.highestBidder.nickname} 님 ${gameState.currentPrice.toLocaleString()}에 낙찰!` });
                io.emit('play_sound', 'win');
                io.emit('auto_win', gameState.highestBidder);
                io.emit('update_users', gameState.users); // 예산 변경 반영을 위해 유저 리스트 업데이트
            } else {
                io.emit('log', { type: 'system', text: '시간 초과로 종료되었습니다.' });
            }
            gameState.isActive = false;
            io.emit('auction_end');
        }
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
}

io.on('connection', (socket) => {
    
    // 1. 입장
    socket.on('join', (data) => {
        if (data.role === 'student') {
            if (data.code !== currentRoomCode) {
                socket.emit('login_error', '방 번호가 틀렸습니다.');
                return;
            }
        }

        // 유저 정보에 budget(예산) 추가
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
            io.emit('log', { type: 'info', text: `✨ ${user.nickname} 님 입장 (예산: ${user.budget.toLocaleString()})` });
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

        // 예산 체크
        if (amount > bidder.budget) {
            socket.emit('log', { type: 'system', text: '❌ 가진 돈보다 많이 입찰할 수 없어요!' });
            return;
        }

        if (amount <= gameState.currentPrice) return;

        gameState.currentPrice = amount;
        gameState.highestBidder = bidder;

        startTimer();

        io.emit('update_price', { price: amount, bidder: bidder });
        io.emit('log', { type: 'bid', nickname: bidder.nickname, amount: amount });
        io.emit('play_sound', 'bid');
    });

    // 4. 선생님: 강퇴 기능
    socket.on('kick_user', (userId) => {
        const user = gameState.users.find(u => u.id === userId);
        if (user) {
            // 해당 유저에게 알림 및 연결 끊기 (선택사항)
            io.to(userId).emit('kicked');
            io.sockets.sockets.get(userId)?.disconnect(true);

            // 목록에서 제거
            gameState.users = gameState.users.filter(u => u.id !== userId);
            io.emit('update_users', gameState.users);
            io.emit('log', { type: 'system', text: `🚫 ${user.nickname} 님이 강퇴되었습니다.` });
        }
    });

    // 5. 선생님: 방 리셋 (새 방 번호 생성)
    socket.on('teacher_reset_room', () => {
        stopTimer();
        currentRoomCode = generateRoomCode(); // 새 코드 생성
        gameState = {
            isActive: false,
            currentPrice: 0,
            highestBidder: null,
            users: [], // 유저 목록 초기화
            timer: 20
        };
        
        // 모든 클라이언트에게 '새로고침' 하라고 신호 보냄
        io.emit('force_reload');
    });

    // 6. 강제 종료 (낙찰 없이 끝내기)
    socket.on('teacher_end', () => {
        stopTimer();
        gameState.isActive = false;
        io.emit('auction_end');
        io.emit('log', { type: 'system', text: '⏹ 경매가 종료되었습니다.' });
    });

    // 퇴장
    socket.on('disconnect', () => {
        gameState.users = gameState.users.filter(u => u.id !== socket.id);
        io.emit('update_users', gameState.users);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ 서버 시작! 포트 ${PORT}`);
});