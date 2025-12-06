const socket = io();

let selectedAvatar = 1;
let isTeacher = false;
let myBudget = 0;

// 아바타 생성
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

function toggleTeacherMode() {
    const stdForm = document.getElementById('student-form');
    const teaForm = document.getElementById('teacher-form');
    if (stdForm.style.display === 'none') {
        stdForm.style.display = 'flex'; teaForm.style.display = 'none';
    } else {
        stdForm.style.display = 'none'; teaForm.style.display = 'flex';
    }
}

function requestJoin(role) {
    const code = role === 'student' ? document.getElementById('room-code-input').value : '';
    if (role === 'student') {
        const nickname = document.getElementById('nickname').value;
        const budget = document.getElementById('initial-budget').value;
        if (!nickname) return alert('닉네임을 입력하세요!');
        if (!budget) return alert('입찰 가능액을 입력하세요!');
        if (!code) return alert('방번호를 입력하세요!');
        socket.emit('join', { role: 'student', nickname, avatar: selectedAvatar, code, budget });
    } else {
        socket.emit('join', { role: 'teacher', nickname: '선생님', avatar: 1 });
    }
}

socket.on('login_error', (msg) => alert(msg));
socket.on('force_reload', () => location.reload());
socket.on('kicked', () => { alert("퇴장되었습니다."); location.reload(); });

socket.on('login_success', (data) => {
    isTeacher = (data.role === 'teacher');
    if (isTeacher) {
        document.getElementById('teacher-controls').style.display = 'block';
        document.getElementById('student-controls').style.display = 'none';
    } else {
        myBudget = data.budget;
        updateBudgetDisplay();
        document.getElementById('my-budget-container').style.display = 'block';
    }
    document.getElementById('code-display').innerText = `방번호: ${data.roomCode}`;
    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');
});

function updateBudgetDisplay() {
    document.getElementById('my-budget').innerText = myBudget.toLocaleString();
}

socket.on('update_budget', (newBudget) => {
    myBudget = newBudget;
    updateBudgetDisplay();
});

socket.on('log', (data) => {
    const logDiv = document.getElementById('chat-log');
    const item = document.createElement('div');
    item.className = `log-item log-${data.type}`;
    if (data.type === 'bid') {
        item.innerHTML = `<strong>${data.nickname}</strong>: ${Number(data.amount).toLocaleString()}`;
    } else {
        item.innerText = data.text;
    }
    logDiv.appendChild(item);
    logDiv.scrollTop = logDiv.scrollHeight;
});

socket.on('update_price', (data) => {
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
    // 1. 하단 푸터 (장식용)
    const track = document.getElementById('avatar-track');
    track.innerHTML = '';
    
    // 2. 좌측 명단
    const list = document.getElementById('user-list');
    list.innerHTML = '';
    
    let studentCount = 0;

    users.forEach(u => {
        if (u.nickname === '선생님') return;
        studentCount++;

        // 푸터
        const footerDiv = document.createElement('div');
        footerDiv.className = 'user-avatar';
        footerDiv.innerHTML = `<img src="${u.avatar}.png"><div>${u.nickname}</div>`;
        track.appendChild(footerDiv);

        // 명단
        const row = document.createElement('div');
        row.className = 'user-row';
        let btnHtml = '';
        if (isTeacher) {
            btnHtml = `<button class="kick-btn" onclick="kickUser('${u.id}')">강퇴</button>`;
        }
        row.innerHTML = `
            <div><img src="${u.avatar}.png"> ${u.nickname} (${u.budget.toLocaleString()})</div>
            ${btnHtml}
        `;
        list.appendChild(row);
    });
    
    document.getElementById('user-count').innerText = studentCount;
});

socket.on('timer_update', (timeLeft) => {
    const bar = document.getElementById('timer-bar');
    const text = document.getElementById('timer-text');
    text.innerText = timeLeft;
    const percent = (timeLeft / 20) * 100;
    bar.style.width = `${percent}%`;
    if (timeLeft <= 5) bar.style.background = '#FF5252';
    else bar.style.background = '#FF4081';
});

socket.on('auction_start', () => {
    if (!isTeacher) {
        document.getElementById('bid-amount').disabled = false;
        document.getElementById('btn-bid').disabled = false;
        document.getElementById('status-msg').style.display = 'none';
        document.getElementById('bid-amount').focus();
    }
    document.getElementById('current-price').innerText = "0";
});

socket.on('auction_end', () => {
    document.getElementById('bid-amount').disabled = true;
    document.getElementById('btn-bid').disabled = true;
    document.getElementById('status-msg').style.display = 'block';
    document.getElementById('status-msg').innerText = "경매 종료";
    document.getElementById('timer-bar').style.width = "0%";
    document.getElementById('timer-text').innerText = "0";
});

socket.on('play_sound', (type) => {
    if (isTeacher) {
        const audio = document.getElementById(`sound-${type}`);
        if (audio) { audio.currentTime = 0; audio.play().catch(()=>{}); }
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

function kickUser(id) {
    if (confirm("퇴장시키겠습니까?")) socket.emit('kick_user', id);
}

function action(type) {
    if (type === 'start') socket.emit('teacher_start');
    if (type === 'sold') socket.emit('teacher_sold'); // 낙찰
    if (type === 'end') socket.emit('teacher_end'); // 종료
    if (type === 'reset') {
        if(confirm("모든 접속자가 퇴장되고 방이 초기화됩니다.")) socket.emit('teacher_reset_room');
    }
}

function toggleCode() {
    if (isTeacher) document.getElementById('code-display').classList.toggle('big');
}