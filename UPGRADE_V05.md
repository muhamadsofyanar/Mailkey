# Upgrade ke v0.5

1. Backup database melalui prosedur README sebelum mengganti kode.
2. Upload seluruh isi folder mailk-crm ke root repository GitHub lama.
3. Pastikan public/import-tools.js ikut diupload. Pertahankan environment dan volume /app/data.
4. Redeploy Coolify dan refresh Ctrl+Shift+R.
5. Uji dengan kontak sendiri sebelum campaign massal.

## Memperbaiki CSV sumber

Import ulang tanpa menghapus kontak. No Telepon (berisi nama) dipetakan ke name; Nama Lengkap (berisi nomor) ke phone; Email address ke email. Pilih mode Perbarui sesuai CSV, periksa preview lalu simpan. Kolom lain bisa dipetakan ke custom field. Persetujuan promosi hanya dicentang bila ada bukti; nomor telepon Indonesia dibakukan ke +62.

## Aksi massal

Centang baris, judul tabel untuk halaman ini, atau Pilih semua hasil filter. Pilihan bertahan lintas halaman. Tambah tag, Sinkronkan pilihan, atau Hapus pilihan. Hapus tetap memblokir email di CRM dan melindungi kontak dengan riwayat bisnis; tidak menghapus subscriber Mailketing.

## Campaign

Pilih Semua kontak aktif dengan persetujuan atau Pilih berdasarkan tag/segmen. Exclude tetap berlaku. Hitung penerima menampilkan jumlah dan contoh. Pilihan filtered wajib memiliki include. Preview adalah estimasi saat diperiksa; penerima dihitung ulang saat campaign berjalan.

## Sinkronisasi

Aktifkan otomatisasi dan list tujuan di Integrasi sebelum sinkronisasi massal. Hanya kontak eligible masuk antrean; kontak yang sudah tersinkron atau memiliki job dilewati. Job gagal dicoba ulang dari Status Sinkronisasi. Sinkronisasi tetap CRM ke Mailketing; data lama dari Mailketing perlu CSV.

Riwayat batch mencatat import; pembatalan/undo import belum tersedia. Cadangan diperlukan untuk memulihkan data sebelumnya.
