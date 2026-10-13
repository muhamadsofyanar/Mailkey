# MailK CRM v0.7.0 — Upgrade gabungan, satu kali redeploy

Paket ini mencakup pengaturan v0.6.4 dan seluruh pembaruan tahap berikutnya. Bisa dipasang langsung dari v0.6.3 atau v0.6.4.

## Perbaikan deployment v0.6.4
Dockerfile lama tidak menyalin settings-store.mjs dan menyebabkan ERR_MODULE_NOT_FOUND. Versi ini menyalin seluruh modul *.mjs, memasang dependensi terkunci melalui npm ci, serta memasang curl untuk healthcheck Coolify. Ganti Dockerfile juga; jangan hanya mengganti server.mjs. Semua modul dan package-lock.json sudah ada dalam ZIP.

## Langkah upgrade
1. Backup volume/database produksi. Pertahankan volume data, APP_URL dan SESSION_SECRET yang sama.
2. Salin seluruh isi folder mailk-crm dari ZIP ke root repository yang dibuild Coolify. Jangan menambahkan satu folder bertingkat mailk-crm jika Dockerfile sebelumnya ada pada root repo. Sertakan file tersembunyi .dockerignore, .env.example dan compose.yaml.
3. Commit/push lalu redeploy satu kali. Build memerlukan akses ke registry npm dan repositori paket Debian untuk curl. Buka /health untuk memeriksa startup.
4. Masuk memakai akun admin lama. Kredensial environment lama diimpor sekali ke pengaturan terenkripsi. Setelah migrasi berhasil, token dan akun dikelola di aplikasi; tidak perlu restart saat mengganti nilai.
5. Atur AI dan mailbox di aplikasi. Kedua fitur nonaktif secara default; fitur CRM/campaign lama tetap dapat digunakan tanpa keduanya.

Jangan menghapus volume data. SESSION_SECRET adalah kunci enkripsi token dan penandatanganan tracking/session; simpan terpisah dari backup. APP_URL dan SESSION_SECRET tetap konfigurasi server. ADMIN_PASSWORD minimal 12 karakter hanya diperlukan untuk seed instalasi baru; instalasi yang sudah bermigrasi tidak memerlukannya.

## Builder modern
Template Email → Tambah/Edit membuka MailK Studio. Tersedia heading, teks, gambar HTTPS, tombol, pembatas, spacer, dua kolom, kartu produk, dan link sosial. Atur font, warna, padding, lebar email dan preheader. Blok dapat diurutkan, diduplikasi/dihapus, dengan undo/redo dan preview desktop/mobile. HTML email dibuat memakai tabel dan gaya inline untuk kompatibilitas dasar.
Draft otomatis tersimpan di browser sebagai draft lokal; tombol Simpan template menyimpan ke server. Draft lokal dapat dipulihkan dan tidak tersinkronisasi antar perangkat. Jangan memakai browser bersama untuk menyimpan draft sensitif. Template HTML lama tetap dibuka sebagai HTML kustom, tanpa konversi yang mengubah isinya. Pilih mode Visual/preset untuk memulai desain baru. Gambar memakai URL HTTPS, belum ada hosting/upload gambar di aplikasi.
Preview ukuran layar bukan pengujian semua klien email. Kirim test email ke mailbox Anda sebelum campaign.

## AI bawaan dan MCP
Pengaturan AI: isi endpoint HTTPS API yang kompatibel Chat Completions, nama model yang tersedia pada provider Anda, API key, dan password admin utama. Endpoint default https://api.openai.com/v1; tidak memaksa satu model. Aktifkan AI.
Asisten AI menyediakan email/desain, subject/preheader, rewrite, ringkasan pelanggan, draft balasan, segmentasi, dan rencana campaign. Pilih kontak hanya ketika diperlukan: konteks kontak/catatan/tugas atau thread yang dipilih dikirim ke provider. Hasil berupa draft yang bisa ditinjau; AI tidak mengirim email atau mengubah persetujuan pelanggan.
MCP diperluas dengan create_template_draft, inbox_summary, read_thread dan create_reply_draft. Total 16 tools. OAuth Claude lama tetap tersedia. Balasan tetap dikirim melalui UI secara manual.

