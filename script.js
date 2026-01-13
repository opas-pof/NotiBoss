// ตัวแปรสำหรับเก็บข้อมูล
let scheduleData = [];
let notificationTimers = [];
let isRunning = false;

// DOM Elements
const scheduleInput = document.getElementById('schedule-input');
const runBtn = document.getElementById('run-btn');
const clearBtn = document.getElementById('clear-btn');
const statusMessage = document.getElementById('status-message');
const scheduleList = document.getElementById('schedule-list');

// โหลดข้อมูลจาก localStorage เมื่อโหลดหน้า
window.addEventListener('DOMContentLoaded', () => {
    loadFromLocalStorage();
    checkNotificationPermission();
});

// ฟังก์ชันตรวจสอบสิทธิ์การแจ้งเตือน
async function checkNotificationPermission() {
    if ('Notification' in window) {
        if (Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                showStatus('ได้รับสิทธิ์การแจ้งเตือนแล้ว', 'success');
            }
        }
    } else {
        showStatus('เบราว์เซอร์ของคุณไม่รองรับการแจ้งเตือน', 'error');
    }
}

// ฟังก์ชันแสดงสถานะ
function showStatus(message, type = 'info') {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    setTimeout(() => {
        statusMessage.className = 'status-message';
    }, 5000);
}

// ฟังก์ชัน Parse ข้อมูลจาก textarea
function parseSchedule(text) {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
    const schedule = [];
    let currentGroup = [];
    let groupIndex = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // ตรวจสอบว่าเป็นเส้นคั่นหรือไม่ (อาจจะมี - หลายตัว, อาจมีช่องว่าง)
        if (/^[\s-]+$/.test(line) && line.length >= 3) {
            // ถ้ามีข้อมูลในกลุ่มปัจจุบัน ให้เพิ่มบอสตัวแรกของกลุ่ม
            if (currentGroup.length > 0) {
                schedule.push(currentGroup[0]);
                currentGroup = [];
                groupIndex++;
            }
            continue;
        }

        // Parse บรรทัดที่มีข้อมูลบอส
        // รูปแบบ: 13/01/2026 08:14 น. — [60] เวนาตัส
        // หรือ: 13/01/2026 19:30–20:30 น. — Arena 5 vs 5
        // หรือ: 13/01/2026 12:29 น. — [75] อาราเนโอ(12:27 น.)
        const match = line.match(/^(\d{2}\/\d{2}\/\d{4})\s+(\d{1,2}):(\d{2})(?:\s*–\s*\d{1,2}:\d{2})?\s+น\.\s+[—–-]\s+(.+)$/);
        
        if (match) {
            const [, dateStr, hour, minute, bossInfo] = match;
            
            // Parse วันที่
            const [day, month, year] = dateStr.split('/');
            const scheduleDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
            
            // ตรวจสอบว่าเป็นวันที่ในอนาคตหรือไม่
            const now = new Date();
            if (scheduleDate <= now) {
                // ถ้าเป็นวันเดียวกันแต่เวลาผ่านไปแล้ว ให้ข้าม
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const scheduleDay = new Date(scheduleDate);
                scheduleDay.setHours(0, 0, 0, 0);
                
                if (scheduleDay.getTime() === today.getTime()) {
                    continue; // ข้ามบอสที่เวลาผ่านไปแล้วในวันนี้
                }
                // ถ้าเป็นวันอื่นที่ผ่านไปแล้ว ให้ข้าม
                if (scheduleDate < now) {
                    continue;
                }
            }

            // Parse ข้อมูลบอส
            // รูปแบบ: [60] เวนาตัส หรือ [60] เวนาตัส(12:27 น.) หรือ Arena 5 vs 5
            let bossName = bossInfo.trim();
            let bossLevel = '';
            let timeInBracketText = '';

            // ตรวจสอบว่ามีเวลาอยู่ในวงเล็บหรือไม่ (เช่น (12:27 น.) หรือ (16:51 น.))
            // เก็บไว้เพื่อแสดงพร้อมชื่อบอส แต่ไม่ใช้เป็นเวลาจริง
            const timeInBracket = bossInfo.match(/\((\d{1,2}):(\d{2})\s+น\.\)/);
            if (timeInBracket) {
                timeInBracketText = timeInBracket[0]; // เก็บ "(12:27 น.)" ไว้แสดง
                bossName = bossInfo.replace(/\s*\(\d{1,2}:\d{2}\s+น\.\)/, '').trim();
            }

            // แยก level และชื่อบอส
            const levelMatch = bossName.match(/^\[(\d+)\]\s*(.+)$/);
            if (levelMatch) {
                bossLevel = levelMatch[1];
                bossName = levelMatch[2].trim();
            }

            // ใช้เวลาหลักเท่านั้น (ไม่ใช้เวลาจากวงเล็บ)
            const notifyTime = scheduleDate;

            const bossData = {
                date: scheduleDate,
                notifyTime: notifyTime,
                bossName: bossName,
                bossLevel: bossLevel,
                timeInBracket: timeInBracketText, // เก็บเวลาจากวงเล็บไว้แสดง
                originalText: line,
                groupIndex: groupIndex
            };

            currentGroup.push(bossData);
        }
    }

    // เพิ่มบอสตัวแรกของกลุ่มสุดท้ายถ้ามี
    if (currentGroup.length > 0) {
        schedule.push(currentGroup[0]);
    }

    return schedule;
}

