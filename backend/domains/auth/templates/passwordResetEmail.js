export function buildPasswordResetEmail({ resetUrl, shopName, expiresMinutes }) {
  const subject = "Đặt lại mật khẩu Otofine Shop";
  const greeting = shopName ? `Xin chào ${shopName},` : "Xin chào,";

  const text = `${greeting}

Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu cho tài khoản shop Otofine.

Mở liên kết sau để đặt mật khẩu mới (hết hạn sau ${expiresMinutes} phút):
${resetUrl}

Nếu bạn không yêu cầu, hãy bỏ qua email này. Mật khẩu hiện tại vẫn an toàn.

— Otofine`;

  const html = `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="utf-8"/></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111;">
  <p>${greeting}</p>
  <p>Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản <strong>Otofine Shop</strong>.</p>
  <p><a href="${resetUrl}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;">Đặt lại mật khẩu</a></p>
  <p style="font-size:14px;color:#555;">Liên kết hết hạn sau ${expiresMinutes} phút. Nếu nút không hoạt động, copy URL:<br/><a href="${resetUrl}">${resetUrl}</a></p>
  <p style="font-size:13px;color:#888;">Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>
</body>
</html>`;

  return { subject, text, html };
}
