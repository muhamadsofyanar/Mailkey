# v0.6.4
- Pengaturan koneksi dan akun admin di aplikasi.
- Migrasi environment satu kali, enkripsi AES-256-GCM, password scrypt.
- Ganti/cabut/generate token, tes koneksi, pembatalan sesi setelah perubahan akun.
- Perbaikan Compose: kunci MCP duplikat dihapus, admin seed opsional setelah migrasi.
- 10 tes otomatis lulus.

# v0.6.3

- Persetujuan OAuth menangani Origin null/kosong dengan sesi dan CSRF yang tetap wajib.
- Origin asing eksplisit tetap ditolak.
- Referrer-Policy same-origin khusus halaman OAuth.

# v0.6.2

- Persetujuan ulang massal dengan preview, evidence, audit dan perlindungan bounce.
- Sesi OAuth SameSite=Lax khusus /oauth; cookie CRM tetap Strict.
- Pesan kesalahan sesi/origin terpisah; callback CSP sesuai Claude.

# v0.6.1

- OAuth Claude web: metadata discovery, DCR, login admin, izin akses, PKCE S256, refresh rotation dan revoke.
- Pengaturan Integrasi AI / MCP dalam aplikasi; URL salin dan daftar koneksi.
- Token statis Hermes/Claude Code tetap tersedia.
- Dockerfile menyalin mcp.mjs dan oauth.mjs serta memeriksa syntax saat build.

# Perubahan

## 0.5.0

- Preview import sebelum menyimpan; saran mapping berdasarkan isi nama/telepon.
- Duplikat: lewati, isi kosong, tinjau konflik, atau perbarui nilai tidak kosong.
- Normalisasi nomor telepon Indonesia; sumber dan tanggal pendaftaran dipertahankan.
- Custom field dapat dibuat saat mapping; batch import dan unduhan laporan kesalahan.
- Centang kontak lintas halaman/filter; tag, sinkronisasi dan hapus massal.
- Pilihan semua kontak aktif atau include tag/segmen; preview jumlah dan contoh penerima.
- Consent dan suppression tetap dilindungi; riwayat CRM mencegah hapus permanen.
- Enam pengujian otomatis; browser dan fitur baru pada Mailketing asli belum diverifikasi.
- Belum ada undo import maupun penarikan subscriber lama dari Mailketing.

## 0.5.0

- Preview import, strategi duplikat, normalisasi telepon dan laporan konflik.
- Pembuatan custom field saat mapping dan pencatatan batch import.
- Pilihan massal untuk hapus, tag, dan sinkronisasi; preview penerima campaign.
- Tujuh pengujian otomatis berhasil.


## 0.5.0

- Preview import di server dan browser sebelum penyimpanan; saran mapping berdasarkan isi, termasuk kolom nama–telepon tertukar.
- Pilihan duplikat: lewati, isi kosong, perbarui field yang terisi, atau tinjau konflik.
- Normalisasi email/telepon, sumber lead dan tanggal pendaftaran dipertahankan.
- Custom field dapat dibuat saat mapping, riwayat batch dan unduhan laporan masalah CSV.
- Tag dan sinkronisasi massal untuk kontak terpilih; sinkronisasi memakai list otomatis yang telah dikonfigurasi.
- Konfirmasi jumlah dan contoh penerima sebelum menjalankan campaign; unsubscribe dan proteksi riwayat tetap berlaku.
- Tidak ada penarikan kontak lama Mailketing otomatis, undo import, atau normalisasi kategori/provinsi/omzet yang ambigu.


## 0.4.1

- Centang kontak per baris, seluruh halaman, atau seluruh hasil filter; pilihan tersimpan lintas halaman.
- Hapus massal dengan preview jumlah, konfirmasi, proteksi riwayat CRM dan suppression email; tidak menghapus kontak di Mailketing.
- Endpoint integrasi hapus kontak kini juga melindungi riwayat CRM.
- Petunjuk include/exclude campaign menjelaskan penerima ketika filter kosong.
- Uji regresi mencakup preview, konfirmasi, duplikat ID, kontak hilang, proteksi dan suppression setelah import ulang.