// ฟังก์ชันเริ่มรันการแจ้งเตือน
function startNotifications() {
    if (isRunning) {
        showStatus('กำลังรันอยู่แล้ว', 'error');
        return;
    }

    const text = scheduleInput.value.trim();
    if (!text) {
        showStatus('กรุณากรอกตารางเวลาบอส', 'error');
        return;
    }

    // Parse ข้อมูล
    scheduleData = parseSchedule(text);
    
    if (scheduleData.length === 0) {
        showStatus('ไม่พบข้อมูลบอสที่ถูกต้อง หรือเวลาทั้งหมดผ่านไปแล้ว', 'error');
        return;
    }

    // ล้าง timer เก่าทั้งหมด
    clearAllTimers();

    // เริ่มตั้ง timer สำหรับแต่ละบอส
    scheduleData.forEach((boss, index) => {
        const notifyTime = new Date(boss.notifyTime);
        const notifyBefore5Min = new Date(notifyTime.getTime() - 5 * 60 * 1000);
        const now = new Date();

        if (notifyBefore5Min > now) {
            const delay = notifyBefore5Min.getTime() - now.getTime();
            const timer = setTimeout(() => {
                sendNotification(boss);
            }, delay);
            notificationTimers.push(timer);
        } else if (notifyTime > now && notifyBefore5Min <= now) {
            // ถ้าเวลาผ่านไปแล้วแต่ยังไม่ถึงเวลาแจ้งเตือน ให้แจ้งทันที
            sendNotification(boss);
        }
    });

    isRunning = true;
    saveToLocalStorage();
    updateScheduleList();
    showStatus(`เริ่มรันการแจ้งเตือนแล้ว (${scheduleData.length} รายการ)`, 'success');
}

// ฟังก์ชันส่งการแจ้งเตือน
function sendNotification(boss) {
    if ('Notification' in window && Notification.permission === 'granted') {
        const timeStr = formatTime(boss.notifyTime);
        const bossNameText = `${boss.bossName}${boss.timeInBracket ? ` ${boss.timeInBracket}` : ''}${boss.bossLevel ? ` [${boss.bossLevel}]` : ''}`;
        const message = `บอส ${bossNameText} จะเกิดในอีก 5 นาที (${timeStr})`;
        
        new Notification('🎮 NotiBoss - แจ้งเตือนบอส', {
            body: message,
            icon: '🎮',
            badge: '🎮',
            tag: `boss-${boss.notifyTime.getTime()}`,
            requireInteraction: false
        });
    }
}

// ฟังก์ชันล้างค่าทั้งหมด
function clearAll() {
    if (confirm('ต้องการล้างค่าทั้งหมดและยกเลิกการแจ้งเตือนทั้งหมดหรือไม่?')) {
        scheduleInput.value = '';
        scheduleData = [];
        clearAllTimers();
        isRunning = false;
        localStorage.removeItem('notiboss_schedule');
        localStorage.removeItem('notiboss_input');
        updateScheduleList();
        showStatus('ล้างค่าทั้งหมดแล้ว', 'success');
    }
}

// ฟังก์ชันล้าง timer ทั้งหมด
function clearAllTimers() {
    notificationTimers.forEach(timer => clearTimeout(timer));
    notificationTimers = [];
}

