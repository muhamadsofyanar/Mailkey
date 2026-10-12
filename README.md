# MailK CRM — aplikasi mandiri untuk Mailketing

Versi perbaikan 0.3.0, dibangun dari 16 screenshot alur plugin Mailketing CRM. Aplikasi ini implementasi baru, bukan salinan kode plugin, dan tidak memerlukan WordPress atau lisensi plugin. Memerlukan akun/kredit Mailketing untuk pengiriman nyata.

## Fitur yang sudah tersedia

- Dashboard statistik kontak, antrean, accepted provider, open unik, top tags, aktivitas terbaru.
- Login satu admin; cookie HttpOnly/SameSite; session 12 jam; pembatasan percobaan login; pemeriksaan origin.
- Kontak CRUD, pencarian, filter, pagination 50 kontak, tag, status, pencatatan persetujuan.
- Tags berwarna; custom field text/number/date/email; validasi field wajib.
- Segmen dinamis AND/OR dengan aturan tag/status/nama/email/custom field/open/click; export segmen.
- Import CSV empat langkah: upload, mapping, tags, import; separator koma/titik koma; kutip dan multiline; batas 10 MB / 10.000 baris; deduplikasi email; laporan error per baris.
- Export CSV termasuk custom field; mitigasi formula spreadsheet pada nilai teks.
- Template HTML dan editor blok heading/teks/gambar/tombol/divider, drag reorder, preview sandbox, merge tags.
- Campaign draft/terjadwal WIB; include tags/segments OR; exclude tags/segments; hitung penerima sebelum kirim; cancel antrean.
- Autoresponder berbasis tag, delay berurutan, banyak langkah, pause/resume, pilihan kontak yang sudah memiliki tag.
- Automation contact_added/tag_added/opened/clicked dengan delay dan action send/tag/untag.
- Worker antrean persisten, accepted/failed/uncertain/skipped/cancelled; retry manual; retry 429 setelah dua menit; pause global pada 401/402/403.
- Tracking pixel open dan link click milik aplikasi; unsubscribe dengan halaman konfirmasi; suppression bertahan walaupun kontak dihapus/import ulang.
- API CRM tambah/tag/baca/hapus kontak; token tersendiri.
- Integrasi Mailketing v2: send, credits, senders, lists, subscribers (sync satu kontak ke list).
- Webhook bounce/unsubscribe/newsubscriber/open/click; secret pada URL webhook. New subscriber belum ada disimpan pending sampai persetujuan terverifikasi melalui tombol Verifikasi consent. List_id dan tanggal event disimpan; webhook berulang dideduplikasi.
- Audit aktivitas admin dan script snapshot database.
- Halaman integrasi dengan tabel sender/list, pilihan list berdasarkan nama, pemilihan sender, tombol salin webhook, validasi empty state sync, dan pesan sukses yang jelas.
- Profil kontak dengan sumber data, bukti persetujuan, list Mailketing, serta riwayat email/aktivitas.
- Aktivasi kontak pending lewat verifikasi persetujuan dan catatan bukti; unsubscribe/bounce tetap dilindungi suppression.

## Arsitektur versi awal

Node.js 24 + HTTP server bawaan + SQLite WAL + frontend HTML/CSS/JavaScript. Tidak perlu npm install. Satu container menjalankan server dan worker. Pilihan ini menyederhanakan deployment awal satu VPS dibanding PostgreSQL + Redis + worker terpisah.

**Jalankan satu replica saja.** Jangan shared-volume ke beberapa instance. Ini belum ditujukan untuk multi-tenant, banyak admin, horizontal scaling, atau volume jutaan kontak. Gunakan migrasi PostgreSQL/worker terpisah ketika kebutuhan skala tersebut muncul. Node 24 masih memberi peringatan experimental untuk node:sqlite; versinya harus dipertahankan dan diuji saat upgrade.

## Setup lokal

1. Node.js 24 atau lebih baru.
2. Salin `.env.example` menjadi `.env`.
3. Isi ADMIN_EMAIL, ADMIN_PASSWORD minimal 12 karakter, SESSION_SECRET minimal 32 karakter. Isi APP_URL=http://localhost:3000 untuk lokal.
4. Jalankan `node --env-file=.env server.mjs`.
5. Buka http://localhost:3000 dan login dengan kredensial yang Anda isi.
6. Isi identitas pengirim/alamat bisnis di Settings. Pengiriman global default **nonaktif**.

Jangan masukkan `.env`, token, database, atau password ke GitHub.

## GitHub → Coolify → VPS → domain

