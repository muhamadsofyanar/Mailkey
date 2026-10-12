# Upgrade MailK CRM v0.5 ke v0.6.0

1. Backup database sebelum mengganti source. Simpan `crm.sqlite` beserta WAL/SHM bila database masih berjalan; lebih baik gunakan skrip `backup.mjs` yang memakai SQLite backup.
2. Ganti source dengan isi folder `mailk-crm` paket ini. Pertahankan environment dan volume `crm-data` yang lama. Jangan menjalankan `docker compose down -v`.
3. Untuk MCP, isi environment `MCP_API_TOKEN` dengan secret acak minimal 32 karakter. Opsional; CRM tetap berjalan tanpa MCP.
4. Rebuild dan restart aplikasi. Node minimal versi 24. Uji `/health`, login, daftar kontak, preview impor, dan integrasi Mailketing.
5. Halaman kontak default 100 baris. Pilihan 25/50/100/200 disimpan pada browser. Pilihan kontak tetap tersimpan saat pindah halaman.

## Kontak lama berstatus unsubscribed

Versi 0.5 mencatat penghapusan data sebagai unsubscribe. Data lama tidak menyimpan alasan yang cukup untuk memisahkan keduanya secara otomatis. Versi ini tidak mengubah status lama saat startup.

Pada daftar kontak, klik **Persetujuan ulang** untuk satu kontak unsubscribed. Masukkan bukti persetujuan terbaru dan konfirmasikan verifikasi. Sistem mencatat aktivitas pemulihan. Kontak bounce tidak dapat dipulihkan dengan cara ini. Kontak pending menggunakan **Verifikasi consent**.

Penghapusan baru hanya menghapus data dan membatalkan antrean kontak itu. Unsubscribe/bounce yang sudah tercatat tetap berlaku setelah impor ulang. Kontak yang mempunyai riwayat CRM tetap dilindungi dari penghapusan; ubah tahap menjadi inactive melalui Edit untuk menandai kontak yang tidak lagi dikelola. Status inactive adalah tahap CRM dan tidak otomatis mengubah persetujuan email.

## Impor dan custom field

Preview menampilkan status serta alasan untuk contoh kontak dan jumlah status dalam rencana impor. Total ini menghitung operasi baris, termasuk email berulang, bukan jumlah email unik. Validasi tipe custom field tetap dijalankan saat penyimpanan; periksa laporan gagal setelah impor.

Klik **Buat custom field dari kolom CSV**, pilih kolom, periksa nama/key otomatis dan tipe data, lalu buat. Mapping langsung terpasang. Field yang sudah tersedia dikenali berdasarkan nama atau key. Tipe tanggal memakai YYYY-MM-DD. Key dapat diedit sebelum field dibuat.

## Validasi paket

Delapan tes otomatis backend lulus pada Node 24. Pengujian meliputi impor ulang setelah penghapusan, perlindungan unsubscribe, persetujuan ulang, mapping custom field, autentikasi MCP, dan worker pengiriman menggunakan provider uji. Integrasi akun Claude/Hermes pengguna dan provider produksi perlu diuji setelah deployment.

Pengujian browser otomatis belum dijalankan sampai selesai karena runtime tidak memiliki Chromium dan unduh browser gagal. Pemeriksaan syntax JavaScript lulus. Periksa alur tampilan pada browser Anda setelah deployment.
