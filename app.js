/* ===================== DATA (in-memory) ===================== */
const initials = n => n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
function fotoFor(nama, email){
  const acc = accounts.find(a => (email && a.email===email) || a.nama===nama);
  if(acc && acc.foto) return acc.foto;
  const k = karyawan.find(x => (email && x.email===email) || x.nama===nama);
  return (k && k.foto) || null;
}
function avatarHTML(nama, email){
  const foto = fotoFor(nama, email);
  return foto ? `<img src="${foto}" alt="Foto ${nama}">` : initials(nama);
}

let karyawan = [];
let nextKaryawanId = 1;

const statusBadge = s => {
  const map = {Hadir:'b-hadir', Terlambat:'b-telat', Alpha:'b-alpha', Izin:'b-izin', Cuti:'b-cuti'};
  return `<span class="badge ${map[s]||'b-hadir'}"><span class="dot"></span>${s}</span>`;
};

let recentActivity = [];

function fmtTgl(offsetDays){
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return d.toLocaleDateString('id-ID', {day:'numeric', month:'short', year:'numeric'});
}
function todayISO(){
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function pad2(n){ return n.toString().padStart(2,'0'); }
function fmtTglISO(iso){
  return new Date(iso+'T00:00:00').toLocaleDateString('id-ID', {day:'numeric', month:'short', year:'numeric'});
}
function dateRangeISO(startISO, endISO){
  const dates = [];
  if(!startISO || !endISO) return dates;
  let cur = new Date(startISO+'T00:00:00');
  const end = new Date(endISO+'T00:00:00');
  if(isNaN(cur) || isNaN(end)) return dates;
  let guard = 0;
  while(cur <= end && guard < 366){
    dates.push(`${cur.getFullYear()}-${pad2(cur.getMonth()+1)}-${pad2(cur.getDate())}`);
    cur.setDate(cur.getDate()+1);
    guard++;
  }
  return dates;
}
function izinStatusFor(jenis){
  return jenis === 'Cuti Tahunan' ? 'Cuti' : 'Izin';
}

let myHistory = [];

let riwayatLog = [];

let izinList = [];
let nextIzinId = 1;

const deptStats = [];

/* ===================== STATISTIK REAL-TIME ===================== */
function computeStats(){
  const total = karyawan.length;
  const todayStr = fmtTgl(0);
  const todayLogs = riwayatLog.filter(r => r.tgl === todayStr);
  const hadir = todayLogs.filter(r => r.status === 'Hadir').length;
  const telat = todayLogs.filter(r => r.status === 'Terlambat').length;
  const izinCuti = todayLogs.filter(r => r.status === 'Izin' || r.status === 'Cuti').length;
  const tercatat = hadir + telat + izinCuti;
  const alpha = Math.max(total - tercatat, 0);
  const hadirTotal = hadir + telat;
  const pctHadir = total > 0 ? (hadirTotal / total * 100) : 0;
  const deptCount = new Set(karyawan.map(k => k.dept)).size;
  return {total, hadir, telat, alpha, pctHadir, deptCount};
}
function renderTopStats(){
  const s = computeStats();
  const safeSet = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
  safeSet('stat-total', s.total);
  safeSet('stat-hadir', s.hadir);
  safeSet('stat-telat', s.telat);
  safeSet('stat-alpha', s.alpha);
  safeSet('stat-hadir-delta', s.total ? `${(s.hadir/s.total*100).toFixed(1)}%` : '0%');
  safeSet('stat-telat-delta', s.total ? `${(s.telat/s.total*100).toFixed(1)}%` : '0%');
  safeSet('stat-alpha-delta', s.total ? `${(s.alpha/s.total*100).toFixed(1)}%` : '0%');
  safeSet('login-stat-total', s.total);
  safeSet('login-stat-pct', `${s.pctHadir.toFixed(1)}%`);
  safeSet('login-stat-dept', s.deptCount);
}

let clockedIn = false, clockedOut = false, clockInTime = null;

/* ===================== PERSISTENSI DATA (localStorage) ===================== */
const STORE_KEY = 'nexusnova_absensi_data_v1';
function saveState(){
  try{
    localStorage.setItem(STORE_KEY, JSON.stringify({
      karyawan, nextKaryawanId, riwayatLog, izinList, nextIzinId, myHistory
    }));
  }catch(e){ console.warn('Gagal menyimpan data lokal', e); }
}
function loadState(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(!raw) return;
    const d = JSON.parse(raw);
    if(d.karyawan) karyawan = d.karyawan;
    if(typeof d.nextKaryawanId==='number') nextKaryawanId = d.nextKaryawanId;
    if(d.riwayatLog) riwayatLog = d.riwayatLog;
    if(d.izinList) izinList = d.izinList;
    if(typeof d.nextIzinId==='number') nextIzinId = d.nextIzinId;
    if(d.myHistory) myHistory = d.myHistory;
    migrateLegacyDept();
  }catch(e){ console.warn('Gagal memuat data lokal', e); }
}
/* Migrasi nama departemen lama (data tersimpan sebelum daftar diperbarui) ke daftar baru */
const LEGACY_DEPT_MAP = {
  'Marketing':'Social Media Officer',
  'Engineering':'Development',
  'Finance':'HR & Finance',
  'HR':'HR & Finance',
  'Sales':'Project Manager',
  'Operasional':'Personal Assistant'
};
function migrateLegacyDept(){
  let changed = false;
  [karyawan, riwayatLog, izinList].forEach(list=>{
    if(!Array.isArray(list)) return;
    list.forEach(item=>{
      if(item && LEGACY_DEPT_MAP[item.dept]){ item.dept = LEGACY_DEPT_MAP[item.dept]; changed = true; }
    });
  });
  try{
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if(raw){
      const d = JSON.parse(raw);
      if(d.accounts){
        d.accounts.forEach(a=>{ if(LEGACY_DEPT_MAP[a.dept]){ a.dept = LEGACY_DEPT_MAP[a.dept]; changed = true; } });
        localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(d));
      }
    }
  }catch(e){ /* ignore */ }
  if(changed) saveState();
}

