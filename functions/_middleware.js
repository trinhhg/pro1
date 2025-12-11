// === CẤU HÌNH TELEGRAM BOT ===
const TG_BOT_TOKEN = "8317998690:AAEJ51BLc6wp2gRAiTnM2qEyB4sXHYoN7lI"; 
const TG_ADMIN_ID = "5524168349"; 
const TG_CHANNEL_NOTIFY = "3206251077"; 
const ADMIN_SECRET = "trinhhg_admin_secret_123"; 
// =============================

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);

  async function sendTelegram(chatId, msg) {
      if(!TG_BOT_TOKEN) return;
      const tgUrl = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;
      try {
          await fetch(tgUrl, {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "HTML" })
          });
      } catch(e) { console.error("Tele Error:", e); }
  }

  // --- HELPERS FORMATTING ---
  function getDeviceType(ua) {
      if (/Mobile|Android|iPhone|iPad/i.test(ua)) return "Mobile";
      return "Desktop";
  }
  function formatTime(ms) {
      const date = new Date(ms);
      // Format: HH:mm DD/MM/YYYY
      return `${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')} ${date.getDate().toString().padStart(2,'0')}/${(date.getMonth()+1).toString().padStart(2,'0')}/${date.getFullYear()}`;
  }
  function formatPackage(sec) {
      if (sec >= 86400) return `${Math.round(sec/86400)} ngày`;
      return `${sec} giây`;
  }

  // --- API VERSION CHECK ---
  if (url.pathname === "/api/version") {
      return new Response("2025.12.11.01", {status: 200}); 
  }

  // --- API ADMIN NOTIFY UPDATE ---
  if (url.pathname === "/api/notify-update") {
      const secret = url.searchParams.get("secret");
      if(secret !== ADMIN_SECRET) return new Response("Unauthorized", {status: 401});
      
      const msg = `📢 <b>THÔNG BÁO CẬP NHẬT</b>\n\nWebsite đã có bản cập nhật tính năng mới.\nVui lòng nhấn <b>F5</b> hoặc tải lại trang để sử dụng phiên bản ổn định nhất.\n\nTime: ${new Date().toLocaleString('vi-VN')}`;
      context.waitUntil(sendTelegram(TG_CHANNEL_NOTIFY, msg));
      return new Response("Notification Sent!", {status: 200});
  }

  // --- API HEARTBEAT (Kiểm tra Key ngầm) ---
  if (url.pathname === "/api/heartbeat") {
      const userKey = getCookie(request, "auth_vip");
      if(!userKey) return new Response("No Key", {status: 401});
      
      const keyVal = await env.PRO_1.get(userKey);
      if(!keyVal) return new Response("Invalid", {status: 401});
      
      try {
          const d = JSON.parse(keyVal);
          if(d.expires_at && Date.now() > d.expires_at) {
              const msg = `
⚠️ <b>KEY hết hạn!</b>
🔑 Key: <code>${userKey}</code>
⏰ Ex: ${formatTime(d.activated_at)} - ${formatTime(d.expires_at)}
`;
              context.waitUntil(sendTelegram(TG_ADMIN_ID, msg));
              return new Response("Expired", {status: 401});
          }
          return new Response("OK", {status: 200});
      } catch(e) { return new Response("Data Error", {status: 401}); }
  }

  // --- ĐĂNG XUẤT ---
  if (url.pathname === "/logout") {
      const userKey = getCookie(request, "auth_vip");
      if(userKey) {
          const ip = request.headers.get("CF-Connecting-IP") || "Unknown";
          const ua = request.headers.get("User-Agent") || "";
          // Lấy thông tin gói để hiển thị (tùy chọn, cần query KV nếu muốn chính xác tuyệt đối, ở đây giả định lấy từ cache hoặc bỏ qua chi tiết gói khi logout để nhanh)
          const msg = `
🚪 <b>BÁO CÁO ĐĂNG XUẤT</b>
🔑 Key: <code>${userKey}</code>
🌍 IP: ${ip}
📱 ${getDeviceType(ua)}
`;
          context.waitUntil(sendTelegram(TG_ADMIN_ID, msg));
      }
      return new Response(null, { 
          status: 302, 
          headers: { "Location": "/", "Set-Cookie": `auth_vip=; Path=/; HttpOnly; Secure; Max-Age=0` } 
      });
  }

  // --- XỬ LÝ ĐĂNG NHẬP (POST) ---
  if (url.pathname === "/login" && request.method === "POST") {
    try {
        const formData = await request.formData();
        const inputKey = (formData.get("secret_key") || "").trim();
        const deviceId = (formData.get("device_id") || "unknown").trim();
        const ip = request.headers.get("CF-Connecting-IP") || "Unknown";
        const ua = request.headers.get("User-Agent") || "";

        if (!inputKey) return new Response(renderLoginPage("Vui lòng nhập Key!"), {headers:{"Content-Type":"text/html"}});

        const keyVal = await env.PRO_1.get(inputKey);
        if (!keyVal) return new Response(renderLoginPage("Key không tồn tại!"), {headers:{"Content-Type":"text/html"}});

        let keyData;
        try { keyData = JSON.parse(keyVal); } catch(e) { return new Response(renderLoginPage("Lỗi dữ liệu Key!"), {headers:{"Content-Type":"text/html"}}); }

        if (!keyData.activated_at) {
            const now = Date.now();
            const dur = (keyData.duration_seconds || (30*86400)) * 1000;
            keyData.activated_at = now;
            keyData.expires_at = now + dur;
            keyData.devices = [];
        } else if (keyData.expires_at && Date.now() > keyData.expires_at) {
             const msg = `
❌ <b>ĐĂNG NHẬP THẤT BẠI (Key Đã Hết Hạn)</b>
🔑 Key: <code>${inputKey}</code>
⏰ Ex: ${formatTime(keyData.expires_at)}
`;
             context.waitUntil(sendTelegram(TG_ADMIN_ID, msg));
             return new Response(renderLoginPage("Key đã hết hạn!"), {headers:{"Content-Type":"text/html"}});
        }

        const maxDev = keyData.max_devices || 1;
        let devices = keyData.devices || [];
        const existingDev = devices.find(d => d.id === deviceId);
        
        if (!existingDev) {
            if (devices.length >= maxDev) {
                const msg = `
🚫 <b>Giới hạn thiết bị!</b>
🔑 Key: <code>${inputKey}</code> (Max ${maxDev})
🌍 Attempt IP: ${ip}
🆔 Attempt Dev: <code>${deviceId}</code>
⚠️ Existing: ${devices.map(d=>d.ip).join(', ')}
`;
                context.waitUntil(sendTelegram(TG_ADMIN_ID, msg));
                return new Response(renderLoginPage(`Lỗi: Key chỉ dùng cho ${maxDev} thiết bị!`), {headers:{"Content-Type":"text/html"}});
            }
            devices.push({ id: deviceId, ip: ip });
            keyData.devices = devices;
            await env.PRO_1.put(inputKey, JSON.stringify(keyData));
        }

        const msg = `
🚀 <b>ĐĂNG NHẬP THÀNH CÔNG!</b>
🔑 Key: <code>${inputKey}</code>
🌍 IP: ${ip}
📱 Dev: ${devices.length}/${maxDev}
📦 Gói: ${formatPackage(keyData.duration_seconds)}
🆔 Device id: <code>${deviceId}</code> (${getDeviceType(ua)})
`;
        context.waitUntil(sendTelegram(TG_ADMIN_ID, msg));

        return new Response(null, {
            status: 302,
            headers: { "Location": "/", "Set-Cookie": `auth_vip=${inputKey}; Path=/; HttpOnly; Secure; Max-Age=31536000` },
        });

    } catch (e) {
        return new Response(renderLoginPage("Lỗi Server: " + e.message), {headers:{"Content-Type":"text/html"}});
    }
  }

  // --- ROUTING GIAO DIỆN ---
  if (url.pathname === "/login") return new Response(renderLoginPage(null), {headers: {"Content-Type": "text/html; charset=utf-8"}});

  if (url.pathname === "/" || url.pathname === "/index.html" || url.pathname === "/free.html" || url.pathname === "/vip.html") {
      const userKey = getCookie(request, "auth_vip");
      let isVip = false;
      if (userKey) {
          const keyVal = await env.PRO_1.get(userKey);
          if (keyVal) {
              try {
                  const d = JSON.parse(keyVal);
                  if (d.expires_at && Date.now() < d.expires_at) isVip = true;
              } catch(e) {}
          }
      }
      const target = isVip ? "/vip.html" : "/free.html";
      return env.ASSETS.fetch(new URL(target, request.url));
  }

  return next();
}

