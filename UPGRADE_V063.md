# MailK CRM v0.6.3

Perbaikan persetujuan OAuth saat browser mengirim Origin null atau tidak mengirim Origin/Referer. Request dengan origin asing yang eksplisit tetap ditolak. Sesi login valid, token CSRF sesuai transaksi dan sesi, masa berlaku transaksi, callback allowlist, PKCE dan kode sekali pakai tetap diwajibkan. Halaman OAuth memakai Referrer-Policy same-origin; aplikasi lain tetap no-referrer.

Upload seluruh isi folder mailk-crm ke repository source yang sama, lalu commit dan redeploy. Pertahankan environment dan volume database. Backup database sebelum upgrade. APP_URL=https://app.ruanglegalitas.com dan akun admin tidak perlu diubah.

Setelah healthy, tutup halaman OAuth yang lama. Mulai ulang koneksi dari Claude: Masuk sekarang, Daftar otomatis, Streamable HTTP. Login kembali ke MailK bila diminta, klik Izinkan akses. Tunggu kembali ke Claude, periksa daftar koneksi pada Integrasi AI / MCP dan uji membaca jumlah kontak.

Sembilan tes backend lulus. Regresi menguji persetujuan dengan Origin null tanpa Referer, penolakan Origin asing, salah CSRF dan sesi hilang. Runtime sesuai COPY Docker juga lulus. Koneksi Claude produksi dan browser pengguna belum diuji langsung; jika masih gagal, kirim pesan error terbaru.
