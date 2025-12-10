// === CẤU HÌNH TELEGRAM BOT ===
const TG_BOT_TOKEN = "8317998690:AAEJ51BLc6wp2gRAiTnM2qEyB4sXHYoN7lI";
const TG_ADMIN_ID = "5524168349"; 
const TG_CHANNEL_NOTIFY = "3206251077"; // Channel ID để báo update
const ADMIN_SECRET = "trinhhg_admin_secret_123"; // Secret key để trigger update
// =============================

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);

  // Helper gửi tin nhắn
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

  // --- API VERSION CHECK ---
  // Client (vip.js/free.js) sẽ gọi vào đây để xem có bản mới không
  if (url.pathname === "/api/version") {
      // Trả về chuỗi version hiện tại được định nghĩa trong JS
      // Ở đây ta hardcode tạm hoặc lấy từ KV nếu muốn động
      return new Response("2025.12.10.01", {status: 200}); 
  }

  // --- API ADMIN NOTIFY UPDATE ---
  // Gọi bằng cách: POST /api/notify-update?secret=trinhhg_admin_secret_123
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
              const msg = `⚠️ <b>KEY ĐÃ HẾT HẠN!</b>\nKey: <code>${userKey}</code>`;
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
          const msg = `🚪 <b>LOGOUT</b>\nKey: <code>${userKey}</code>\nIP: ${ip}`;
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
             const msg = `❌ <b>LOGIN FAIL (Expired)</b>\nKey: <code>${inputKey}</code>`;
             context.waitUntil(sendTelegram(TG_ADMIN_ID, msg));
             return new Response(renderLoginPage("Key đã hết hạn!"), {headers:{"Content-Type":"text/html"}});
        }

        const maxDev = keyData.max_devices || 1;
        let devices = keyData.devices || [];
        const existingDev = devices.find(d => d.id === deviceId);
        
        if (!existingDev) {
            if (devices.length >= maxDev) {
                const msg = `🚫 <b>OVER LIMIT DEVICES</b>\nKey: <code>${inputKey}</code>\nIP: ${ip}\nDevID: ${deviceId}`;
                context.waitUntil(sendTelegram(TG_ADMIN_ID, msg));
                return new Response(renderLoginPage(`Lỗi: Key chỉ dùng cho ${maxDev} thiết bị!`), {headers:{"Content-Type":"text/html"}});
            }
            devices.push({ id: deviceId, ip: ip });
            keyData.devices = devices;
            await env.PRO_1.put(inputKey, JSON.stringify(keyData));
        }

        const msg = `🚀 <b>LOGIN SUCCESS!</b>\n🔑 Key: <code>${inputKey}</code>\n🌍 IP: <code>${ip}</code>\n📱 Dev: ${devices.length}/${maxDev}`;
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
      const target = isVip ? "/vip.html" : "/free.html"; // Chuyển index.html thành free.html
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

function renderLoginPage(errorMsg) {
  // Giữ nguyên giao diện login cũ của bạn, chỉ update text nếu cần
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
    .notification { background: #fee2e2; color: #991b1b; padding: 12px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #ef4444; font-size:13px; font-weight:600; }
  </style>
  <script>
    window.onload = function() {
        let did = localStorage.getItem('trinh_hg_device_id');
        if(!did) { did = 'dev_'+Math.random().toString(36).substr(2); localStorage.setItem('trinh_hg_device_id', did); }
        document.getElementById('device-id-input').value = did;
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
      <div class="input-group"><input type="password" name="secret_key" class="w-full-input" placeholder="Nhập Key..." required autofocus></div>
      <button type="submit" class="btn btn-primary">Kích hoạt</button>
    </form>
  </div>
</body>
</html>
  `;
}