function getCookie(req, name) {
    const c = req.headers.get("Cookie");
    if(!c) return null;
    const m = c.match(new RegExp(name + "=([^;]+)"));
    return m ? m[1] : null;
}

// Added Modal HTML directly here as requested
function renderLoginPage(errorMsg) {
  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kích hoạt VIP</title>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; outline: none; }
    body { font-family: 'Montserrat', sans-serif; margin: 0; min-height: 100vh; display: flex; justify-content: center; align-items: center; background-color: #f3f4f6; color: #374151; padding: 20px; }
    .login-card { background: white; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); width: 100%; max-width: 450px; padding: 40px; border: 1px solid #e5e7eb; }
    h2 { margin-top: 0; font-size: 24px; font-weight: 700; color: #111827; text-align: center; margin-bottom: 8px; }
    p.subtitle { text-align: center; color: #6b7280; font-size: 14px; margin-bottom: 25px; }
    .input-group { margin-bottom: 20px; }
    .w-full-input { width: 100%; padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; }
    .btn { width: 100%; padding: 12px; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; font-weight: 700; text-transform: uppercase; margin-bottom: 10px; }
    .btn-primary { background: #2563eb; color: white; }
    .btn-buy { background: #f59e0b; color: white; display:block; text-align:center; text-decoration:none; margin-top:10px; }
    .notification { background: #fee2e2; color: #991b1b; padding: 12px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #ef4444; font-size:13px; font-weight:600; }
    
    /* MODAL STYLES */
    .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 2000; display: none; justify-content: center; align-items: center; }
    .modal-overlay.active { display: flex; }
    .modal-box { background: white; width: 450px; padding: 25px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); position: relative; animation: slideIn 0.3s ease-out; }
    @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: 0; opacity: 1; } }
    .modal-close { position: absolute; top: 15px; right: 15px; border: none; background: none; font-size: 20px; cursor: pointer; color: #9ca3af; }
    .pricing-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
    .price-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; text-align: center; color: #374151; font-size:13px; }
    .price-card.team { border-color: #3b82f6; background: #eff6ff; }
    .price-title { font-weight: 800; font-size: 14px; margin-bottom: 5px; display: block; color: #111827; }
    .buy-actions { display: flex; flex-direction: column; gap: 10px; margin-top: 15px; }
    .btn-fb { background: #1877f2; color: white; width: 100%; text-decoration: none; padding: 10px; border-radius: 6px; font-weight: 700; font-size: 13px; text-align: center; display: block; }
    .btn-tele { background: #0088cc; color: white; width: 100%; text-decoration: none; padding: 10px; border-radius: 6px; font-weight: 700; font-size: 13px; text-align: center; display: block; }
  </style>
  <script>
    window.onload = function() {
        let did = localStorage.getItem('trinh_hg_device_id');
        if(!did) { did = 'dev_'+Math.random().toString(36).substr(2); localStorage.setItem('trinh_hg_device_id', did); }
        document.getElementById('device-id-input').value = did;
        
        // Modal Logic
        const modal = document.getElementById('buy-key-modal');
        const openBtn = document.getElementById('open-modal-btn');
        const closeBtn = document.querySelector('.modal-close');
        
        if(openBtn) openBtn.onclick = function(e) { e.preventDefault(); modal.classList.add('active'); };
        if(closeBtn) closeBtn.onclick = function() { modal.classList.remove('active'); };
        window.onclick = function(e) { if(e.target == modal) modal.classList.remove('active'); };
    }
  </script>
</head>
<body>
  <div class="login-card">
    <h2>TrinhHG Access</h2>
    <p class="subtitle">Vui lòng nhập KEY để tiếp tục</p>
    ${errorMsg ? `<div class="notification">⚠️ ${errorMsg}</div>` : ''}
    <form method="POST">
      <input type="hidden" id="device-id-input" name="device_id">
      <div class="input-group">
        <label style="font-size:13px;font-weight:700;display:block;margin-bottom:5px;">KEY truy cập</label>
        <input type="password" name="secret_key" class="w-full-input" placeholder="Nhập Key..." required autofocus>
      </div>
      <button type="submit" class="btn btn-primary">Kích hoạt</button>
      <a href="#" id="open-modal-btn" class="btn btn-buy">Mua KEY</a>
    </form>
  </div>

  <div id="buy-key-modal" class="modal-overlay">
      <div class="modal-box">
          <button class="modal-close">×</button>
          <h2 style="text-align:center; margin-top:0;">Bảng Giá Key VIP</h2>
          <div class="pricing-grid">
              <div class="price-card">
                  <span class="price-title">CÁ NHÂN</span>
                  <div>15k / 1 Tuần</div>
                  <div>40k / 1 Tháng</div>
                  <div style="font-style:italic; font-size:11px; margin-top:5px;">Max 2 thiết bị</div>
              </div>
              <div class="price-card team">
                  <span class="price-title">ĐỘI NHÓM</span>
                  <div>30k / 1 Tuần</div>
                  <div>80k / 1 Tháng</div>
                  <div style="font-style:italic; font-size:11px; margin-top:5px;">Max 15 thiết bị</div>
              </div>
          </div>
          <p style="text-align:center; font-size:12px; color:#666;">(Trên 15 thành viên liên hệ Admin)</p>
          <div class="buy-actions">
              <a href="https://www.facebook.com/trinh.hg.57" target="_blank" class="btn-fb">Liên hệ Facebook</a>
              <a href="https://t.me/trinhhg57" target="_blank" class="btn-tele">Liên hệ Telegram</a>
          </div>
      </div>
  </div>
</body>
</html>
  `;
}
