/*
  Warnings:

  - Added the required column `url` to the `ocpi_log` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ocpi_log" ADD COLUMN     "url" TEXT NOT NULL;
