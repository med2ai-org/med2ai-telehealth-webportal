/* ═══════════════════════════════════════════════════════════════
   Med2AI Nexus — Web Clinician Portal
   Agora Web SDK integration for browser-based telehealth
   ═══════════════════════════════════════════════════════════════ */

// ── Configuration ────────────────────────────────────────────
// These placeholders are replaced during the deployment workflow
// using the GitHub Actions secrets: AGORA_APP_ID and VITE_API_URL.
const CONFIG = {
  appId: '__VITE_AGORA_APP_ID__',
  tokenServerUrl: '/clinical', // Proxied via CloudFront Regulatory Bridge
};

let AUTH_TOKEN = localStorage.getItem('telehealth_token') || null;

function setToken(t) { AUTH_TOKEN = t; localStorage.setItem('telehealth_token', t); }
function getToken()  { return AUTH_TOKEN || localStorage.getItem('telehealth_token'); }
function clearToken(){ AUTH_TOKEN = null; localStorage.removeItem('telehealth_token'); localStorage.removeItem('telehealth_user'); }

function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(window.atob(base64));
  } catch (e) { return {}; }
}

// ── State ────────────────────────────────────────────────────
let client = null;
let localAudioTrack = null;
let localVideoTrack = null;
let micEnabled = true;
let camEnabled = true;
let timerInterval = null;
let timerSeconds = 0;

// ── Auto-fill room code from URL ─────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (!getToken()) {
    showScreen('login-screen');
  } else {
    const user = JSON.parse(localStorage.getItem('telehealth_user') || '{}');
    if (user.name) document.getElementById('display-name').value = user.name;
    showScreen('join-screen');
  }

  const params = new URLSearchParams(window.location.search);
  const code = params.get('code') || params.get('room');
  if (code) {
    document.getElementById('room-code').value = code.toUpperCase();
  }

  // Also check path: /ABC123
  const pathCode = window.location.pathname.replace(/^\//, '').toUpperCase();
  if (/^[A-Z0-9]{6}$/.test(pathCode)) {
    document.getElementById('room-code').value = pathCode;
  }

  // Enter key on room code input
  document.getElementById('room-code').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinSession();
  });

  document.getElementById('display-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinSession();
  });
});

// ═══════════════════════════════════════════════════════════════
// TOKEN FETCHING (with retry for Render cold starts)
// ═══════════════════════════════════════════════════════════════
async function fetchToken(channelName, uid) {
  try {
    const tokenUrl = `${CONFIG.tokenServerUrl}/rtc/${channelName}/publisher/uid/${uid}/?expiry=3600`;
    console.log(`Fetching RTC token: ${tokenUrl}`);

    const resp = await fetch(tokenUrl, { 
      headers: { 'Authorization': `Bearer ${getToken()}` },
      signal: AbortSignal.timeout(10000) 
    });

    if (resp.ok) {
      const data = await resp.json();
      const token = data.rtcToken || data.token || '';
      if (token) return token;
    }
    console.error(`Token fetch failed: status ${resp.status}`);
    if (resp.status === 401) { clearToken(); location.reload(); }
  } catch (e) {
    console.error(`Token fetch error:`, e.message);
  }
  return null;
}

