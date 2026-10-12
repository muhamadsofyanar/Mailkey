# MailK CRM v0.6.1: koneksi Claude web

Versi ini memperbarui v0.6.0 dengan OAuth untuk Claude web dan panel Integrasi AI / MCP. Fitur v0.6.0 dan perbaikan Docker tetap tersedia.

## Upgrade di GitHub / Coolify

1. Backup database SQLite menggunakan `backup.mjs`.
2. Upload seluruh isi folder `mailk-crm` ke lokasi source aplikasi yang sama. Sertakan file baru **oauth.mjs**, serta **mcp.mjs** dan **Dockerfile** terbaru.
3. Pertahankan environment lama, terutama SESSION_SECRET, akun admin, APP_URL dan volume database. Jangan menghapus volume atau mengubah SESSION_SECRET.
4. Pastikan APP_URL sesuai domain HTTPS aplikasi. Contoh: `https://app.ruanglegalitas.com`, tanpa `/mcp` atau slash penutup.
5. Commit dan redeploy. Periksa container healthy. Refresh browser dengan Ctrl+F5.

OAuth memakai akun admin yang sudah ada dan aktif secara default. Tidak perlu menambahkan env OAuth baru. MCP_API_TOKEN boleh tetap disimpan untuk Hermes/Claude Code. Secret tersebut tidak perlu dimasukkan ke konektor OAuth Claude.

## Hubungkan Claude web

1. Pada MailK, buka Pengaturan → Buka pengaturan AI, atau menu Integrasi AI / MCP.
2. Aktifkan OAuth, lalu salin URL server MCP.
3. Pada Claude, tambahkan konektor kustom. Nama bebas, misalnya Ruang. URL: `https://app.ruanglegalitas.com/mcp` bila domain itu dipakai pada APP_URL.
4. Pilih **Masuk sekarang**.
5. Pada **Klien OAuth**, pilih **Daftar otomatis**. Versi ini mendukung Dynamic Client Registration, belum mendukung opsi identitas resmi Claude/CIMD.
6. Transport: **Streamable HTTP**. Klik Tambahkan, lalu hubungkan bila diminta.
7. Login di halaman MailK menggunakan akun admin CRM. Pilih **Izinkan akses**. Browser kembali ke Claude.
8. Uji permintaan baca: “Tampilkan jumlah kontak di CRM saya.”

Jangan memilih Tanpa masuk. Jangan mengisi MCP_API_TOKEN sebagai client ID/secret OAuth. Kode 401 tanpa token tetap normal: respons sekarang menyertakan lokasi metadata OAuth agar Claude dapat memulai login.

## Pengaturan dan pencabutan

Panel Integrasi AI / MCP menampilkan status OAuth, URL, status token statis dan daftar koneksi. Cabut akses per koneksi dari panel tersebut. Menonaktifkan OAuth mencabut seluruh grant OAuth dan menghapus kode/persetujuan yang belum selesai. Mengaktifkan kembali membutuhkan login/izin baru di Claude. Token statis environment tidak ikut dicabut oleh pengaturan OAuth.

## Batasan dan validasi

OAuth: authorization code + PKCE S256, discovery metadata, DCR untuk callback Claude ai/com, kode sekali pakai 5 menit, access token 1 jam, refresh token berotasi dengan masa berlaku 30 hari, serta revoke. Token disimpan sebagai hash pada database. Versi ini hanya mendukung OAuth client publik (`none`), satu akun admin dan scope `mcp` untuk workspace pribadi. Hermes tetap dapat memakai bearer token lama.

Sembilan tes backend lulus, termasuk alur OAuth, salah PKCE/resource, replay kode, refresh, pencabutan akses dan bridge. Runtime sesuai instruksi COPY Docker diperiksa terpisah. Tes ini mensimulasikan OAuth client, bukan koneksi ke akun Claude pengguna. Koneksi Claude web dan tampilan browser produksi harus diperiksa setelah deployment.
