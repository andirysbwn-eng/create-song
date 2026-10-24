# Studio Cover

Studio musik tanpa login. Pengguna memasukkan API key langsung di halaman, atau mengunggah file TXT yang berisi satu atau beberapa key.

## API key dan rotasi otomatis

- Tempel satu API key, atau beberapa key (satu per baris / dipisahkan koma).
- Bisa juga pilih file `.txt`. Format yang disarankan: satu API key per baris. Baris kosong dan baris komentar yang dimulai `#` boleh diabaikan.
- Key disimpan di penyimpanan lokal browser untuk kenyamanan pada perangkat tersebut; gunakan tombol **Hapus key** jika perangkat dipakai bersama.
- Jika API menolak key karena autentikasi, kredit/saldo, atau rate limit (HTTP/code 401, 402, 403, 429), server mencoba key berikutnya secara berurutan.
- Key dikirim ke backend hanya untuk memproses permintaan; jangan bagikan link/akses perangkat yang berisi key kepada orang lain.

## Deploy ke Vercel

Deploy folder project ini seperti biasa. Tidak perlu mengatur `SESSION_SECRET`, username, atau password. Pastikan folder `api/` memiliki `create.js` dan `status.js`.

## Jalankan lokal

- Node.js 18 atau lebih baru.
- Jalankan `npm start`, lalu buka `http://localhost:3000`.

API key tidak disimpan di repository. Masukkan lewat UI saat membuka aplikasi.