1. Buat repository GitHub **private** lalu upload seluruh isi folder ini, termasuk Dockerfile, compose.yaml, public/, package.json, server.mjs, backup.mjs. Jangan upload file `.env`/data/. Jika upload melalui antarmuka web GitHub, pastikan file bertitik ikut tersedia; `.env.example` hanya contoh tanpa rahasia.
2. Di Coolify buat resource aplikasi dari repository tersebut, pilih build pack Dockerfile. Alternatif: Docker Compose dengan compose.yaml.
3. Port aplikasi **3000**. Set health check `/health`.
4. Pasang persistent storage di **/app/data**. Ini wajib untuk mempertahankan kontak, session, template, campaign, dan jobs setelah redeploy.
5. Isi environment berikut melalui pengaturan secrets Coolify, bukan lewat GitHub:

| Environment | Isi |
|---|---|
| APP_URL | https://crm.domainanda.com, harus sama persis dengan origin domain website |
| ADMIN_EMAIL | Email login admin Anda |
| ADMIN_PASSWORD | Password kuat minimal 12 karakter |
| SESSION_SECRET | Secret acak minimal 32 karakter; jangan diganti tanpa rencana karena link tracking/unsubscribe lama memakai secret ini |
| MAILKETING_API_TOKEN | Token dari dashboard Mailketing → API Integration |
| WEBHOOK_SECRET | Secret acak untuk webhook URL |
| CRM_API_TOKEN | Secret terpisah untuk integrasi kontak CRM |
| FROM_NAME | Nama bisnis pengirim |
| FROM_EMAIL | Email pada domain yang diverifikasi di Mailketing |
| BUSINESS_ADDRESS | Alamat bisnis yang dicetak di footer email |

Generate masing-masing secret dengan `openssl rand -hex 32`. Gunakan nilai berbeda untuk tiap token/secret. Untuk Docker Compose, environment dipasang di Coolify sesuai variabel compose.

6. Arahkan DNS A subdomain CRM ke IP VPS. Pasang domain HTTPS pada resource Coolify dan deploy.
7. Masuk ke CRM, buka Integration → cek kredit, daftar sender, daftar list. Verifikasi domain pengirim di Mailketing; CRM tidak melakukan setup DNS pengirim otomatis.
8. Di dashboard Mailketing, menu Integrations → Webhook: pasang URL dari halaman Integration CRM untuk Bounce, Unsubscribe, dan New Subscriber. Open/click memakai tracking aplikasi; mengaktifkan webhook open/click tambahan dapat menggandakan aktivitas kontak (tetapi job open tetap dihitung unik).
9. Buat template, import kontak dengan consent yang benar, isi Settings, aktifkan pengiriman, lakukan satu send test ke alamat Anda sendiri. Verifikasi footer, link, inbox, bounce, dan unsubscribe sebelum campaign nyata.

Aplikasi belum terhubung ke GitHub/Coolify/VPS Anda dari sesi pembuatan ini. Deploy harus dilakukan pada akses milik Anda. Tidak ada password default yang disertakan. Isi ADMIN_EMAIL secara eksplisit; fallback email server untuk lokal adalah admin@example.com.

## Perilaku pengiriman

`accepted` = Mailketing menerima request API, bukan bukti email masuk inbox. Custom message_id dipakai untuk pencocokan job. Timeout/HTTP 5xx dapat terjadi setelah provider menerima email: job menjadi `uncertain` dan tidak dikirim ulang otomatis. Periksa log Mailketing dulu sebelum retry manual. API Mailketing yang didokumentasikan tidak menyediakan kontrak exactly-once, jadi tidak ada jaminan mutlak bebas duplikasi.

Worker default sekitar satu job per detik dan satu request yang berjalan sekaligus; belum diuji untuk throughput tinggi. Pause automation mempertahankan job tertunda; resume menjalankan job yang sudah jatuh tempo. Cancel campaign hanya menghentikan job queued, bukan request yang sudah berjalan.

Audience campaign dihitung ketika mulai dijalankan. HTML template disimpan sebagai snapshot ketika job masuk antrean. Identitas pengirim dibaca ketika job dikirim; jangan mengganti pengirim saat campaign berjalan. Data kontak diperiksa kembali sebelum setiap pengiriman.

Open rate berbasis pixel adalah estimasi: pemblokiran gambar, proxy privasi, dan pemindai email memengaruhi hasil. Click webhook provider tanpa message_id hanya diatribusikan ke kontak. Link click milik aplikasi dapat diatribusikan ke job/campaign.

Unsubscribe membutuhkan POST konfirmasi agar pemindai link tidak langsung mematikan subscription. One-click RFC 8058 headers belum tersedia melalui payload API yang dipakai. Re-consent kontak suppressed belum tersedia; jangan mengaktifkan ulang lewat database tanpa verifikasi persetujuan dan audit yang sesuai.

## API CRM

