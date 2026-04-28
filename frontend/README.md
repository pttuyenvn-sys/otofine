# Otofine — Next.js (frontend chính)

Giao diện người dùng dùng **Next.js App Router** (thư mục `frontend/`).

## Chạy local

1. Cài dependency:

```bash
cd frontend
npm install
```

2. Tạo `.env.local` (xem `.env.example`):

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000/api
```

3. Chạy dev (mặc định port 3000):

```bash
npm run dev
```

4. Backend API vẫn dùng project `backend/` (ví dụ port 5000).

## Routes

| Đường dẫn | Mô tả |
|-----------|--------|
| `/` | Trang chủ / tìm phụ tùng |
| `/product/[id]` | Chi tiết sản phẩm |
| `/shop/login`, `/shop/register`, `/shop/forgot-password` | Auth shop |
| `/shop/settings`, `/shop/products`, `/shop/add-product` | Khu seller (cần đăng nhập) |
| `/admin/login`, `/admin/forgot-password` | Auth admin |
| `/admin/shops` | Quản lý shop (admin) |

## Ghi chú

- Backend đã được cấu hình CORS cho `http://localhost:3000` (Next.js). Nếu bạn đổi port hoặc domain, thêm vào biến `CORS_ORIGINS` trong `.env` của backend (cách nhau bằng dấu phẩy) rồi khởi động lại API.
- Ảnh tĩnh (`/logo.png`, `/no-image.png`): thêm vào `frontend/public/` nếu cần.

## Build production

```bash
npm run build
npm start
```
