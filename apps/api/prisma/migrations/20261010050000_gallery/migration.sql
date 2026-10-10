-- Gallery of the salon's work. Images are resized in the browser (≤ 1600 px) before upload.
CREATE TABLE "Photo" (
    "id" UUID NOT NULL,
    "data" BYTEA NOT NULL,
    "mime" TEXT NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Photo_mime_check" CHECK ("mime" IN ('image/jpeg', 'image/png', 'image/webp')),
    CONSTRAINT "Photo_size_check" CHECK (octet_length("data") <= 3000000 AND "width" > 0 AND "height" > 0)
);
CREATE INDEX "Photo_createdAt_idx" ON "Photo"("createdAt");
