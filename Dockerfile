# HR-ITS production image (office server, behind nginx).
#
# PENTING: stage 2 hanya menyalin path yang ditulis di bawah. Kalau
# server.ts mulai mengimpor file/folder baru di luar `server/` atau
# `src/lib/`, tambahkan baris COPY-nya di sini — kalau tidak, container
# crash saat start (ERR_MODULE_NOT_FOUND) dan nginx membalas 504
# (kejadian 2026-10-18 setelah commit f860715).

# Stage 1: Build React App
FROM node:24.22.1-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Build aplikasi (Vite akan membaca file .env saat proses ini)
RUN npm run build

# Stage 2: Production Node.js Server
FROM node:24.22.1-alpine
WORKDIR /app

# Set environment ke production agar server.ts menyajikan folder dist/
ENV NODE_ENV=production

# Copy file yang dibutuhkan dari stage builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
# Route backend (server/routes, auth, access, supabase)
COPY --from=builder /app/server ./server
# Helper tanpa dependency yang dipakai server & browser
# (documentPaths, normalize, scheduleStatus)
COPY --from=builder /app/src/lib ./src/lib
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Expose port backend
EXPOSE 3000

# Jalankan server.ts menggunakan tsx
CMD ["npx", "tsx", "server.ts"]