/* ===================== AKUN & LOGIN ===================== */
const ACCOUNTS_KEY = 'nexusnova_accounts_v1';
const SESSION_KEY = 'nexusnova_session_v1';
const ATTEND_KEY = 'nexusnova_attendance_v1';

let accounts = [];
let nextAccountId = 1;
let currentUser = null;
let attendanceData = {};

function loadAccounts(){
  try{
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if(raw){
      const d = JSON.parse(raw);
      if(d.accounts && d.accounts.length) accounts = d.accounts;
      if(typeof d.nextAccountId==='number') nextAccountId = d.nextAccountId;
    } else {
      saveAccounts();
    }
  }catch(e){ console.warn('Gagal memuat akun', e); }
}
function saveAccounts(){
  try{ localStorage.setItem(ACCOUNTS_KEY, JSON.stringify({accounts, nextAccountId})); }catch(e){ console.warn('Gagal menyimpan akun', e); }
}
function loadAttendance(){
  try{
    const raw = localStorage.getItem(ATTEND_KEY);
    attendanceData = raw ? JSON.parse(raw) : {};
  }catch(e){ attendanceData = {}; }
}
function saveAttendance(){
  try{ localStorage.setItem(ATTEND_KEY, JSON.stringify(attendanceData)); }catch(e){ console.warn('Gagal menyimpan absensi', e); }
}
function attendKey(){ return currentUser.id + '_' + todayISO(); }
function loadAttendanceForUser(){
  const rec = attendanceData[attendKey()];
  clockedIn = rec ? !!rec.clockedIn : false;
  clockedOut = rec ? !!rec.clockedOut : false;
  clockInTime = rec ? rec.clockInTime : null;
}

let regRole = 'karyawan';
function setRegRole(r){
  regRole = r;
  document.getElementById('reg-role-karyawan').classList.toggle('active', r==='karyawan');
  document.getElementById('reg-role-admin').classList.toggle('active', r==='admin');
  document.getElementById('reg-admin-code-wrap').style.display = (r==='admin') ? 'block' : 'none';
}
function showRegister(){
  document.getElementById('login-form-wrap').style.display = 'none';
  document.getElementById('register-form-wrap').style.display = 'block';
}
function showLoginForm(){
  document.getElementById('register-form-wrap').style.display = 'none';
  document.getElementById('login-form-wrap').style.display = 'block';
}
function showFormError(id, msg){
  const el = document.getElementById(id);
  el.textContent = msg;
  el.style.display = 'block';
}
function hideFormError(id){ document.getElementById(id).style.display = 'none'; }

function doRegister(){
  const nama = document.getElementById('reg-nama').value.trim();
  const jabatan = document.getElementById('reg-jabatan').value.trim();
  const dept = document.getElementById('reg-dept').value;
  const email = document.getElementById('reg-email').value.trim().toLowerCase();
  const pass = document.getElementById('reg-pass').value;
  const pass2 = document.getElementById('reg-pass2').value;

  if(!nama || !jabatan || !email || !pass){ showFormError('register-error','Semua kolom wajib diisi.'); return; }
  if(!/^\S+@\S+\.\S+$/.test(email)){ showFormError('register-error','Format email tidak valid.'); return; }
  if(pass.length < 6){ showFormError('register-error','Kata sandi minimal 6 karakter.'); return; }
  if(pass !== pass2){ showFormError('register-error','Konfirmasi kata sandi tidak cocok.'); return; }
  if(accounts.some(a=>a.email===email)){ showFormError('register-error','Email sudah terdaftar. Silakan masuk.'); return; }
  if(regRole === 'admin'){
    const adminCode = document.getElementById('reg-admin-code').value.trim();
    if(adminCode !== 'Nexus2025'){ showFormError('register-error','Kode pendaftaran Admin/HR salah.'); return; }
  }

  hideFormError('register-error');
  const acc = {id: nextAccountId++, nama, email, password: pass, role: regRole, jabatan, dept};
  accounts.push(acc);
  saveAccounts();
  karyawan.push({id: nextKaryawanId++, nama, jabatan, dept, email, jam:'08.00 – 17.00', status:'Aktif'});
  saveState();
  showToast('Akun berhasil dibuat. Selamat datang, '+nama+'!');
  loginAsAccount(acc);
}

function doLogin(){
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const pass = document.getElementById('login-pass').value;
  if(!email || !pass){ showFormError('login-error','Masukkan email dan kata sandi.'); return; }
  const acc = accounts.find(a=>a.email===email && a.password===pass);
  if(!acc){ showFormError('login-error','Email atau kata sandi salah.'); return; }
  hideFormError('login-error');
  loginAsAccount(acc);
}

function renderUserAvatar(){
  const el = document.getElementById('user-av');
  if(!el || !currentUser) return;
  el.innerHTML = currentUser.foto
    ? `<img src="${currentUser.foto}" alt="Foto profil">`
    : initials(currentUser.nama);
}

/* ===================== FOTO PROFIL ===================== */
let avatarPendingDataUrl = null;
function openAvatarModal(){
  if(!currentUser) return;
  avatarPendingDataUrl = currentUser.foto || null;
  renderAvatarPreview();
  document.getElementById('modal-avatar').classList.add('active');
}
function closeAvatarModal(){
  document.getElementById('modal-avatar').classList.remove('active');
  document.getElementById('avatar-file-input').value = '';
  avatarPendingDataUrl = null;
}
function renderAvatarPreview(){
  const preview = document.getElementById('avatar-preview');
  const removeBtn = document.getElementById('avatar-remove-btn');
  if(avatarPendingDataUrl){
    preview.innerHTML = `<img src="${avatarPendingDataUrl}" alt="Pratinjau foto">`;
    removeBtn.style.display = 'inline-block';
  } else {
    preview.innerHTML = currentUser ? initials(currentUser.nama) : '';
    removeBtn.style.display = 'none';
  }
}
function handleAvatarFile(event){
  const file = event.target.files && event.target.files[0];
  if(!file) return;
  if(!file.type.startsWith('image/')){ showToast('File harus berupa gambar'); return; }
  if(file.size > 8 * 1024 * 1024){ showToast('Ukuran foto maksimal 8MB'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const size = 320;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      avatarPendingDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      renderAvatarPreview();
    };
    img.onerror = () => showToast('Gagal memuat gambar');
    img.src = e.target.result;
  };
  reader.onerror = () => showToast('Gagal membaca file');
  reader.readAsDataURL(file);
}
function removeAvatarPhoto(){
  avatarPendingDataUrl = null;
  renderAvatarPreview();
}
function saveAvatarPhoto(){
  if(!currentUser) return;
  currentUser.foto = avatarPendingDataUrl || null;
  const idx = accounts.findIndex(a => a.id === currentUser.id);
  if(idx !== -1) accounts[idx].foto = currentUser.foto;
  saveAccounts();
  renderUserAvatar();
  closeAvatarModal();
  showToast(currentUser.foto ? 'Foto profil berhasil diperbarui' : 'Foto profil dihapus');
}

