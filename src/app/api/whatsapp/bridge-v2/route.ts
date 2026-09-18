// Dedicated ingestion endpoint for the external QR worker. Keeping this
// route separate from the legacy bridge path lets shared-hosting Passenger
// processes pick up the current worker transport without a stale handler.
export { POST } from '../bridge/route';
