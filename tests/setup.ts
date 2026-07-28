import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

afterEach(() => {
  delete process.env.DATABASE_URL;
  delete process.env.LOCAL_DATABASE_URL;
  delete process.env.REMOTE_DATABASE_URL;
  delete process.env.DATABASE_READ_TARGET;
  delete process.env.DATABASE_WRITE_TARGET;
  delete process.env.DATA_SYNC_ENABLED;
  delete process.env.DATA_SYNC_CHANNEL;
  delete process.env.DATA_SYNC_TARGET;
  delete process.env.DATA_SYNC_TARGET_URL;
});