/* ===================== PENGATURAN: METODE ABSENSI ===================== */
const SETTINGS_KEY = 'nexusnova_settings_v1';
let appSettings = {
  gpsValidation: 'aktif',
  gpsRadius: 100,
  kantorLat: null,
  kantorLng: null,
  selfieMode: 'wajib',
  notifTerlambat: 'atasan_hr'
};
function loadSettings(){
  try{
    const raw = localStorage.getItem(SETTINGS_KEY);
    if(raw) appSettings = Object.assign({}, appSettings, JSON.parse(raw));
  }catch(e){ console.warn('Gagal memuat pengaturan absensi', e); }
}
function saveSettingsToStorage(){
  try{ localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings)); }catch(e){ console.warn('Gagal menyimpan pengaturan absensi', e); }
}
function applySettingsToUI(){
  const gpsSel = document.getElementById('set-gps');
  if(!gpsSel) return; // panel hanya ada untuk admin
  gpsSel.value = appSettings.gpsValidation;
  document.getElementById('set-gps-radius').value = appSettings.gpsRadius;
  document.getElementById('set-selfie').value = appSettings.selfieMode;
  document.getElementById('set-notif').value = appSettings.notifTerlambat;
  updateKantorLokasiLabel();
  toggleGpsFields();
}
function toggleGpsFields(){
  const gpsSel = document.getElementById('set-gps');
  const extra = document.getElementById('gps-extra-fields');
  if(!gpsSel || !extra) return;
  extra.style.display = gpsSel.value === 'aktif' ? 'block' : 'none';
}
function updateKantorLokasiLabel(){
  const label = document.getElementById('kantor-lokasi-label');
  if(!label) return;
  if(appSettings.kantorLat != null && appSettings.kantorLng != null){
    label.textContent = `${appSettings.kantorLat.toFixed(5)}, ${appSettings.kantorLng.toFixed(5)}`;
    label.style.color = 'var(--paper-ink)';
  } else {
    label.textContent = 'Belum diatur';
    label.style.color = 'var(--paper-ink-dim)';
  }
}
function geoErrorMessage(err){
  switch(err.code){
    case err.PERMISSION_DENIED: return 'izin lokasi ditolak';
    case err.POSITION_UNAVAILABLE: return 'lokasi tidak tersedia';
    case err.TIMEOUT: return 'waktu habis mengambil lokasi';
    default: return 'kesalahan tidak diketahui';
  }
}
function setKantorLokasi(){
  if(!navigator.geolocation){ showToast('Perangkat/browser ini tidak mendukung GPS'); return; }
  showToast('Mengambil lokasi Anda saat ini...');
  navigator.geolocation.getCurrentPosition(
    pos => {
      appSettings.kantorLat = pos.coords.latitude;
      appSettings.kantorLng = pos.coords.longitude;
      updateKantorLokasiLabel();
      showToast('Titik lokasi kantor berhasil diatur');
    },
    err => showToast('Gagal mengambil lokasi: ' + geoErrorMessage(err)),
    {enableHighAccuracy:true, timeout:10000}
  );
}
function saveMetodeAbsensi(){
  appSettings.gpsValidation = document.getElementById('set-gps').value;
  appSettings.gpsRadius = Math.max(10, Number(document.getElementById('set-gps-radius').value) || 100);
  appSettings.selfieMode = document.getElementById('set-selfie').value;
  appSettings.notifTerlambat = document.getElementById('set-notif').value;
  saveSettingsToStorage();
  showToast('Metode absensi berhasil diperbarui');
}
function distanceMeters(lat1, lng1, lat2, lng2){
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function checkLocationStatus(){
  return new Promise(resolve=>{
    if(appSettings.gpsValidation !== 'aktif'){ resolve({status:'unknown', distance:null}); return; }
    if(appSettings.kantorLat == null || appSettings.kantorLng == null){ resolve({status:'unknown', distance:null}); return; }
    if(!navigator.geolocation){ resolve({status:'unknown', distance:null}); return; }
    showToast('Memeriksa lokasi Anda...');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const dist = distanceMeters(pos.coords.latitude, pos.coords.longitude, appSettings.kantorLat, appSettings.kantorLng);
        resolve({status: dist <= appSettings.gpsRadius ? 'office' : 'remote', distance: dist});
      },
      err => {
        showToast('Lokasi tidak dapat diverifikasi (' + geoErrorMessage(err) + ')');
        resolve({status:'unknown', distance:null});
      },
      {enableHighAccuracy:true, timeout:10000}
    );
  });
}

