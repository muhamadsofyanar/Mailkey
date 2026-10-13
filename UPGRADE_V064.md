# MailK CRM v0.6.4 — Langkah 1: Pengaturan di aplikasi

## Fitur
Pengaturan → Koneksi & token mendukung ganti/cabut token Mailketing, CRM API, MCP, dan secret webhook; generator token acak; tes koneksi menggunakan token yang sudah disimpan; perubahan email/password admin dengan password saat ini.
Token disimpan terenkripsi AES-256-GCM, password memakai hash scrypt dan salt acak. Token tidak dapat dibaca kembali; salin token hasil generator sebelum menyimpan. Kolom kosong mempertahankan nilai, checkbox Cabut menghapusnya.
Perubahan akun mengakhiri semua sesi dan mencabut koneksi OAuth. Hubungkan ulang klien OAuth. Perubahan token Mailketing menjeda pengiriman/sinkronisasi; tes koneksi lalu aktifkan kembali.

## Upgrade dari v0.6.3
1. Backup database/volume. Simpan SESSION_SECRET yang digunakan saat ini.
2. Ganti kode dengan paket ini dan rebuild/redeploy, memakai Node.js 24+. Pertahankan APP_URL, SESSION_SECRET dan volume data.
3. Masuk dengan akun lama. Akun dan token environment diimpor satu kali pada startup pertama versi ini.
4. Kelola kredensial di Pengaturan → Koneksi & token. Perubahan berlaku tanpa restart.
5. Setelah verifikasi, hapus token operasional serta ADMIN_EMAIL/ADMIN_PASSWORD dari environment bila diinginkan. Compose mendukung startup berikutnya tanpa ADMIN_PASSWORD.

Penggantian webhook secret mengubah URL webhook; perbarui URL di Mailketing. Penggantian token CRM/MCP memerlukan pembaruan klien. Token yang dicabut tidak dipulihkan dari environment ketika restart.

## Konfigurasi awal dan pemulihan
APP_URL dan SESSION_SECRET tetap konfigurasi server; PORT/DATA_DIR opsional. Instalasi baru membutuhkan ADMIN_PASSWORD minimal 12 karakter untuk membuat akun awal; setelah itu akun dikelola di aplikasi.
Jangan mengganti SESSION_SECRET: kunci ini melindungi enkripsi token dan tracking/session. Simpan kunci terpisah bersama backup database. Pemulihan akun dan rotasi kunci enkripsi belum memiliki UI.

## Validasi dan cakupan
10 tes otomatis lulus: fitur lama, migrasi, enkripsi, pembatasan API token, validasi origin, pencabutan token, perubahan akun dan persistensi setelah restart. Pemeriksaan sintaks JavaScript lulus.
Tes koneksi memakai provider simulasi; akun Mailketing asli belum diuji. Pemeriksaan browser belum berjalan karena executable browser tidak tersedia.
Ini menyelesaikan langkah 1. Builder modern, AI bawaan, inbox balasan dan automation lanjutan belum ditambahkan.