## 0.4.0

- Pipeline penjualan, peluang dan nilai, perubahan tahap serta penanggung jawab.
- Tugas follow-up, catatan interaksi, transaksi pelanggan, keluhan/pelayanan dan CSAT.
- Lifecycle komersial terpisah dari status langganan email.
- Profil pelanggan memuat seluruh riwayat CRM terkait.
- Segmen dapat memakai lifecycle, perusahaan, dan sumber lead; import/export mendukung metadata tersebut.
- Laporan berperiode dengan pendapatan dibayar, pembelian ulang, win rate, serta nilai historis R/F/M.
- Sync otomatis anggota list Mailketing untuk kontak CRM yang eligible, antrean dan retry terbatas.
- Diagnostic sync memperlihatkan webhook masuk dan status subscriber sync.
- Mencegah penghapusan kontak yang sudah memiliki riwayat bisnis; pengguna dapat mengarsipkan tahap komersial.
- Tabel syncjobs dibuat otomatis tanpa menghapus database lama.
- Lima pengujian otomatis berhasil; layar baru dan fitur otomatis tetap perlu diuji live pada VPS Anda.


## 0.3.0

- Perbaiki server error saat sync tanpa pilihan kontak; validasi kontak, consent, suppression, dan list positif.
- Sync menggunakan dropdown list Mailketing dan kontak dengan nama/email; empty state memberi tombol tambah/import.
- Response sender dengan sender_email atau email diadaptasi; daftar sender/list menjadi tabel dan action.
- Pilih sender langsung menyimpan pengaturan email; error provider/network ditampilkan dengan alasan yang dapat ditindaklanjuti.
- Simpan list dan waktu sinkronisasi pada kontak; custom field tidak bisa menimpa email/list tujuan payload.
- Sidebar navy, dashboard onboarding, integrasi bertahap, modal/form lebih jelas, responsivitas dan keyboard focus.
- URL webhook tidak ditampilkan secara default; tombol lihat/salin tersedia.
- Hasil import CSV menjadi ringkasan/tabel, bukan JSON; API docs tetap ada dalam panel pengembang yang dapat dibuka.
- Tambahkan module public/mailketing.js yang harus ikut diupload.
- Empat pengujian otomatis berhasil, mencakup regresi dan kontrak respons provider simulasi.


## 0.2.0

- Normalisasi message_id webhook dengan/tanpa angle brackets dan pencocokan kontak.
- Deduplikasi payload webhook; log payload persisten; pemrosesan webhook dalam transaksi.
- Simpan list subscriber dan waktu event; parsing waktu emailopen sebagai UTC.
- Aktivasi kontak pending setelah verifikasi consent dengan bukti tercatat; perlindungan suppression tetap berlaku.
- Profil kontak menampilkan riwayat aktivitas, pengiriman, sumber, dan persetujuan.
- Campaign enqueue dalam transaksi; snapshot HTML template saat job dibuat.
- Worker tidak tertahan oleh backlog automation/autoresponder paused.
- Send test tidak menimpa identitas kontak yang sudah ada.
- Log panel tidak memuat ulang HTML snapshot setiap job, sehingga payload state lebih ringan.
- Endpoint mutasi tertentu kini hanya menerima POST; validasi origin APP_URL diperketat.
- Panduan upload manual GitHub dan upgrade Coolify.
- Regression test diperluas dengan event subscriber, aktivasi pending, normalisasi ID, snapshot template, dan 120 job paused.

## 0.1.0

Implementasi awal berdasarkan screenshot plugin: kontak, tag, field, segmen, CSV, email, automation, Mailketing, dan deployment Docker.
