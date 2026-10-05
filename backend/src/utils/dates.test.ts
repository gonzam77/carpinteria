import assert from "node:assert/strict";
import test from "node:test";
import { fromDateOnly, toDateOnly, todayInBusinessZone } from "./dates.js";

test("hoy se cuenta en la zona de Argentina, no en UTC", () => {
  // 2026-10-05 a las 02:00 UTC todavia es 4 de octubre en Buenos Aires (UTC-3).
  assert.equal(todayInBusinessZone(new Date("2026-10-05T02:59:59Z")), "2026-10-04");
  assert.equal(todayInBusinessZone(new Date("2026-10-05T03:00:00Z")), "2026-10-05");
  assert.equal(todayInBusinessZone(new Date("2026-12-31T23:30:00-03:00")), "2026-12-31");
});

test("una fecha sin hora va y vuelve igual", () => {
  for (const value of ["2026-10-05", "2027-01-01", "2028-02-29"]) assert.equal(toDateOnly(fromDateOnly(value)), value);
  assert.equal(toDateOnly(null), null);
});

test("la columna @db.Date se escribe y se lee como medianoche UTC", () => {
  assert.equal(fromDateOnly("2026-10-05").toISOString(), "2026-10-05T00:00:00.000Z");
  assert.equal(toDateOnly(new Date("2026-10-05T00:00:00.000Z")), "2026-10-05");
});
