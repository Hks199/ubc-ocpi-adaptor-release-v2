/*
  Warnings:

  - A unique constraint covering the columns `[authorization_reference]` on the table `session` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "session_authorization_reference_key" ON "session"("authorization_reference");
