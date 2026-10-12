# Upload manual ke GitHub dan deploy Coolify

Paket ini versi 0.2.0. Gunakan paket terbaru ini untuk upload.

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
