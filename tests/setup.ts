import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

afterEach(() => {
  delete process.env.DATABASE_URL;
});
