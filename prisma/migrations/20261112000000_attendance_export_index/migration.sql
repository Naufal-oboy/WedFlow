-- Keyset CSV batches filter eventId, seek id and order id. The composite
-- index also serves the prior eventId-only lookup via its leading column.
BEGIN;
CREATE INDEX "Invitation_eventId_id_idx" ON "Invitation"("eventId", "id");
DROP INDEX "Invitation_eventId_idx";
COMMIT;
