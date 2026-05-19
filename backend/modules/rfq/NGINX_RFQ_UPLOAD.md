# Nginx — RFQ guest image upload (production)

Browser flow: `POST https://otofine.com/api/rfq/upload-image` → nginx `/api/` → Express:5000.  
Preview: `GET https://otofine.com/uploads/rfq/<uuid>.jpg` → **must** proxy `/uploads/` to Express (not Next.js).

## Required settings

```nginx
client_max_body_size 12m;   # default 1m → 413 for mobile camera JPEGs

location /api/ {
    proxy_pass http://127.0.0.1:5000/api/;
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
    client_body_timeout 120s;
}

location /uploads/ {
    proxy_pass http://127.0.0.1:5000/uploads/;
}
```

Apply: `sudo nginx -t && sudo systemctl reload nginx`

## Limits alignment

| Layer | Limit |
|-------|--------|
| nginx | 12m body |
| multer / RFQ_UPLOAD_MAX_BYTES | 5MB (pre-sharp) |
| sharp output | ~200–600KB JPEG |
