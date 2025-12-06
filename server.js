const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// 1. 서버 시작 시 랜덤 방번호 생성 (100 ~ 999)
const ROOM_CODE = (Math.floor(Math.random() * 900) + 100).toString();
console.log(`🔑 현재 방 번호: ${ROOM_CODE}`);

// 게임 데이터
let gameState = {
    isActive: false,
    currentPrice: 0,
    highestBidder: null,
    users: [],
    timer: 20
};

let timerInterval = null;

// 타이머 함수 (자동 낙찰 로직 포함)
function startTimer() {
    clearInterval(timerInterval);
    gameState.timer = 20;
    io.emit('timer_update', gameState.timer); // 초기화 즉시 전송
    
    timerInterval = setInterval(() => {
        if (gameState.timer > 0) {
            gameState.timer--;
            io.emit('timer_update', gameState.timer);
        } else {
            // 시간이 0이 되었을 때
            clearInterval(timerInterval);
            
            if (gameState.highestBidder) {
                // 1등이 있으면 자동 낙찰
                io.emit('log', { type: 'win', text: `🎉 ${gameState.highestBidder.nickname} 님 ${gameState.currentPrice}에 낙찰!` });
                io.emit('play_sound', 'win');
                io.emit('auto_win', gameState.highestBidder); // 클라이언트에 알림
            } else {
                // 입찰자 없이 시간 종료
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
    
    // 1. 입장 (방번호 검증)
    socket.on('join', (data) => {
        // 선생님은 코드 검증 패스, 학생은 검증
        if (data.role === 'student') {
            if (data.code !== ROOM_CODE) {
                socket.emit('login_error', '방 번호가 틀렸습니다.');
                return;
            }
        }

        const user = { id: socket.id, nickname: data.nickname, avatar: data.avatar, role: data.role };
        gameState.users.push(user);
        
        // 입장 성공 알림
        socket.emit('login_success', { role: user.role, roomCode: ROOM_CODE }); // 방번호 알려줌
        
        io.emit('update_users', gameState.users);
        if (user.role === 'student') {
            io.emit('log', { type: 'info', text: `✨ ${user.nickname} 님이 입장했습니다.` });
        }
        
        // 현재 상태 전송
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
        if (amount <= gameState.currentPrice) return;

        gameState.currentPrice = amount;
        const bidder = gameState.users.find(u => u.id === socket.id);
        gameState.highestBidder = bidder;

        startTimer(); // 시간 리셋

        io.emit('update_price', { price: amount, bidder: bidder });
        io.emit('log', { type: 'bid', nickname: bidder.nickname, amount: amount });
        io.emit('play_sound', 'bid');
    });

    // 4. 강제 낙찰 (선생님 버튼)
    socket.on('teacher_sold', () => {
        if (gameState.highestBidder) {
            io.emit('log', { type: 'win', text: `🎉 ${gameState.highestBidder.nickname} 님 ${gameState.currentPrice}에 낙찰!` });
            io.emit('play_sound', 'win');
        }
        stopTimer();
        gameState.isActive = false;
        io.emit('auction_end');
    });

    // 5. 강제 종료
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

// process.env.PORT는 배포된 서버가 정해주는 번호입니다.
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ 서버 시작! 포트 ${PORT}`);
});