/* ===================== FOTO SELFIE SAAT ABSEN (hanya untuk absen dari luar kantor) ===================== */
let pendingClockInSelfie = null;
let pendingClockInLocation = null;
function resizeImageFile(file, targetSize, callback){
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetSize; canvas.height = targetSize;
      const ctx = canvas.getContext('2d');
      const scale = Math.max(targetSize / img.width, targetSize / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (targetSize - w) / 2, (targetSize - h) / 2, w, h);
      callback(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => showToast('Gagal memuat gambar');
    img.src = e.target.result;
  };
  reader.onerror = () => showToast('Gagal membaca file');
  reader.readAsDataURL(file);
}
function openSelfieModal(loc){
  pendingClockInSelfie = null;
  document.getElementById('selfie-preview').innerHTML = `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7l1.5-3h5L16 7"/><circle cx="12" cy="13.5" r="3.5"/></svg>`;
  const sub = document.getElementById('selfie-modal-sub');
  const confirmBtn = document.getElementById('selfie-confirm-btn');
  const locNote = (loc && loc.status === 'remote')
    ? `Anda terdeteksi berada di luar radius kantor (±${Math.round(loc.distance)}m). `
    : 'Lokasi Anda tidak dapat dipastikan berada di kantor. ';
  if(appSettings.selfieMode === 'wajib'){
    sub.textContent = locNote + 'Foto selfie wajib diambil sebagai verifikasi absen.';
    confirmBtn.classList.add('btn-disabled');
  } else {
    sub.textContent = locNote + 'Foto selfie opsional — tekan Konfirmasi untuk melewati.';
    confirmBtn.classList.remove('btn-disabled');
  }
  document.getElementById('modal-selfie').classList.add('active');
}
function closeSelfieModal(){
  document.getElementById('modal-selfie').classList.remove('active');
  document.getElementById('selfie-file-input').value = '';
  pendingClockInSelfie = null;
}
function handleSelfieFile(event){
  const file = event.target.files && event.target.files[0];
  if(!file) return;
  if(!file.type.startsWith('image/')){ showToast('File harus berupa gambar'); return; }
  resizeImageFile(file, 480, dataUrl => {
    pendingClockInSelfie = dataUrl;
    document.getElementById('selfie-preview').innerHTML = `<img src="${dataUrl}" alt="Foto selfie">`;
    document.getElementById('selfie-confirm-btn').classList.remove('btn-disabled');
  });
}
function confirmSelfieAndClockIn(){
  if(appSettings.selfieMode === 'wajib' && !pendingClockInSelfie){
    showToast('Ambil foto selfie terlebih dahulu');
    return;
  }
  const selfie = pendingClockInSelfie;
  const loc = pendingClockInLocation;
  document.getElementById('modal-selfie').classList.remove('active');
  document.getElementById('selfie-file-input').value = '';
  pendingClockInSelfie = null;
  finalizeClockIn(selfie, loc);
}

function loginAsAccount(acc){
  currentUser = acc;
  try{ localStorage.setItem(SESSION_KEY, JSON.stringify({id: acc.id})); }catch(e){}
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('user-name').textContent = acc.nama;
  document.getElementById('user-role').textContent = acc.jabatan;
  renderUserAvatar();
  document.getElementById('ci-name').textContent = acc.nama;
  document.getElementById('ci-name2').textContent = acc.nama;
  document.querySelectorAll('.nav-item[data-view="karyawan"], .nav-item[data-view="riwayat"], .nav-item[data-view="pengaturan"]').forEach(b=>{
    b.style.display = acc.role === 'admin' ? '' : 'none';
  });
  goView('dashboard');
  loadAttendanceForUser();
  renderAll();
  resetIdleTimer();
}

function doLogout(){
  currentUser = null;
  stopIdleTimer();
  try{ localStorage.removeItem(SESSION_KEY); }catch(e){}
  try{ localStorage.removeItem(LAST_ACTIVITY_KEY); }catch(e){}
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  showLoginForm();
  document.getElementById('login-email').value = '';
  document.getElementById('login-pass').value = '';
}

/* ===================== AUTO-LOGOUT KARENA TIDAK AKTIF (IDLE TIMEOUT) ===================== */
const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 menit tidak aktif -> logout otomatis
const LAST_ACTIVITY_KEY = 'nexusnova_last_activity_v1';
let idleTimer = null;

function recordActivity(){
  try{ localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now())); }catch(e){}
}
function resetIdleTimer(){
  if(!currentUser) return;
  recordActivity();
  clearTimeout(idleTimer);
  idleTimer = setTimeout(handleIdleLogout, IDLE_TIMEOUT_MS);
}
function stopIdleTimer(){
  clearTimeout(idleTimer);
  idleTimer = null;
}
function handleIdleLogout(){
  if(!currentUser) return;
  doLogout();
  showToast('Sesi berakhir karena tidak aktif selama 15 menit. Silakan masuk kembali.');
}
// Kalau tab sempat ditinggal/di-background lalu dibuka lagi, cek apakah sudah lewat 15 menit sejak aktivitas terakhir
function checkIdleOnResume(){
  if(!currentUser) return;
  try{
    const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
    const last = raw ? Number(raw) : null;
    if(last && !isNaN(last) && (Date.now() - last) >= IDLE_TIMEOUT_MS){
      handleIdleLogout();
      return;
    }
  }catch(e){}
  resetIdleTimer();
}
['mousemove','mousedown','keydown','scroll','touchstart','click'].forEach(evt=>{
  document.addEventListener(evt, resetIdleTimer, {passive:true});
});
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'visible') checkIdleOnResume();
});

function tryAutoLogin(){
  try{
    const raw = localStorage.getItem(SESSION_KEY);
    if(!raw) return false;
    const s = JSON.parse(raw);
    const acc = accounts.find(a=>a.id===s.id);
    if(!acc) return false;
    loginAsAccount(acc);
    checkIdleOnResume(); // koreksi timer jika ternyata sudah lama tidak aktif sebelum halaman dimuat ulang
    return true;
  }catch(e){ return false; }
}

/* ===================== NAV ===================== */
const titles = {
  dashboard: ['Dashboard', 'Ringkasan kehadiran tim hari ini'],
  absensi: ['Absen Saya', 'Catat kehadiran dan lihat riwayat absensi Anda'],
  karyawan: ['Data Karyawan', 'Kelola informasi seluruh karyawan'],
  riwayat: ['Riwayat & Laporan', 'Telusuri dan ekspor data kehadiran'],
  izin: ['Pengajuan Izin/Cuti', 'Ajukan dan pantau status permohonan'],
  pengaturan: ['Pengaturan Jam Kerja', 'Atur kebijakan dan metode absensi'],
};
function goView(name){
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active', b.dataset.view===name));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+name).classList.add('active');
  document.getElementById('topbar-title').textContent = titles[name][0];
  document.getElementById('topbar-sub').textContent = titles[name][1];
  closeSidebar();
  window.scrollTo({top:0, behavior:'instant' in window ? 'instant' : 'auto'});
}

