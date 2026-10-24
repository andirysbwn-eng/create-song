# GenetikaAI

Website generator musik AI dengan backend Node.js dan dukungan deployment Vercel.

## Deploy ke Vercel

Tambahkan environment variables di Project Settings → Environment Variables:

- `API_KEY_1` — API key pertama (wajib)
- `API_KEY_2` — API key cadangan (opsional)
- `API_KEY_3`, dan seterusnya — key tambahan (opsional)

Tempel key asli pada kolom **Value** masing-masing. Gunakan tipe **Sensitive** untuk setiap key. Setelah menyimpan, lakukan redeploy. Backend mencoba key berikutnya jika provider menolak key, kuota habis, atau rate limit (HTTP 401, 402, 403, atau 429). Kegagalan lain seperti parameter request yang salah tidak memicu pergantian key.

Nama lama `API_KEY` dan `SUNO_API_KEY` masih didukung untuk kompatibilitas, tetapi gunakan `API_KEY_1` dan seterusnya untuk key berurutan.

## Jalankan lokal

- Node.js 18 atau lebih baru.
- Untuk lokal, isi `keys.txt` dengan satu key per baris, atau gunakan format `API_KEY_1=...` dan `API_KEY_2=...`.
- `keys.txt` tidak disajikan oleh server dan tercantum dalam `.gitignore`.
- Jalankan `npm start`, lalu buka `http://localhost:3000`.

Jangan commit atau bagikan API key. File `keys.txt` lokal tidak otomatis tersedia di Vercel; untuk Vercel gunakan Environment Variables.
