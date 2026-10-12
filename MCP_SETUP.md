# MCP MailK CRM v0.6.0

Server stateless Streamable HTTP tersedia pada `https://DOMAIN-CRM/mcp`, setelah `MCP_API_TOKEN` dipasang. Token minimal 32 karakter dan berbeda dari token Mailketing/CRM API. Token memberikan akses seluruh workspace CRM pribadi. Gunakan HTTPS untuk akses remote. Protokol yang didukung: 2025-03-26, 2025-06-18, 2025-11-25. Tidak ada SSE lama atau OAuth bawaan.

## Claude Code

```bash
claude mcp add --transport http mailk https://DOMAIN-CRM/mcp --header "Authorization: Bearer GANTI_DENGAN_MCP_API_TOKEN"
```

Buka `/mcp` dalam Claude Code untuk memeriksa koneksi. Jangan menyimpan token dalam repository publik.

## Claude Desktop

Gunakan Node 24 pada komputer tempat Claude Desktop berjalan. Salin `mcp-bridge.mjs` dari paket ke lokasi tetap, lalu tambahkan konfigurasi berikut ke konfigurasi MCP Claude Desktop. Sesuaikan path absolut dengan komputer Anda.

```json
{
  "mcpServers": {
    "mailk": {
      "command": "node",
      "args": ["/PATH-ABSOLUT/mcp-bridge.mjs"],
      "env": {
        "MAILK_MCP_URL": "https://DOMAIN-CRM/mcp",
        "MCP_API_TOKEN": "GANTI_DENGAN_MCP_API_TOKEN"
      }
    }
  }
}
```

Windows: gunakan path JSON seperti `C:\\MailK\\mcp-bridge.mjs`. Restart Claude Desktop setelah memperbarui konfigurasi.

**Claude web/claude.ai:** paket ini belum menyediakan login OAuth untuk custom connector web. Gunakan Claude Code atau bridge Desktop di atas. Untuk connector web dengan login pengguna, perlu gateway OAuth dan konfigurasi client lanjutan. Paket ini belum mengklaim koneksi langsung claude.ai siap digunakan.

## Hermes Agent

Tambahkan pada `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  mailk:
    url: "https://DOMAIN-CRM/mcp"
    headers:
      Authorization: "Bearer ${MAILK_MCP_TOKEN}"
```

Pasang `MAILK_MCP_TOKEN` pada environment Hermes, kemudian restart sesi agent.

## Tools

- `search_contacts`: pencarian, filter status, pagination 1–200.
- `contact_history`: kontak dan riwayat CRM.
- `crm_catalog`: tags, fields, segments, templates.
- `upsert_contact`: identitas dan custom field; kontak baru pending.
- `tag_contact`, `create_tag`, `create_custom_field`.
- `add_note`, `create_task`.
- `create_campaign_draft`, `preview_audience`, `crm_report`.

MCP tidak menyediakan hapus kontak, pemulihan consent, kirim, atau penjadwalan campaign. Perubahan kontak/tag lewat MCP tidak memicu autoresponder atau sinkronisasi provider otomatis. Pengiriman dan verifikasi consent dilakukan di UI CRM. Jangan mencoba kembali write tool secara otomatis setelah koneksi putus tanpa mengecek hasilnya karena catatan/tugas dapat terduplikasi.

Contoh permintaan: “Cari kontak perusahaan Acme”, “Buat catatan panggilan pada kontak ini”, “Buat tugas follow-up besok”, “Buat draft campaign memakai template Welcome”.

## Referensi implementasi

- https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- https://code.claude.com/docs/en/mcp
- https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp/
