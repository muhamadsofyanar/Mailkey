# Pembaruan ke v0.5.0

1. Backup database menggunakan panduan README sebelum redeploy.
2. Upload SELURUH isi folder mailk-crm ke root repository yang sama. Sertakan public/import-tools.js yang baru, app.js, style.css, server.mjs, dan file lainnya.
3. Pertahankan environment dan volume persisten /app/data di Coolify. Tidak perlu mengganti secret.
4. Redeploy dan refresh browser Ctrl+Shift+R.
5. Import CSV: cek mapping dan contoh, pilih mode duplikat, klik Preview, baru Import. Untuk memperbaiki nama/telepon lama, pilih Perbarui sesuai CSV; field kosong tidak menghapus nilai lama.
6. Buat custom field provinsi, kategori bisnis, omzet, dan lainnya melalui mapping jika diperlukan. Timestamp dapat dipetakan ke registered_at dan disimpan sebagai nilai sumber.
7. Jangan hapus kontak untuk memperbaiki mapping. Kontak yang dihapus tetap masuk suppression. Kontak dengan riwayat CRM dilindungi.
8. Kontak massal: centang per baris, judul tabel untuk halaman, atau Pilih semua hasil filter. Pilihan bertahan lintas halaman; Batalkan pilihan untuk mengosongkan.
9. Sinkronkan pilihan memakai list tujuan yang sudah diatur pada Integrasi → Atur list & otomatisasi. Hasilnya ada di Status Sinkronisasi. Aktifkan sinkronisasi otomatis terlebih dahulu.
10. Campaign tanpa include/exclude menyasar semua kontak aktif dengan persetujuan. Klik Hitung penerima atau Kirim sekarang untuk melihat jumlah dan contoh.

Pengujian paket memakai provider simulasi. Uji ulang import beberapa kontak percobaan, UI browser, dan sinkronisasi list nyata setelah deploy. Paket tidak mengubah VPS secara langsung. Tidak ada undo import; gunakan backup bila perlu pemulihan. Data kontak dan credential pengguna tidak disertakan dalam paket.

# Upload manual ke GitHub dan deploy Coolify

Paket ini versi 0.4.1. Gunakan paket terbaru ini untuk upload.

1. Ekstrak ZIP, buka folder `mailk-crm`.
2. Buat repository GitHub private.
3. Pilih Add file → Upload files. Upload **isi** folder mailk-crm ke root repository. Pastikan Dockerfile ada di root, bukan di subfolder mailk-crm/mailk-crm.
4. Pastikan folder public/ ikut; sertakan server.mjs, backup.mjs, package.json, README.md, compose.yaml. File test/ boleh ikut untuk verifikasi.
5. GitHub web upload dapat melewatkan dotfiles. Bila perlu gunakan Add file → Create new file untuk `.gitignore`, `.dockerignore`, dan `.env.example`, lalu salin isinya dari paket. `.env.example` kosong untuk rahasia. Jangan upload `.env`, data/, file database, token, atau password.
6. Commit perubahan.
7. Di Coolify buat aplikasi dari repository GitHub tersebut → build pack Dockerfile → port 3000.
8. Tambahkan persistent storage `/app/data`. Jalankan satu replica.
9. Isi environment dari `.env.example` di Coolify. APP_URL wajib sama dengan domain HTTPS CRM. Password admin minimal 12 karakter; SESSION_SECRET minimal 32 karakter. MAILKETING_API_TOKEN dari akun Anda.
10. Arahkan DNS domain ke VPS, pasang domain pada resource Coolify, deploy.
11. Login → Settings → isi pengirim/alamat bisnis. Integration → cek kredit/sender/list. Pasang webhook URL di akun Mailketing.
12. Buat template dan satu kontak test, aktifkan pengiriman, uji send test/tracking/unsubscribe. Uji juga data tetap ada setelah redeploy sebelum campaign pelanggan.

Jika masih ada email/job aktif dari versi lama, jangan mengganti SESSION_SECRET: tautan unsubscribe/tracking lama membutuhkan secret yang sama. Database lama akan ditambah tabel webhook secara otomatis tanpa menghapus data. Backup dahulu sebelum upgrade.

Belum diverifikasi dalam lingkungan ini: build Docker, tampilan browser interaktif, pengiriman Mailketing live, serta deployment ke VPS/Coolify Anda. Panduan lengkap dan batas fitur ada di README.md.

## Upgrade dari v0.2 ke v0.3

Sebelum upgrade, backup database. Upload semua isi paket terbaru ke repository lama dan overwrite file kode yang sama. **Folder public/ harus mencakup file baru mailketing.js** bersama app.js, index.html, dan style.css. Tidak perlu menghapus storage atau database.

Commit → Redeploy di Coolify. Pertahankan environment yang sudah benar dan volume `/app/data`. Jangan mengganti SESSION_SECRET, WEBHOOK_SECRET, atau token hanya untuk upgrade kode. Setelah deploy, refresh browser dengan Ctrl+Shift+R.

Pengujian alur sync:
1. Integration → daftar sender: tampil sebagai tabel email, bukan JSON. Pilih pengirim.
2. Jika belum ada kontak, tombol Sinkronkan menampilkan petunjuk Tambah kontak/Import CSV.
3. Tambahkan email sendiri, centang consent; pastikan status aktif.
4. Integration → Sinkronkan → pilih kontak dan list berdasarkan nama → Sinkronkan kontak.
5. Konfirmasi pesan berhasil dan kontak muncul di list Mailketing.
6. Jika gagal, salin teks error yang ditampilkan. Jangan sertakan token atau password.


## File penting untuk v0.4

Pastikan `crm.mjs` berada di root repository bersama Dockerfile dan server.mjs. Folder public/ wajib berisi app.js, style.css, index.html, mailketing.js, dan **crm-ui.js**. Upload Dockerfile terbaru karena COPY sekarang mencakup crm.mjs.

Setelah deploy: Integrasi Mailketing → Atur list & otomatisasi → pilih Ruang 1 → centang aktif → Simpan. Selanjutnya kontak CRM eligible masuk ke Mailketing tanpa klik sync satu per satu. Lihat hasil di Status Sinkronisasi. Tidak ada environment baru yang wajib.

Langkah CRM: Tambah kontak → buat peluang → catat tugas/catatan → pindahkan tahap saat berkembang → catat transaksi saat benar-benar dibayar → lihat Laporan CRM. Gunakan kontak percobaan milik Anda untuk uji coba.

## Upgrade v0.4.1

Backup database, lalu upload isi paket ke repository yang sama dan overwrite kode lama, termasuk server.mjs, crm.mjs dan seluruh public/. Commit lalu Redeploy di Coolify. Pertahankan environment dan storage /app/data, kemudian Ctrl+Shift+R.

Uji dengan kontak percobaan: centang baris, centang halaman, pilih semua hasil filter, batalkan pilihan, lalu hapus massal. Preview harus menampilkan jumlah dan kontak bersejarah tidak terhapus. Jangan menghapus kontak untuk memperbaiki mapping CSV: import ulang berdasarkan email.
