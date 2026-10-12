# Perubahan

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