// ฟังก์ชันอัปเดตรายการที่กำลังรอแจ้งเตือน
function updateScheduleList() {
    if (scheduleData.length === 0) {
        scheduleList.innerHTML = '<p class="empty-message">ยังไม่มีรายการที่กำลังรอแจ้งเตือน</p>';
        return;
    }

    const now = new Date();
    const activeSchedules = scheduleData.filter(boss => {
        const notifyTime = new Date(boss.notifyTime);
        const notifyBefore5Min = new Date(notifyTime.getTime() - 5 * 60 * 1000);
        return notifyBefore5Min > now;
    });

    if (activeSchedules.length === 0) {
        scheduleList.innerHTML = '<p class="empty-message">ไม่มีรายการที่กำลังรอแจ้งเตือน (เวลาทั้งหมดผ่านไปแล้ว)</p>';
        return;
    }

    scheduleList.innerHTML = '';
    
    // จัดกลุ่มตาม groupIndex และแสดงแค่บอสตัวแรกของแต่ละกลุ่ม
    const grouped = {};
    activeSchedules.forEach(boss => {
        if (!grouped[boss.groupIndex]) {
            grouped[boss.groupIndex] = [];
        }
        grouped[boss.groupIndex].push(boss);
    });

    Object.keys(grouped).sort((a, b) => parseInt(a) - parseInt(b)).forEach(groupKey => {
        const group = grouped[groupKey];
        // แสดงแค่บอสตัวแรกของกลุ่ม (ตามที่ parse แล้ว)
        if (group.length > 0) {
            const boss = group[0];
            const item = createScheduleItem(boss);
            scheduleList.appendChild(item);
        }
    });

    // อัปเดต countdown ทุกวินาที
    updateCountdowns();
}

// ฟังก์ชันสร้าง schedule item
function createScheduleItem(boss) {
    const item = document.createElement('div');
    item.className = 'schedule-item';
    item.dataset.notifyTime = boss.notifyTime.getTime();

    const info = document.createElement('div');
    info.className = 'schedule-item-info';

    const time = document.createElement('div');
    time.className = 'schedule-item-time';
    time.textContent = formatTime(boss.notifyTime);

    const bossName = document.createElement('div');
    bossName.className = 'schedule-item-boss';
    const bossNameText = `${boss.bossName}${boss.timeInBracket ? ` ${boss.timeInBracket}` : ''}${boss.bossLevel ? ` [${boss.bossLevel}]` : ''}`;
    bossName.textContent = bossNameText;

    const notifyTime = document.createElement('div');
    notifyTime.className = 'schedule-item-notify-time';
    notifyTime.textContent = `แจ้งเตือน: ${formatTime(new Date(boss.notifyTime.getTime() - 5 * 60 * 1000))}`;

    const countdown = document.createElement('div');
    countdown.className = 'schedule-item-countdown';
    countdown.textContent = 'กำลังคำนวณ...';

    info.appendChild(time);
    info.appendChild(bossName);
    info.appendChild(notifyTime);
    item.appendChild(info);
    item.appendChild(countdown);

    return item;
}

// ฟังก์ชันอัปเดต countdown
function updateCountdowns() {
    const items = document.querySelectorAll('.schedule-item');
    const now = new Date();

    items.forEach(item => {
        const notifyTime = parseInt(item.dataset.notifyTime);
        const notifyBefore5Min = new Date(notifyTime - 5 * 60 * 1000);
        const countdownEl = item.querySelector('.schedule-item-countdown');

        if (notifyBefore5Min <= now) {
            countdownEl.textContent = 'แจ้งเตือนแล้ว';
            countdownEl.classList.add('warning');
        } else {
            const diff = notifyBefore5Min - now;
            const minutes = Math.floor(diff / 60000);
            const seconds = Math.floor((diff % 60000) / 1000);
            countdownEl.textContent = `${minutes}:${String(seconds).padStart(2, '0')}`;
            
            if (minutes < 1) {
                countdownEl.classList.add('warning');
            } else {
                countdownEl.classList.remove('warning');
            }
        }
    });
}

// ฟังก์ชัน format เวลา
function formatTime(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hour}:${minute} น.`;
}

// ฟังก์ชันบันทึกข้อมูลลง localStorage
function saveToLocalStorage() {
    localStorage.setItem('notiboss_schedule', JSON.stringify(scheduleData));
    localStorage.setItem('notiboss_input', scheduleInput.value);
}

// ฟังก์ชันโหลดข้อมูลจาก localStorage
function loadFromLocalStorage() {
    const savedInput = localStorage.getItem('notiboss_input');
    const savedSchedule = localStorage.getItem('notiboss_schedule');

    if (savedInput) {
        scheduleInput.value = savedInput;
    }

    if (savedSchedule) {
        try {
            scheduleData = JSON.parse(savedSchedule).map(boss => ({
                ...boss,
                date: new Date(boss.date),
                notifyTime: new Date(boss.notifyTime)
            }));
            updateScheduleList();
        } catch (e) {
            console.error('Error loading schedule:', e);
        }
    }
}

// Event Listeners
runBtn.addEventListener('click', startNotifications);
clearBtn.addEventListener('click', clearAll);

// อัปเดต countdown ทุกวินาที
setInterval(() => {
    if (isRunning && scheduleData.length > 0) {
        updateCountdowns();
    }
}, 1000);