window.doLogin = async () => {
  const email = document.getElementById('login-email').value.trim();
  const pwd = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn-action');
  
  if (!email || !pwd) return;
  
  btn.disabled = true;
  btn.textContent = 'Verifying...';
  
  try {
    // We call the provider API (proxied) to login
    const resp = await fetch(`${CONFIG.tokenServerUrl}/api/auth/clinician/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pwd })
    });
    
    const data = await resp.json();
    if (data.success) {
      setToken(data.token);
      const payload = parseJwt(data.token);
      localStorage.setItem('telehealth_user', JSON.stringify({ name: payload.name || email.split('@')[0], role: (payload['cognito:groups']||[])[0] }));
      document.getElementById('display-name').value = payload.name || email.split('@')[0];
      showScreen('join-screen');
    } else {
      alert(data.error || 'Login failed');
    }
  } catch (e) {
    alert('Connection error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
};

// ═══════════════════════════════════════════════════════════════
// JOIN SESSION
// ═══════════════════════════════════════════════════════════════
async function joinSession() {
  const codeInput = document.getElementById('room-code');
  const nameInput = document.getElementById('display-name');
  const joinBtn = document.getElementById('join-btn');

  const roomCode = codeInput.value.trim().toUpperCase();
  const displayName = nameInput.value.trim() || 'Clinician';

  // Validate
  if (!/^[A-Z0-9]{6}$/.test(roomCode)) {
    shake(codeInput);
    codeInput.focus();
    return;
  }

  // Disable button
  joinBtn.disabled = true;
  joinBtn.innerHTML = `
    <svg class="spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg>
    Connecting...
  `;

  try {
    // Create Agora client
    client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

    // Generate UID
    const uid = Math.floor(Math.random() * 100000) + 1;

    // Derive channel name — MUST match mobile app convention:
    // ConsultationService._channelFromCode: 'med2ai-${code.toLowerCase()}'
    const channelName = `med2ai-${roomCode.toLowerCase()}`;

    // Fetch token — REQUIRED (App Certificate is enabled, so token auth is mandatory)
    const token = await fetchToken(channelName, uid);
    if (!token) {
      throw new Error('Could not obtain authentication token. Please check the server configuration.');
    }

    // Subscribe to remote user events
    client.on('user-published', async (user, mediaType) => {
      await client.subscribe(user, mediaType);
      console.log('Subscribed to', user.uid, mediaType);

      if (mediaType === 'video') {
        const remoteContainer = document.getElementById('remote-video-container');
        document.getElementById('remote-placeholder').style.display = 'none';
        user.videoTrack.play(remoteContainer);
      }

      if (mediaType === 'audio') {
        user.audioTrack.play();
      }

      updateCallStatus('Connected', '#92FE9D');
    });

    client.on('user-unpublished', (user, mediaType) => {
      if (mediaType === 'video') {
        document.getElementById('remote-placeholder').style.display = 'flex';
      }
    });

    client.on('user-left', () => {
      document.getElementById('remote-placeholder').style.display = 'flex';
      document.getElementById('remote-placeholder').querySelector('p').textContent = 'Patient disconnected';
      updateCallStatus('Patient Left', '#ff9f43');
    });

    // Join channel — use derived channelName (not raw roomCode)
    await client.join(CONFIG.appId, channelName, token || null, uid);

    // Create and publish local tracks
    [localAudioTrack, localVideoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();

    // Play local video
    localVideoTrack.play(document.getElementById('local-video-container'));

    // Publish
    await client.publish([localAudioTrack, localVideoTrack]);

    // Show call screen
    showScreen('call-screen');
    document.getElementById('room-code-display').textContent = roomCode;
    document.getElementById('room-label-code').textContent = roomCode;
    updateCallStatus('Waiting for patient...', '#00C9FF');

    // Start timer
    startTimer();

    console.log(`Joined channel ${roomCode} as uid ${uid}`);

  } catch (error) {
    console.error('Failed to join:', error);
    joinBtn.disabled = false;
    joinBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="23 7 16 12 23 17 23 7"/>
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
      </svg>
      Join Secure Session
    `;
    alert(`Connection failed: ${error.message}\n\nPlease check your room code and try again.`);
  }
}

// ═══════════════════════════════════════════════════════════════
// CALL CONTROLS
// ═══════════════════════════════════════════════════════════════
function toggleMic() {
  if (!localAudioTrack) return;
  micEnabled = !micEnabled;
  localAudioTrack.setEnabled(micEnabled);

  document.getElementById('mic-icon-on').style.display = micEnabled ? 'block' : 'none';
  document.getElementById('mic-icon-off').style.display = micEnabled ? 'none' : 'block';
  document.getElementById('mic-btn').classList.toggle('muted', !micEnabled);
}

function toggleCamera() {
  if (!localVideoTrack) return;
  camEnabled = !camEnabled;
  localVideoTrack.setEnabled(camEnabled);

  document.getElementById('cam-icon-on').style.display = camEnabled ? 'block' : 'none';
  document.getElementById('cam-icon-off').style.display = camEnabled ? 'none' : 'block';
  document.getElementById('cam-btn').classList.toggle('muted', !camEnabled);
}

async function leaveSession() {
  if (localAudioTrack) { localAudioTrack.stop(); localAudioTrack.close(); }
  if (localVideoTrack) { localVideoTrack.stop(); localVideoTrack.close(); }
  if (client) { await client.leave(); }

  localAudioTrack = null;
  localVideoTrack = null;
  client = null;
  micEnabled = true;
  camEnabled = true;

  stopTimer();
  showScreen('join-screen');

  // Reset join button
  const joinBtn = document.getElementById('join-btn');
  joinBtn.disabled = false;
  joinBtn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="23 7 16 12 23 17 23 7"/>
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
    </svg>
    Join Secure Session
  `;

  // Reset remote
  document.getElementById('remote-placeholder').style.display = 'flex';
  document.getElementById('remote-placeholder').querySelector('p').textContent = 'Waiting for patient to connect...';
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function updateCallStatus(text, color) {
  const el = document.getElementById('call-status');
  el.textContent = `● ${text}`;
  el.style.color = color;
}

function startTimer() {
  timerSeconds = 0;
  timerInterval = setInterval(() => {
    timerSeconds++;
    const mins = String(Math.floor(timerSeconds / 60)).padStart(2, '0');
    const secs = String(timerSeconds % 60).padStart(2, '0');
    document.getElementById('call-timer').textContent = `${mins}:${secs}`;
  }, 1000);
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  timerSeconds = 0;
}

function shake(el) {
  el.style.animation = 'none';
  el.offsetHeight; // Trigger reflow
  el.style.animation = 'shake 0.5s ease';
  el.style.borderColor = '#ff3b30';
  setTimeout(() => { el.style.borderColor = ''; }, 2000);
}

// Add shake keyframes dynamically
const style = document.createElement('style');
style.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-8px); }
    40% { transform: translateX(8px); }
    60% { transform: translateX(-4px); }
    80% { transform: translateX(4px); }
  }
  .spinner { animation: spin 1s linear infinite; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;
document.head.appendChild(style);
