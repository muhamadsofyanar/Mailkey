# MailK CRM v0.6.2

Perbarui seluruh source termasuk server.mjs, oauth.mjs, mcp.mjs, public/app.js dan Dockerfile. Pertahankan volume database, APP_URL HTTPS, SESSION_SECRET dan akun admin. Backup sebelum upgrade, commit lalu redeploy. Setelah healthy, refresh browser dengan Ctrl+F5.

## Persetujuan ulang massal

Centang kontak, lalu klik Persetujuan ulang pada toolbar atas. Preview menghitung kontak unsubscribed yang eligible, bounce, status lain dan kontak yang tidak ditemukan. Hanya kontak unsubscribed tanpa suppression bounce yang dipulihkan. Isi bukti persetujuan terbaru untuk seluruh kontak eligible dan centang verifikasi. Active/pending tidak berubah; bounce tetap diblokir. Aksi tidak menyinkronkan provider atau mengirim email otomatis. Kesalahan validasi per kontak tidak membatalkan kontak lain; toast merangkum jumlah berhasil/gagal. Riwayat aktivitas dan audit mencatat pemulihan.

## OAuth Claude

Perbaikan ini menambahkan cookie sesi OAuth tersendiri dengan SameSite=Lax dan Path=/oauth. Cookie CRM tetap SameSite=Strict. Logout CRM membatalkan sesi yang sama dan menghapus kedua cookie. Pesan error membedakan origin tidak sesuai APP_URL dari sesi login yang tidak ada. CSRF, sesi valid dan callback allowlist tetap diwajibkan.

Setelah upgrade, mulai ulang koneksi dari Claude. Jangan memakai halaman persetujuan yang dibuka sebelum upgrade. Pilih Masuk sekarang, Daftar otomatis, Streamable HTTP. Login ulang memakai akun admin MailK, klik Izinkan akses, lalu tunggu kembali ke Claude. Periksa menu Integrasi AI / MCP: koneksi Claude harus muncul dalam daftar. Uji permintaan baca jumlah kontak sebelum mengubah data.

Status Aktif di MailK berarti server OAuth tersedia, bukan bukti bahwa Claude sudah terhubung. Halaman Hubungkan Claude berarti menunggu persetujuan pengguna. Error Login/origin tidak valid pada v0.6.1 belum membedakan kedua penyebab. Perbaikan ini mencakup penanganan sesi lintas navigasi dari Claude; keberhasilan akun produksi perlu diperiksa setelah deployment.

Sembilan tes backend dan simulasi runtime Docker lulus. Tes OAuth memakai cookie sesi OAuth tanpa cookie CRM, serta memeriksa PKCE, resource, replay, refresh, revoke, missing session dan wrong origin. Tes integrasi memeriksa pemulihan massal, bukti wajib, serta perlindungan bounce. Browser produksi dan koneksi akun Claude tidak dapat diuji dari workspace ini.
