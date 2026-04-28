# SEO cache refresh (hạ tầng sản xuất)

- Gọi `POST /api/seo/refresh` với `Authorization: Bearer $SEO_ADMIN_TOKEN` + body `{ "slug": "..." }` để xóa cache một URL và regenerate ở lượt tải sau.
- Cron (Vercel / Linux): lặp qua sitemap, `curl` warm từng URL — **không** gọi LLM; nội dung từ template + KB đã tích hợp sẵn.
- Tương lai: worker riêng gọi `generateSeoArticle` sau khi bổ sung LLM **batch** ngoài request.