/* ===================== MOBILE SIDEBAR DRAWER ===================== */
function openSidebar(){
  const sb = document.getElementById('sidebar');
  const bd = document.getElementById('sidebar-backdrop');
  if(!sb) return;
  sb.classList.add('open');
  if(bd) bd.classList.add('show');
  document.body.classList.add('no-scroll');
}
function closeSidebar(){
  const sb = document.getElementById('sidebar');
  const bd = document.getElementById('sidebar-backdrop');
  if(!sb) return;
  sb.classList.remove('open');
  if(bd) bd.classList.remove('show');
  document.body.classList.remove('no-scroll');
}
/* Close drawer automatically if user resizes back to desktop width */
window.addEventListener('resize', ()=>{
  if(window.innerWidth > 760) closeSidebar();
});

/* ===================== CLOCK ===================== */
function pad(n){return n.toString().padStart(2,'0');}
function tick(){
  const now = new Date();
  const t = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const d = now.toLocaleDateString('id-ID', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
  document.getElementById('live-time').textContent = t;
  document.getElementById('live-date').textContent = d;
  document.getElementById('ci-clock').textContent = t;
  document.getElementById('ci-date').textContent = d;
  document.getElementById('ci-clock2').textContent = t;
  document.getElementById('ci-date2').textContent = d;
}
setInterval(tick, 1000); tick();

function renderCheckinStatus(){
  let html = '';
  if(!clockedIn){
    html = `<div class="pill"><span class="dot" style="background:var(--ink-2)"></span> Belum absen masuk</div>`;
  } else if(clockedIn && !clockedOut){
    html = `<div class="pill"><span class="dot" style="background:var(--teal)"></span> Masuk pukul ${clockInTime}</div><div class="pill"><span class="dot" style="background:var(--amber)"></span> Sedang bekerja</div>`;
  } else {
    html = `<div class="pill"><span class="dot" style="background:var(--teal)"></span> Masuk ${clockInTime}</div><div class="pill"><span class="dot" style="background:var(--teal)"></span> Pulang tercatat</div>`;
  }
  if(currentUser && clockedIn){
    const rec = attendanceData[attendKey()];
    if(rec && rec.lokasi === 'remote'){
      html += `<div class="pill"><span class="dot" style="background:var(--rose)"></span> Absen dari luar kantor</div>`;
    }
    if(rec && rec.selfie){
      html += `<div class="pill"><span class="dot" style="background:var(--teal)"></span> Foto absen tersimpan</div>`;
    }
  }
  document.getElementById('ci-status-row').innerHTML = html;
  document.getElementById('ci-status-row2').innerHTML = html;
  const btnIn=[document.getElementById('btn-clockin'),document.getElementById('btn-clockin2')];
  const btnOut=[document.getElementById('btn-clockout'),document.getElementById('btn-clockout2')];
  btnIn.forEach(b=>b.classList.toggle('btn-disabled', clockedIn));
  btnOut.forEach(b=>b.classList.toggle('btn-disabled', !clockedIn || clockedOut));
}
function clockIn(){
  if(!currentUser || clockedIn) return;
  checkLocationStatus().then(loc=>{
    pendingClockInLocation = loc;
    if(loc.status === 'office' || appSettings.selfieMode === 'tidak'){
      finalizeClockIn(null, loc);
    } else {
      openSelfieModal(loc);
    }
  });
}
function finalizeClockIn(selfieDataUrl, loc){
  const now = new Date();
  clockInTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  clockedIn = true;

  const namaUser = currentUser.nama;
  const deptUser = currentUser.dept;
  const tglHariIni = fmtTgl(0);
  const batasTerlambat = 8*60 + 15; // 08:15
  const menitMasuk = now.getHours()*60 + now.getMinutes();
  const statusHariIni = menitMasuk > batasTerlambat ? 'Terlambat' : 'Hadir';

  // riwayat absensi pribadi
  myHistory.unshift({tgl: tglHariIni, status: statusHariIni, masuk: clockInTime, pulang: '-', durasi: '-'});

  // log absensi global (riwayat & laporan)
  riwayatLog.unshift({nama: namaUser, dept: deptUser, tgl: tglHariIni, status: statusHariIni, masuk: clockInTime, pulang: '-'});

  // aktivitas terbaru di dashboard
  recentActivity.unshift({nama: namaUser, dept: deptUser, status: statusHariIni, masuk: clockInTime, pulang: '-'});
  if(recentActivity.length > 8) recentActivity.pop();

  attendanceData[attendKey()] = {
    clockedIn, clockedOut, clockInTime,
    selfie: selfieDataUrl || null,
    lokasi: loc ? loc.status : 'unknown',
    jarak: (loc && loc.distance != null) ? Math.round(loc.distance) : null
  };
  saveAttendance();
  pendingClockInLocation = null;

  renderCheckinStatus();
  renderMyHistory();
  renderRiwayat();
  renderRecentActivity();
  renderTopStats();
  saveState();
  showToast('Absen masuk berhasil dicatat pukul '+clockInTime);

  if(statusHariIni === 'Terlambat' && appSettings.notifTerlambat !== 'off'){
    const target = appSettings.notifTerlambat === 'hr' ? 'HR' : 'Atasan & HR';
    setTimeout(()=>showToast(`Notifikasi keterlambatan dikirim ke ${target}`), 1700);
  }
}
function clockOut(){
  if(!currentUser || !clockedIn || clockedOut) return;
  const now = new Date();
  const pulangTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  clockedOut = true;

  // hitung durasi kerja
  const [jm,mm] = clockInTime.split(':').map(Number);
  let totalMenit = (now.getHours()*60+now.getMinutes()) - (jm*60+mm);
  if(totalMenit < 0) totalMenit = 0;
  const durasi = `${Math.floor(totalMenit/60)}j ${pad(totalMenit%60)}m`;

  const tglHariIni = fmtTgl(0);
  // update entri hari ini di riwayat pribadi
  const myEntry = myHistory.find(h => h.tgl === tglHariIni);
  if(myEntry){ myEntry.pulang = pulangTime; myEntry.durasi = durasi; }

  // update entri hari ini di log global
  const namaUser = currentUser.nama;
  const logEntry = riwayatLog.find(r => r.tgl === tglHariIni && r.nama === namaUser);
  if(logEntry) logEntry.pulang = pulangTime;

  // update aktivitas terbaru
  const actEntry = recentActivity.find(r => r.nama === namaUser && r.pulang === '-');
  if(actEntry) actEntry.pulang = pulangTime;

  attendanceData[attendKey()] = {clockedIn, clockedOut, clockInTime};
  saveAttendance();

  renderCheckinStatus();
  renderMyHistory();
  renderRiwayat();
  renderRecentActivity();
  renderTopStats();
  saveState();
  showToast('Absen pulang berhasil dicatat. Sampai jumpa besok!');
}

/* ===================== RENDER: DASHBOARD ===================== */
function renderRecentActivity(){
  document.getElementById('recent-activity-body').innerHTML = recentActivity.map(r=>`
    <tr class="tbl-hover">
      <td><div class="av-name"><div class="av-circ">${avatarHTML(r.nama)}</div><div><div class="nm">${r.nama}</div><div class="role">${r.dept}</div></div></div></td>
      <td>${statusBadge(r.status)}</td>
      <td class="mono">${r.masuk}</td>
      <td class="mono">${r.pulang}</td>
    </tr>`).join('');
}
function renderDeptBars(){
  const colors = ['#0d9488','#4f46e5','#b07b0a','#0d9488','#475569'];
  document.getElementById('dept-bars').innerHTML = deptStats.map((d,i)=>`
    <div class="bar-row">
      <div class="lbl">${d.name}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${d.pct}%;background:${colors[i%colors.length]}"></div></div>
      <div class="num">${d.pct}%</div>
    </div>`).join('');
}
function renderPending(){
  const isAdmin = currentUser && currentUser.role==='admin';
  const pending = isAdmin ? izinList.filter(i=>i.status==='Menunggu') : izinList.filter(i=>i.userId===(currentUser?currentUser.id:null) && i.status==='Menunggu');
  if(pending.length===0){
    document.getElementById('pending-list').innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg><p>Tidak ada pengajuan menunggu</p></div>`;
    return;
  }
  document.getElementById('pending-list').innerHTML = pending.map(p=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid var(--paper-border);gap:10px">
      <div style="min-width:0">
        <div style="font-size:13.5px;font-weight:600">${p.jenis}${isAdmin?` <span style="font-weight:400;color:var(--paper-ink-dim)">— ${p.nama}</span>`:''}</div>
        <div style="font-size:11.5px;color:var(--paper-ink-dim)">${p.tgl}</div>
      </div>
      ${isAdmin
        ? `<div style="display:flex;gap:6px;flex-shrink:0">
             <button class="btn-sec" style="padding:6px 10px;color:#0d9488" onclick="approveIzin(${p.id})">Setujui</button>
             <button class="btn-sec" style="padding:6px 10px;color:#e11d48" onclick="rejectIzin(${p.id})">Tolak</button>
           </div>`
        : statusBadge('Izin')}
    </div>`).join('');
}

/* ===================== APPROVAL IZIN (ADMIN) ===================== */
// Menulis pengajuan izin/cuti yang disetujui ke riwayat absensi & status karyawan,
// supaya benar-benar tercatat (bukan cuma berubah status di daftar pengajuan).
function applyIzinToRiwayat(item){
  const dates = dateRangeISO(item.mulai, item.selesai);
  if(dates.length===0) return;
  const status = izinStatusFor(item.jenis);
  dates.forEach(iso=>{
    const tglStr = fmtTglISO(iso);
    let entry = riwayatLog.find(r => r.nama===item.nama && r.tgl===tglStr);
    if(entry){
      entry.status = status;
      entry.izinId = item.id;
    } else {
      riwayatLog.unshift({nama:item.nama, dept:item.dept, tgl:tglStr, status, masuk:'-', pulang:'-', izinId:item.id});
    }
  });
  if(dates.includes(todayISO())){
    const k = karyawan.find(x=>x.nama===item.nama);
    if(k) k.status = status;
  }
}
function removeIzinFromRiwayat(item){
  riwayatLog = riwayatLog.filter(r => r.izinId !== item.id);
  const dates = dateRangeISO(item.mulai, item.selesai);
  if(dates.includes(todayISO())){
    const k = karyawan.find(x=>x.nama===item.nama);
    if(k && k.status !== 'Aktif') k.status = 'Aktif';
  }
}
function approveIzin(id){
  const item = izinList.find(i=>i.id===id);
  if(!item) return;
  item.status = 'Disetujui';
  applyIzinToRiwayat(item);
  renderIzin();
  renderPending();
  renderRiwayat();
  renderKaryawan();
  renderTopStats();
  saveState();
  showToast(`Pengajuan ${item.jenis} dari ${item.nama} disetujui`);
}
function rejectIzin(id){
  const item = izinList.find(i=>i.id===id);
  if(!item) return;
  item.status = 'Ditolak';
  removeIzinFromRiwayat(item);
  renderIzin();
  renderPending();
  renderRiwayat();
  renderKaryawan();
  renderTopStats();
  saveState();
  showToast(`Pengajuan ${item.jenis} dari ${item.nama} ditolak`);
}
function batalkanPersetujuanIzin(id){
  const item = izinList.find(i=>i.id===id);
  if(!item) return;
  item.status = 'Menunggu';
  removeIzinFromRiwayat(item);
  renderIzin();
  renderPending();
  renderRiwayat();
  renderKaryawan();
  renderTopStats();
  saveState();
  showToast(`Keputusan untuk pengajuan ${item.jenis} dari ${item.nama} dibatalkan, kembali Menunggu`);
}

/* ===================== RENDER: ABSENSI SAYA ===================== */
function renderMyHistory(){
  document.getElementById('my-history-body').innerHTML = myHistory.map(h=>`
    <tr class="tbl-hover"><td>${h.tgl}</td><td>${statusBadge(h.status)}</td><td class="mono">${h.masuk}</td><td class="mono">${h.pulang}</td><td class="mono">${h.durasi}</td></tr>
  `).join('');
}

/* ===================== RENDER: KARYAWAN ===================== */
function renderKaryawan(){
  const q = (document.getElementById('kry-search').value||'').toLowerCase();
  const dept = document.getElementById('kry-dept-filter').value;
  const filtered = karyawan.filter(k =>
    (k.nama.toLowerCase().includes(q) || k.jabatan.toLowerCase().includes(q)) &&
    (!dept || k.dept === dept)
  );
  const body = document.getElementById('karyawan-body');
  if(filtered.length===0){
    body.innerHTML = `<tr><td colspan="6"><div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg><p>Tidak ada karyawan yang cocok dengan pencarian</p></div></td></tr>`;
    return;
  }
  body.innerHTML = filtered.map(k=>`
    <tr class="tbl-hover">
      <td><div class="av-name"><div class="av-circ">${avatarHTML(k.nama, k.email)}</div><div><div class="nm">${k.nama}</div><div class="role">${k.jabatan}</div></div></div></td>
      <td>${k.dept}</td>
      <td style="color:var(--paper-ink-dim)">${k.email}</td>
      <td class="mono">${k.jam}</td>
      <td>${k.status==='Aktif' ? `<span class="badge b-hadir"><span class="dot"></span>Aktif</span>` : `<span class="badge b-cuti"><span class="dot"></span>${k.status}</span>`}</td>
      <td><div style="display:flex;gap:6px"><button class="btn-sec" style="padding:7px 11px" onclick="openEditKaryawan(${k.id})">Ubah</button><button class="btn-sec" style="padding:7px 11px" onclick="deleteKaryawan(${k.id})">Hapus</button></div></td>
    </tr>`).join('');
}
let editingKaryawanId = null;
let karyawanFotoPendingUrl = null;
function renderKaryawanFotoPreview(namaForInitials){
  const preview = document.getElementById('m-foto-preview');
  const removeBtn = document.getElementById('m-foto-remove-btn');
  if(karyawanFotoPendingUrl){
    preview.innerHTML = `<img src="${karyawanFotoPendingUrl}" alt="Pratinjau foto">`;
    removeBtn.style.display = 'inline-block';
  } else {
    preview.innerHTML = namaForInitials ? initials(namaForInitials) : '';
    removeBtn.style.display = 'none';
  }
}
function handleKaryawanFotoFile(event){
  const file = event.target.files && event.target.files[0];
  if(!file) return;
  if(!file.type.startsWith('image/')){ showToast('File harus berupa gambar'); return; }
  if(file.size > 8 * 1024 * 1024){ showToast('Ukuran foto maksimal 8MB'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const size = 320;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      karyawanFotoPendingUrl = canvas.toDataURL('image/jpeg', 0.85);
      renderKaryawanFotoPreview(document.getElementById('m-nama').value);
    };
    img.onerror = () => showToast('Gagal memuat gambar');
    img.src = e.target.result;
  };
  reader.onerror = () => showToast('Gagal membaca file');
  reader.readAsDataURL(file);
}
function removeKaryawanFotoPreview(){
  karyawanFotoPendingUrl = null;
  renderKaryawanFotoPreview(document.getElementById('m-nama').value);
}
function openAddKaryawan(){
  editingKaryawanId = null;
  karyawanFotoPendingUrl = null;
  document.getElementById('modal-title').textContent = 'Tambah Karyawan';
  ['m-nama','m-jabatan','m-email'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('m-dept').value = 'Founder';
  document.getElementById('m-jam').value = '08.00 – 17.00';
  document.getElementById('m-foto-input').value = '';
  renderKaryawanFotoPreview('');
  document.getElementById('modal-karyawan').classList.add('active');
}
function openEditKaryawan(id){
  const k = karyawan.find(x=>x.id===id);
  if(!k) return;
  editingKaryawanId = id;
  karyawanFotoPendingUrl = k.foto || null;
  document.getElementById('modal-title').textContent = 'Ubah Data Karyawan';
  document.getElementById('m-nama').value = k.nama;
  document.getElementById('m-jabatan').value = k.jabatan;
  document.getElementById('m-dept').value = k.dept;
  document.getElementById('m-email').value = k.email;
  document.getElementById('m-jam').value = k.jam;
  document.getElementById('m-foto-input').value = '';
  renderKaryawanFotoPreview(k.nama);
  document.getElementById('modal-karyawan').classList.add('active');
}
function closeModal(){ document.getElementById('modal-karyawan').classList.remove('active'); editingKaryawanId = null; karyawanFotoPendingUrl = null; }
function saveKaryawan(){
  const nama = document.getElementById('m-nama').value.trim();
  const jabatan = document.getElementById('m-jabatan').value.trim();
  if(!nama || !jabatan){ showToast('Nama dan jabatan wajib diisi'); return; }
  const dept = document.getElementById('m-dept').value;
  const email = document.getElementById('m-email').value.trim() || `${nama.split(' ')[0].toLowerCase()}@nexusnova.id`;
  const jam = document.getElementById('m-jam').value || '08.00 – 17.00';
  const foto = karyawanFotoPendingUrl || null;
  if(editingKaryawanId){
    const k = karyawan.find(x=>x.id===editingKaryawanId);
    if(k){ k.nama=nama; k.jabatan=jabatan; k.dept=dept; k.email=email; k.jam=jam; k.foto=foto; }
    // sinkronkan ke akun terkait (kalau karyawan ini juga punya akun login) supaya foto konsisten di mana saja
    const acc = accounts.find(a=>a.email===email);
    if(acc){ acc.foto = foto; saveAccounts(); if(currentUser && currentUser.email===email){ currentUser.foto = foto; renderUserAvatar(); } }
    closeModal();
    renderKaryawan();
    renderRiwayat();
    renderTopStats();
    saveState();
    showToast(`${nama} berhasil diperbarui`);
    return;
  }
  karyawan.push({
    id: nextKaryawanId++, nama, jabatan, dept, email, jam, foto,
    status: 'Aktif'
  });
  closeModal();
  renderKaryawan();
  renderTopStats();
  saveState();
  showToast(`${nama} berhasil ditambahkan`);
}
function deleteKaryawan(id){
  const k = karyawan.find(x=>x.id===id);
  karyawan = karyawan.filter(x=>x.id!==id);
  renderKaryawan();
  renderTopStats();
  saveState();
  showToast(`${k.nama} dihapus dari daftar karyawan`);
}

/* ===================== RENDER: RIWAYAT ===================== */
function getFilteredRiwayat(){
  const status = document.getElementById('rw-status').value;
  const dept = document.getElementById('rw-dept').value;
  return riwayatLog.filter(r => (!status || r.status===status) && (!dept || r.dept===dept));
}
function renderRiwayat(){
  const filtered = getFilteredRiwayat();
  document.getElementById('rw-count').textContent = `${filtered.length} entri ditemukan`;
  const body = document.getElementById('riwayat-body');
  if(filtered.length===0){
    body.innerHTML = `<tr><td colspan="6"><div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/></svg><p>Tidak ada data untuk filter ini</p></div></td></tr>`;
    return;
  }
  body.innerHTML = filtered.map(r=>`
    <tr class="tbl-hover">
      <td><div class="av-name"><div class="av-circ">${avatarHTML(r.nama)}</div><div class="nm">${r.nama}</div></div></td>
      <td>${r.dept}</td><td>${r.tgl}</td><td>${statusBadge(r.status)}</td>
      <td class="mono">${r.masuk}</td><td class="mono">${r.pulang}</td>
    </tr>`).join('');
}
function csvEscape(val){
  const s = String(val ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}
function exportRiwayatCSV(){
  const filtered = getFilteredRiwayat();
  if(filtered.length===0){ showToast('Tidak ada data untuk diekspor'); return; }
  const header = ['Karyawan','Departemen','Tanggal','Status','Masuk','Pulang'];
  const rows = filtered.map(r => [r.nama, r.dept, r.tgl, r.status, r.masuk, r.pulang]);
  const csv = [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `riwayat-absensi-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Laporan berhasil diunduh (${filtered.length} entri)`);
}

/* ===================== RENDER: IZIN ===================== */
function renderIzin(){
  const isAdmin = currentUser && currentUser.role==='admin';
  const list = isAdmin ? izinList : izinList.filter(i=>i.userId===(currentUser?currentUser.id:null));
  const titleEl = document.querySelector('#view-izin .row-2 > div:last-child .panel-head h3');
  if(titleEl) titleEl.textContent = isAdmin ? 'Semua Pengajuan Izin/Cuti' : 'Riwayat Pengajuan';

  if(list.length===0){
    document.getElementById('izin-list').innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg><p>Belum ada pengajuan</p></div>`;
    return;
  }
  document.getElementById('izin-list').innerHTML = list.map(i=>{
    const map = {Menunggu:'b-telat', Disetujui:'b-hadir', Ditolak:'b-alpha'};
    let actions = `<span class="badge ${map[i.status]}"><span class="dot"></span>${i.status}</span>`;
    if(isAdmin){
      if(i.status==='Menunggu'){
        actions = `<div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
            <button class="btn-sec" style="padding:6px 10px;color:#0d9488" onclick="approveIzin(${i.id})">Setujui</button>
            <button class="btn-sec" style="padding:6px 10px;color:#e11d48" onclick="rejectIzin(${i.id})">Tolak</button>
          </div>`;
      } else {
        actions = `<div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
            <span class="badge ${map[i.status]}"><span class="dot"></span>${i.status}</span>
            <button class="btn-sec" style="padding:6px 10px" onclick="batalkanPersetujuanIzin(${i.id})">Batalkan</button>
          </div>`;
      }
    }
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--paper-border);gap:10px">
      <div style="min-width:0"><div style="font-size:13.5px;font-weight:600">${i.jenis}${isAdmin?` <span style="font-weight:400;color:var(--paper-ink-dim)">— ${i.nama}</span>`:''}</div><div style="font-size:11.5px;color:var(--paper-ink-dim)">${i.tgl} · ${i.alasan}</div></div>
      ${actions}
    </div>`;
  }).join('');
}
function submitIzin(){
  if(!currentUser){ showToast('Silakan masuk terlebih dahulu'); return; }
  const jenis = document.getElementById('izin-jenis').value;
  const mulai = document.getElementById('izin-mulai').value;
  const selesai = document.getElementById('izin-selesai').value;
  const alasan = document.getElementById('izin-alasan').value.trim() || 'Tidak ada keterangan';
  const fmt = d => new Date(d).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});
  const tglStr = mulai===selesai ? fmt(mulai) : `${fmt(mulai)} – ${fmt(selesai)}`;
  izinList.unshift({id: nextIzinId++, userId: currentUser.id, nama: currentUser.nama, dept: currentUser.dept, jenis, tgl: tglStr, mulai, selesai, alasan, status:'Menunggu'});
  renderIzin();
  renderPending();
  saveState();
  document.getElementById('izin-alasan').value='';
  showToast('Pengajuan berhasil dikirim, menunggu persetujuan');
}

/* ===================== TOAST ===================== */
let toastTimer;
function showToast(msg){
  const t = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('show'), 3200);
}

/* ===================== INIT ===================== */
function renderAll(){
  loadState();
  applySettingsToUI();
  document.getElementById('rw-date').value = todayISO();
  document.getElementById('izin-mulai').value = todayISO();
  document.getElementById('izin-selesai').value = todayISO();
  document.getElementById('rekap-bulan').textContent = new Date().toLocaleDateString('id-ID', {month:'long', year:'numeric'});
  renderCheckinStatus();
  renderRecentActivity();
  renderDeptBars();
  renderPending();
  renderMyHistory();
  renderKaryawan();
  renderRiwayat();
  renderIzin();
  renderTopStats();
}

loadAccounts();
loadAttendance();
loadState();
loadSettings();
renderTopStats();
setInterval(renderTopStats, 8000);
tryAutoLogin();

