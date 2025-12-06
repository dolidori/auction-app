const socket = io();

let selectedAvatar = 1;
let isTeacher = false;

// 1. 아바타 생성
const avatarGrid = document.getElementById('avatar-grid');
for (let i = 1; i <= 28; i++) {
    const img = document.createElement('img');
    img.src = `${i}.png`;
    img.onclick = () => {
        document.querySelectorAll('.avatar-grid img').forEach(el => el.classList.remove('selected'));
        img.classList.add('selected');
        selectedAvatar = i;
    };
    if (i === 1) img.classList.add('selected');
    avatarGrid.appendChild(img);
}

// 2. 화면 전환 (로그인 폼)
function toggleTeacherMode() {
    const stdForm = document.getElementById('student-form');
    const teaForm = document.getElementById('teacher-form');
    
    if (stdForm.style.display === 'none') {
        stdForm.style.display = 'block';
        teaForm.style.display = 'none';
    } else {
        stdForm.style.display = 'none';
        teaForm.style.display = 'block';
    }
}

// 3. 입장 요청 (서버에 데이터 전송)
function requestJoin(role) {
    const code = role === 'student' ? document.getElementById('room-code-input').value : '';
    
    if (role === 'student') {
        const nickname = document.getElementById('nickname').value;
        if (!nickname) return alert('닉네임을 입력하세요!');
        if (!code) return alert('방번호를 입력하세요!');
        
        socket.emit('join', { role: 'student', nickname, avatar: selectedAvatar, code });
    } else {
        // 선생님은 코드 없이 입장
        socket.emit('join', { role: 'teacher', nickname: '선생님', avatar: 1 });
    }
}

// 4. 소켓 응답 처리

// 로그인 실패 (방번호 틀림 등)
socket.on('login_error', (msg) => {
    alert(msg);
});

// 로그인 성공
socket.on('login_success', (data) => {
    isTeacher = (data.role === 'teacher');
    
    // 선생님이면 컨트롤 보이기
    if (isTeacher) {
        document.getElementById('teacher-controls').style.display = 'block';
        document.getElementById('student-controls').style.display = 'none';
    }
    
    // 방번호 업데이트
    document.getElementById('code-display').innerText = `방번호: ${data.roomCode}`;

    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');
});

socket.on('log', (data) => {
    const logDiv = document.getElementById('chat-log');
    const item = document.createElement('div');
    item.className = `log-item log-${data.type}`;
    
    if (data.type === 'bid') {
        // '원' 제거, 그냥 숫자만 표시
        item.innerHTML = `<strong>${data.nickname}</strong>: ${Number(data.amount).toLocaleString()}`;
    } else {
        item.innerText = data.text;
    }
    
    logDiv.appendChild(item);
    logDiv.scrollTop = logDiv.scrollHeight;
});

socket.on('update_price', (data) => {
    // '원' 제거
    document.getElementById('current-price').innerText = Number(data.price).toLocaleString();
    
    const winnerArea = document.getElementById('winner-area');
    if (isTeacher && data.bidder) {
        winnerArea.style.display = 'block';
        document.getElementById('winner-img').src = `${data.bidder.avatar}.png`;
        document.getElementById('winner-name').innerText = `1등: ${data.bidder.nickname}`;
    } else if (data.price === 0) {
        winnerArea.style.display = 'none';
    }
});

socket.on('update_users', (users) => {
    const track = document.getElementById('avatar-track');
    track.innerHTML = '';
    users.forEach(u => {
        if (u.nickname === '선생님') return; 

        const div = document.createElement('div');
        div.className = 'user-avatar';
        div.innerHTML = `<img src="${u.avatar}.png"><div>${u.nickname}</div>`;
        track.appendChild(div);
    });
});

socket.on('timer_update', (timeLeft) => {
    const bar = document.getElementById('timer-bar');
    const text = document.getElementById('timer-text');
    
    // 텍스트 업데이트
    text.innerText = timeLeft;

    const percent = (timeLeft / 20) * 100;
    bar.style.width = `${percent}%`;
    
    if (timeLeft <= 5) bar.style.background = '#FF5252';
    else bar.style.background = '#FF4081';
});

socket.on('auction_start', () => {
    const input = document.getElementById('bid-amount');
    const btn = document.getElementById('btn-bid');
    const msg = document.getElementById('status-msg');
    
    if (!isTeacher) {
        input.disabled = false;
        btn.disabled = false;
        input.focus();
        msg.style.display = 'none';
    }
    document.getElementById('current-price').innerText = "0";
});

socket.on('auction_end', () => {
    const input = document.getElementById('bid-amount');
    const btn = document.getElementById('btn-bid');
    
    input.disabled = true;
    btn.disabled = true;
    document.getElementById('status-msg').style.display = 'block';
    document.getElementById('status-msg').innerText = "경매 종료";
    document.getElementById('timer-bar').style.width = "0%";
    document.getElementById('timer-text').innerText = "0";
});

socket.on('play_sound', (type) => {
    if (isTeacher) {
        const audio = document.getElementById(`sound-${type}`);
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(()=>{});
        }
    }
});

function sendBid() {
    const input = document.getElementById('bid-amount');
    const val = parseInt(input.value);
    
    if (val > 0) {
        socket.emit('bid', val);
        input.value = '';
        input.focus();
    }
}

document.getElementById('bid-amount').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendBid();
});

function action(type) {
    if (type === 'start') socket.emit('teacher_start');
    if (type === 'sold') socket.emit('teacher_sold');
    if (type === 'end') socket.emit('teacher_end');
}

function toggleCode() {
    if (isTeacher) {
        document.getElementById('code-display').classList.toggle('big');
    }
}