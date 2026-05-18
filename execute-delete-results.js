#!/usr/bin/env node

/**
 * PANDUAN EKSEKUSI SQL DI SUPABASE
 * 
 * Ada 3 cara untuk menghapus hasil race:
 */

console.log(`
╔════════════════════════════════════════════════════════════════╗
║        CARA MENGHAPUS HASIL RACE EVENT DI SUPABASE             ║
╚════════════════════════════════════════════════════════════════╝

📋 OPSI 1: VIA SUPABASE DASHBOARD (PALING MUDAH)
   1. Buka https://app.supabase.com
   2. Login ke project Anda
   3. Klik "SQL Editor" (atau "SQL" tab)
   4. Buat query baru
   5. Copy isi dari file: delete_race_results.sql
   6. Klik "RUN" atau tekan Ctrl+Enter
   7. Tunggu selesai ✅

📋 OPSI 2: VIA TERMINAL (DENGAN psql)
   1. Install PostgreSQL (untuk psql command)
   2. Dapatkan connection string dari Supabase:
      - Buka Project Settings → Database → Connection String
      - Pilih "URI" atau "psql"
   3. Jalankan command:
      psql "<YOUR_CONNECTION_STRING>" -f delete_race_results.sql

📋 OPSI 3: VIA SCRIPT NODEJS (PERLU SERVICE ROLE KEY)
   1. Set environment variables:
      export SUPABASE_URL="https://your-project.supabase.co"
      export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
   
   2. Jalankan:
      node execute-delete.js

═══════════════════════════════════════════════════════════════════

📌 CATATAN PENTING:
   ✓ Proses ini akan MENGHAPUS SEMUA HASIL RACE dari event
   ✓ Tidak bisa di-undo! Backup data jika perlu
   ✓ Event ID: d3857847-99b3-4fee-9177-296b92bb7430
   
═══════════════════════════════════════════════════════════════════
`);

// Jika ada argument, tampilkan link langsung ke Supabase
if (process.argv[2] === "--show-link") {
  console.log(`
Buka Supabase SQL Editor:
https://app.supabase.com/project/_/sql/new

Kemudian paste isi file: delete_race_results.sql
  `);
}
