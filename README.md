# Studio Cover

Website generator musik dengan login per pengguna dan API key yang terpisah untuk setiap akun.

## Konfigurasi Vercel

Di **Project → Settings → Environment Variables**, tambahkan:

- `SESSION_SECRET`: string acak panjang dan rahasia untuk tanda tangan sesi.
- `<NAMA>_USERNAME`: username pengguna.
- `<NAMA>_PASSWORD`: password pengguna.
- `<NAMA>_API_KEY_1`, `<NAMA>_API_KEY_2`, dan seterusnya: API key milik pengguna tersebut.

Contoh dua akun:

```env
SESSION_SECRET=buat_string_acak_panjang_yang_rahasia
AISYAH_USERNAME=aisyah
AISYAH_PASSWORD=ganti_dengan_password_kuat
AISYAH_API_KEY_1=key_milik_aisyah_1
AISYAH_API_KEY_2=key_milik_aisyah_2
BUDI_USERNAME=budi
BUDI_PASSWORD=ganti_dengan_password_kuat_lain
BUDI_API_KEY_1=key_milik_budi_1
BUDI_API_KEY_2=key_milik_budi_2
```

Nama prefix sebelum `_USERNAME`, `_PASSWORD`, dan `_API_KEY_n` harus sama. Misalnya `SITI_USERNAME` dipasangkan dengan `SITI_PASSWORD` dan `SITI_API_KEY_1`. Pengguna hanya menggunakan key dengan prefix akunnya sendiri. Key dicoba berurutan jika key sebelumnya ditolak, tidak tersedia, atau terkena pembatasan sementara.

Gunakan password yang kuat dan unik; jangan gunakan contoh di atas sebagai password sungguhan. Tandai variabel rahasia sebagai **Sensitive** jika opsi itu tersedia. Setelah mengubah environment variables, lakukan redeploy. Jangan menaruh API key atau password di HTML, repositori, atau file yang dibagikan.

## Jalankan lokal

- Node.js 18 atau lebih baru.
- Salin variabel dari `.env.example` ke file `.env` dan isi dengan akun/key sungguhan. Jangan bagikan file `.env`.
- Jalankan `npm start`, lalu buka `http://localhost:3000`.

Pesan error yang tampil ke pengguna dibuat umum dan tidak menampilkan detail internal layanan. Jika konfigurasi akun atau key bermasalah, periksa log dan Environment Variables dari dashboard administrator.
