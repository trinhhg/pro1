export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);

  // Helper: Lấy Key từ Cookie
  function getAuthKey(req) {
    const cookie = req.headers.get("Cookie");
    if (!cookie) return null;
    const match = cookie.match(/auth_vip=([^;]+)/);
    return match ? match[1] : null;
  }

  // 1. XỬ LÝ ĐĂNG NHẬP (POST /login)
  if (url.pathname === "/login" && request.method === "POST") {
    try {
        const formData = await request.formData();
        const inputKey = (formData.get("secret_key") || "").trim();

        if (!inputKey) return new Response("Vui lòng nhập Key!", {status: 400});

        // Kiểm tra Key trong KV (Namespace: PRO_1)
        const keyDataStr = await env.PRO_1.get(inputKey);
        
        if (!keyDataStr) return new Response("Key không tồn tại hoặc sai!", {status: 403});

        let keyData = JSON.parse(keyDataStr);

        // A. Nếu Key chưa kích hoạt -> Kích hoạt ngay
        if (!keyData.activated_at) {
            const now = Date.now();
            const durationMs = (keyData.duration_seconds || (30 * 86400)) * 1000;
            
            keyData.activated_at = now;
            keyData.expires_at = now + durationMs;

            // Update lại KV
            await env.PRO_1.put(inputKey, JSON.stringify(keyData));
        } 
        // B. Nếu Key đã kích hoạt -> Kiểm tra hạn
        else if (keyData.expires_at && Date.now() > keyData.expires_at) {
            return new Response("Key này đã hết hạn sử dụng!", {status: 403});
        }

        // Đăng nhập thành công -> Set Cookie 1 năm
        return new Response(null, {
            status: 302,
            headers: {
                "Location": "/",
                "Set-Cookie": `auth_vip=${inputKey}; Path=/; HttpOnly; Secure; Max-Age=31536000`,
            },
        });
    } catch (e) {
        return new Response("Lỗi Server: " + e.message, {status: 500});
    }
  }

  // 2. XỬ LÝ ĐĂNG XUẤT
  if (url.pathname === "/logout") {
     return new Response(null, {
         status: 302,
         headers: {
             "Location": "/",
             "Set-Cookie": `auth_vip=; Path=/; HttpOnly; Secure; Max-Age=0`, // Xóa cookie
         }
     });
  }

  // 3. XỬ LÝ ROUTING TRANG CHỦ (Serve file HTML phù hợp)
  if (url.pathname === "/" || url.pathname === "/index.html" || url.pathname === "/vip.html") {
      const userKey = getAuthKey(request);
      let isVip = false;

      if (userKey) {
          const keyVal = await env.PRO_1.get(userKey);
          if (keyVal) {
              const vipData = JSON.parse(keyVal);
              // Key tồn tại và chưa hết hạn
              if (vipData.expires_at && Date.now() < vipData.expires_at) {
                  isVip = true;
              }
          }
      }

      // Nếu VIP -> Lấy nội dung file vip.html trả về
      // Nếu Free -> Lấy nội dung file index.html trả về
      const targetPage = isVip ? "/vip.html" : "/index.html";
      return env.ASSETS.fetch(new URL(targetPage, request.url));
  }

  return next();
}
