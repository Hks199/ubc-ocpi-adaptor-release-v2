-- AlterTable
ALTER TABLE "evse_connector" ADD COLUMN     "ubc_catalog_id" TEXT,
ADD COLUMN     "ubc_publish_enabled" TEXT DEFAULT 'true',
ADD COLUMN     "ubc_publish_info" JSON DEFAULT '{}';