## Inbox pelanggan
Koneksi Mailbox: isi alamat mailbox, host/port IMAP, username, folder (default INBOX), serta app password/password yang diterima provider. IMAP mendukung TLS langsung (993) atau STARTTLS wajib. SMTP mendukung TLS langsung (465) atau STARTTLS wajib (umumnya 587), username dan password terpisah. Sertifikat TLS tetap diverifikasi.
Alamat mailbox harus menerima email pada alamat FROM yang dipakai campaign (atau melalui forwarding yang Anda atur di provider). API Mailketing v2 tidak mendokumentasikan Reply-To maupun endpoint inbox; paket ini tidak mengirim field Reply-To yang belum didukung. Verifikasi domain/sender tetap di Mailketing, dan penyediaan mailbox/DNS MX dilakukan di provider email Anda.
Gunakan Tes IMAP/SMTP sesudah Simpan. Aktifkan auto-sync (1–60 menit), atau klik Sinkronkan di Inbox. Sinkronisasi pertama membaca 100 pesan terakhir; berikutnya 100 pesan baru per proses dengan cursor UID tersimpan. Pesan >5 MB dilewati dan jumlahnya ditampilkan. Lampiran maksimal 2 MB/file, maksimal 20/file per pesan, dapat diunduh. Isi pesan ditampilkan sebagai teks untuk mencegah skrip dan gambar tracking dari email masuk.
Mailbox ini adalah satu akun/folder per workspace. Login OAuth Gmail/Microsoft belum disediakan; bila kebijakan provider menolak app password/IMAP/SMTP, akun tersebut perlu konfigurasi provider yang sesuai atau adapter OAuth di pembaruan lain. Tidak ada penghapusan pesan atau perubahan Seen pada server IMAP; status baca/selesai di MailK bersifat lokal.
Thread dihubungkan melalui Message-ID/In-Reply-To/References dan identitas pengirim. Pesan tanpa header penghubung tetap masuk sebagai percakapan baru, tidak dipaksakan cocok melalui subject. Kontak baru masuk pending tanpa persetujuan marketing. SMTP balasan memakai In-Reply-To/References dan disimpan di CRM, tidak otomatis diappend ke folder Sent IMAP.
Balasan harus ditinjau dan dikonfirmasi. Status sent berarti diterima SMTP, bukan delivered. Jika timeout/interrupt, status uncertain dan tidak auto-resend; cek log provider untuk memastikan hasil sebelum membuat draft pengganti.

## Automation, laporan, tim
Trigger replied berlaku pada balasan yang terhubung ke campaign/percakapan sebelumnya. Campaign/autoresponder/automation baru memiliki opsi stop on reply; job email lanjutan yang belum dikirim pada campaign/flow terkait dihentikan ketika balasan datang, tanpa menghentikan campaign lain. Job legacy yang sudah antre sebelum upgrade tidak otomatis diberi flag baru.
Automation mendukung kondisi tambahan lifecycle/company/source/tag/replied dengan operator is/not/contains. Kondisi benar menjalankan action utama; kondisi salah bisa skip/task/tag. Actions utama: send/tag/untag/task/ticket. Delay berlaku pada kedua cabang. Untuk tag gunakan contains dan ID tag. replied memakai yes/no. Persetujuan marketing dan suppression tetap diperiksa untuk email marketing.
Inbox menyediakan penanggung jawab, status terbuka/selesai, tugas dan tiket. Hasil Campaign menampilkan accepted, open/klik unik, pelanggan yang membalas, serta pendapatan dari transaksi yang secara manual dikaitkan ke campaign. Ini atribusi manual, bukan klaim sebab-akibat; open/klik dapat dipengaruhi pemindai email.
Tim: admin dapat mengelola CRM/configuration, operator dapat mengelola CRM/draft/balasan tetapi tidak konfigurasi/kredensial/pengiriman campaign, viewer hanya membaca. Semua akun melihat workspace yang sama; belum ada pemisahan kontak per pengguna. Pengaturan sensitif dan pembuatan akun tetap membutuhkan password admin utama. Mengubah/menonaktifkan akun mencabut sesi akun tersebut.

## Backup dan restore
Backup & Pemulihan → masukkan password admin utama → unduh snapshot SQLite. Backup mencakup pengaturan terenkripsi, lampiran dan percakapan. Simpan SESSION_SECRET secara terpisah.
Pemulihan offline: hentikan aplikasi/container terlebih dahulu, lalu jalankan:

    DATA_DIR=/path/volume node restore.mjs /path/backup.sqlite --stopped

Jalankan perintah dari direktori paket dan gunakan SESSION_SECRET yang sama dengan backup ketika menghidupkan aplikasi. Script memeriksa integritas/table, menyimpan snapshot database lama, mengganti database, dan mencabut sesi/OAuth grant. --stopped adalah konfirmasi Anda bahwa aplikasi sudah berhenti; script tidak menghentikan container otomatis. Kredensial/aturan dalam backup ikut dipulihkan; periksa kembali koneksi setelah restore.

## Validasi
18 tes otomatis lulus, mencakup builder/AI, migrasi kredensial, CRM/MCP/OAuth lama, deduplikasi inbox, IMAP cursor, thread/attachment, SMTP uncertain, stop-on-reply, cabang task/ticket, metrics, role akun, backup/restore dan startup dari susunan file produksi.
Pemeriksaan browser memakai Chromium pada desktop/mobile, dengan provider AI/IMAP/SMTP simulasi. Akun/provider produksi belum diuji. Docker engine tidak tersedia pada lingkungan pemeriksaan: startup diuji dari file set yang disalin Dockerfile, bukan dengan menjalankan image Docker di sini.

## Dokumentasi adapter
- Mailketing API: https://api.mailketing.co.id/docs/
- ImapFlow: https://imapflow.com/docs/api/imapflow-client/
- SMTP: https://nodemailer.com/smtp
- MIME parsing: https://nodemailer.com/extras/mailparser
- Chat Completions: https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create
