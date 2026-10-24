# GenetikaAI Suno — 3 Menu

## Konfigurasi API key melalui TXT
- Isi file `keys.txt` di folder utama project dengan API key pada satu baris, lalu simpan.
- Contoh isi: `API_KEY=isi_key_anda_di_sini` atau cukup tempel key mentah.
- Server membaca key otomatis; tidak perlu mengetik key di halaman web.
- `keys.txt` tidak disajikan oleh server lokal dan ditambahkan ke `.gitignore`. Jangan kirim atau unggah file ini ke repositori publik.
- Untuk hosting/serverless, atur environment variable `API_KEY` pada pengaturan hosting. Jangan mengandalkan `keys.txt` lokal yang tidak ikut ter-deploy.

## Menu yang tersedia
1. Generate Music
2. Upload Cover Audio
3. Upload Extend Cover

## Jalankan lokal
- Node.js 18 atau lebih baru.
- Buat/isi `keys.txt` di folder utama.
- Jalankan `npm start`.
- Buka `http://localhost:3000`.

## Catatan
- API key wajib aktif dan memiliki saldo/kredit yang cukup.
- Panggilan nyata ke layanan AI perlu diuji menggunakan API key milik pengguna.
- Generate Music memisahkan gaya musik dari lirik; instrumental tidak mengirim parameter vokal yang tidak didukung.
- Pembuatan task menggunakan `POST /api/v1/client/tasks` dan pemeriksaan task menggunakan `GET /api/v1/client/tasks?taskId=...` pada endpoint layanan yang dikonfigurasi di backend.
- Pada deployment Vercel, endpoint proxy membatasi upload sampai 4 MB karena batas ukuran request serverless. Untuk file lebih besar, diperlukan layanan upload langsung/external storage.