Semua endpoint di bawah memakai `Authorization: Bearer <CRM_API_TOKEN>`. Token ini tidak memiliki akses ke panel admin, settings, atau peluncuran campaign.

- POST `/api/add-contact`: `{"email":"customer@example.com","name":"Customer","consent":true,"tags":["ID_TAG"],"custom":{"kota":"Bandung"},"source":"form-website"}`. Consent harus berasal dari persetujuan yang sudah diverifikasi di sumber.
- POST `/api/tag-contact`: `{"email":"customer@example.com","tag":"ID_TAG","untag":"ID_TAG_LAMA"}`. Tag adalah ID dari CRM, bukan nama.
- GET `/api/contact?email=customer@example.com`
- POST `/api/remove-contact`: `{"email":"customer@example.com"}`. Penghapusan menyimpan suppression email untuk mencegah reimport aktif otomatis.

Untuk WordPress, Sejoli, WooCommerce, Elementor, Scalev, Lynk, Mayar, atau platform lain, implementasikan adapter/webhook yang memanggil endpoint di atas. **Belum ada konektor native untuk platform tersebut.** Sistem CRM inti tidak bergantung pada WordPress.

## Backup dan restore

Jangan sekadar menyalin file sqlite yang sedang aktif karena WAL mungkin masih berisi data. Gunakan snapshot konsisten:

`node backup.mjs /app/data/backup-2026-10-12.sqlite`

Jalankan dari terminal container. Script sudah ikut Docker image. File tujuan tidak boleh sudah ada. Unduh snapshot ke penyimpanan backup terpisah dari VPS. Jadwalkan backup melalui VPS/Coolify sesuai kebijakan Anda, karena jadwal backup otomatis belum disediakan aplikasi.

Restore: hentikan container, backup terlebih dahulu database lama, ganti `/app/data/crm.sqlite` dengan snapshot, hapus file WAL/SHM lama hanya saat container berhenti, pertahankan ownership agar user node dapat menulis, lalu mulai container. Uji restore di lingkungan terpisah sebelum mengandalkannya.

## Verifikasi yang sudah dijalankan

`npm test` menjalankan dua skenario integrasi dan dua uji helper:

1. Login/auth/origin, validasi email, deduplikasi, audience segmen, larangan launch ganda, webhook secret, suppression setelah unsubscribe dan reimport/delete.
2. Worker dengan provider simulasi, personalisasi HTML dan snapshot template, tracking links, normalisasi message_id webhook, deduplikasi open, profil kontak, pembatalan follow-up setelah unsubscribe, serta pengiriman melewati 120 job dari autoresponder yang dijeda.

Skenario pertama juga menguji verifikasi consent pending, penolakan bypass suppression, metadata subscriber/list, validasi tipe webhook, dan deduplikasi webhook.

Uji helper memastikan dukungan field sender_email/email, list_id/list_name, kontak eligible, dan perlindungan field routing subscriber. Skenario integrasi juga menguji sinkronisasi berhasil, input kontak/list kosong, dan penolakan API provider yang ditampilkan dengan jelas.

JavaScript frontend dan server sudah diperiksa dengan `node --check`. Provider simulasi tidak mengirim email nyata. Belum dilakukan pengujian browser interaktif, build Docker, koneksi Mailketing live, deployment Coolify, load test, atau audit keamanan independen. Uji end-to-end pada domain Anda diperlukan sebelum pemakaian produksi.

## Batas penyempurnaan dibanding screenshot

- Editor template adalah editor blok sederhana; belum setara visual builder multi-column penuh.
- Tidak ada campaign groups, A/B testing, multi-user/roles, MFA/password reset, native platform connectors, attachment editor, multi-tenant, dan visual branching workflow.
- UI log menampilkan 500 job, 200 event, dan 100 audit terbaru; statistik agregat dihitung dari seluruh database. API/admin state memuat semua kontak, sehingga daftar besar perlu pagination server di tahap skala berikutnya.
- Sinkronisasi list menambahkan kontak CRM ke Mailketing; daftar kontak historis Mailketing tidak otomatis ditarik ke CRM karena endpoint baca subscriber tidak ada dalam API yang dipakai. Import melalui CSV jika ingin membawa data lama.

Tidak ada klaim fitur ini sudah 100% identik dengan plugin. Ini versi awal fungsional yang dapat dipasang sendiri dan dikembangkan lebih lanjut.

## Referensi

- https://crm.mailketing.co.id/
- https://api.mailketing.co.id/docs/
- https://api.mailketing.co.id/docs/webhook.html
- 16 screenshot dashboard yang diberikan pengguna; data pelanggan dan saldo dari screenshot tidak dimasukkan sebagai data awal aplikasi.
