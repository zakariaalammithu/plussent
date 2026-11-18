// Module B pure-logic tests — run with: node --test tests/campaigns.test.mjs
// Imports the TypeScript sources directly (Node 24 type-strips .ts on import).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getStepByNumber,
  nextSendAt,
  parseUtcOffset,
  renderTemplate,
  selectNextStep,
  shouldStop,
} from "../src/lib/campaigns.ts";
import { isValidEmail, parseCsvText, parseLeads } from "../src/lib/csv.ts";

// ---------------------------------------------------------------- renderTemplate
describe("renderTemplate", () => {
  it("replaces known tokens and leaves missing values empty", () => {
    const out = renderTemplate("Hi {{first_name}} {{last_name}} from {{company}} ({{email}})", {
      firstName: "Jane",
      lastName: "Doe",
      company: "Acme",
      email: "jane@acme.com",
    });
    assert.equal(out, "Hi Jane Doe from Acme (jane@acme.com)");
  });

  it("replaces a missing known token with an empty string", () => {
    assert.equal(renderTemplate("Hi {{first_name}}, {{company}}", { firstName: "Jane" }), "Hi Jane, ");
  });

  it("leaves unknown tokens untouched so typos stay visible", () => {
    assert.equal(renderTemplate("Hi {{frist_name}}", { firstName: "Jane" }), "Hi {{frist_name}}");
  });

  it("supports custom fields via {{custom.*}}", () => {
    assert.equal(
      renderTemplate("Plan: {{custom.plan}}", { customFields: { plan: "Growth" } }),
      "Plan: Growth",
    );
    assert.equal(renderTemplate("Plan: {{custom.plan}}", {}), "Plan: {{custom.plan}}");
  });

  it("builds full_name from first + last", () => {
    assert.equal(renderTemplate("{{full_name}}", { firstName: "Jane", lastName: "Doe" }), "Jane Doe");
  });
});

// ---------------------------------------------------------------- nextSendAt
describe("nextSendAt", () => {
  it("adds calendar days + minutes in UTC", () => {
    const from = new Date("2026-11-18T10:00:00.000Z");
    assert.equal(
      nextSendAt(from, { delayDays: 2, delayMinutes: 30 }).toISOString(),
      "2026-11-20T10:30:00.000Z",
    );
  });

  it("skips the weekend when businessDaysOnly: Friday + 1 business day = Monday", () => {
    // 2026-11-20 is a Friday.
    const friday = new Date("2026-11-20T10:00:00.000Z");
    assert.equal(friday.getUTCDay(), 5);
    const out = nextSendAt(friday, { delayDays: 1, businessDaysOnly: true });
    assert.equal(out.toISOString(), "2026-11-23T10:00:00.000Z");
    assert.equal(out.getUTCDay(), 1);
  });

  it("rolls a zero-delay weekend send forward to Monday", () => {
    const saturday = new Date("2026-11-21T10:00:00.000Z");
    assert.equal(saturday.getUTCDay(), 6);
    assert.equal(
      nextSendAt(saturday, { delayDays: 0, businessDaysOnly: true }).toISOString(),
      "2026-11-23T10:00:00.000Z",
    );
  });

  it("does NOT skip weekends when businessDaysOnly is false", () => {
    const friday = new Date("2026-11-20T10:00:00.000Z");
    assert.equal(
      nextSendAt(friday, { delayDays: 1, businessDaysOnly: false }).toISOString(),
      "2026-11-21T10:00:00.000Z",
    );
  });

  it("respects a UTC offset timezone", () => {
    // 10:00 UTC = 15:30 at +05:30; +1 calendar day keeps the local time.
    const from = new Date("2026-11-18T10:00:00.000Z");
    assert.equal(
      nextSendAt(from, { delayDays: 1, timezone: "+05:30" }).toISOString(),
      "2026-11-19T10:00:00.000Z",
    );
    // Friday 10:00 UTC is Friday 15:30 at +05:30; +1 business day = Monday 10:00 UTC.
    const friday = new Date("2026-11-20T10:00:00.000Z");
    assert.equal(
      nextSendAt(friday, { delayDays: 1, businessDaysOnly: true, timezone: "+05:30" }).toISOString(),
      "2026-11-23T10:00:00.000Z",
    );
  });

  it("parseUtcOffset handles the offset forms", () => {
    assert.equal(parseUtcOffset("+05:30"), 330);
    assert.equal(parseUtcOffset("-04:00"), -240);
    assert.equal(parseUtcOffset("UTC+5"), 300);
    assert.equal(parseUtcOffset("Z"), 0);
    assert.equal(parseUtcOffset("UTC"), 0);
    assert.equal(parseUtcOffset("not-a-zone"), 0);
  });
});

// ---------------------------------------------------------------- shouldStop
describe("shouldStop", () => {
  it("stops on reply / bounce / unsubscribe / meeting events", () => {
    for (const ev of ["reply", "replied", "bounce", "bounced", "unsubscribe", "unsubscribed", "meeting_request", "complaint"]) {
      assert.equal(shouldStop({ status: "sent" }, ev), true, ev);
    }
  });

  it("does not stop on open / click / delivered", () => {
    for (const ev of ["opened", "clicked", "delivered", "sent"]) {
      assert.equal(shouldStop({ status: "sent" }, ev), false, ev);
    }
  });

  it("stops when the lead is already in a terminal status, whatever the event", () => {
    for (const st of ["replied", "bounced", "unsubscribed", "stopped", "completed"]) {
      assert.equal(shouldStop({ status: st }, "opened"), true, st);
    }
    assert.equal(shouldStop({ status: "pending" }, "opened"), false);
    assert.equal(shouldStop(null, "opened"), false);
  });
});

// ---------------------------------------------------------------- sequence steps
describe("sequence step selection", () => {
  const steps = [
    { step: 1, subject: "A", body: "a" },
    { step: 2, subject: "B", body: "b" },
    { step: 3, subject: "C", body: "c" },
  ];
  it("selectNextStep returns the next step after the current one", () => {
    assert.equal(selectNextStep(steps, 1)?.step, 2);
    assert.equal(selectNextStep(steps, 3), null);
  });
  it("getStepByNumber finds an exact step", () => {
    assert.equal(getStepByNumber(steps, 2)?.subject, "B");
    assert.equal(getStepByNumber(steps, 9), null);
  });
});

// ---------------------------------------------------------------- CSV
describe("parseCsvText", () => {
  it("parses quoted fields with commas, quotes and newlines inside", () => {
    const rows = parseCsvText('email,company\n"jane@x.com","Acme, Inc."\n"bob@x.com","Say ""hi"""\n"a@b.co","line1\nline2"');
    assert.equal(rows.length, 4);
    assert.deepEqual(rows[0], ["email", "company"]);
    assert.deepEqual(rows[1], ["jane@x.com", "Acme, Inc."]);
    assert.deepEqual(rows[2], ["bob@x.com", 'Say "hi"']);
    assert.deepEqual(rows[3], ["a@b.co", "line1\nline2"]);
  });

  it("handles CRLF and a trailing newline without a phantom row", () => {
    const rows = parseCsvText("a,b\r\n1,2\r\n");
    assert.deepEqual(rows, [["a", "b"], ["1", "2"]]);
  });
});

describe("isValidEmail", () => {
  it("accepts normal addresses and rejects bad ones", () => {
    assert.equal(isValidEmail("jane@acme.com"), true);
    assert.equal(isValidEmail("not-an-email"), false);
    assert.equal(isValidEmail("a@b"), false);
    assert.equal(isValidEmail("a b@c.com"), false);
  });
});

describe("parseLeads", () => {
  const csv = [
    "Email,First Name,Company",
    "jane@acme.com,Jane,Acme",
    "not-an-email,Bob,Acme",
    ",NoMail,Acme",
    "JANE@acme.com,Jane Again,Acme",
    "bob@acme.com,Bob,Acme",
  ].join("\n");

  it("validates, dedupes in-file, and reports every invalid row with its line", () => {
    const r = parseLeads(csv, { Email: "email", "First Name": "firstName", Company: "company" });
    assert.equal(r.totalRows, 5);
    assert.equal(r.valid.length, 2);
    assert.deepEqual(
      r.valid.map((v) => v.email),
      ["jane@acme.com", "bob@acme.com"],
    );
    assert.equal(r.invalid.length, 3);
    assert.deepEqual(
      r.invalid.map((x) => x.row),
      [3, 4, 5],
    );
    assert.match(r.invalid[0].reason, /invalid email/);
    assert.match(r.invalid[1].reason, /missing required email/);
    assert.match(r.invalid[2].reason, /duplicate email in file/);
  });

  it("dedupes against existing workspace emails", () => {
    const r = parseLeads("email\nbob@acme.com\nalice@acme.com", undefined, new Set(["bob@acme.com"]));
    assert.equal(r.valid.length, 1);
    assert.equal(r.valid[0].email, "alice@acme.com");
    assert.equal(r.invalid.length, 1);
    assert.match(r.invalid[0].reason, /already exists/);
  });

  it("auto-matches well-known headers when no mapping is given", () => {
    const r = parseLeads("email,firstName,company\nx@y.co,X,Y Co");
    assert.equal(r.valid.length, 1);
    assert.equal(r.valid[0].firstName, "X");
    assert.equal(r.valid[0].company, "Y Co");
  });

  it("counts fully-empty rows as skipped, not as valid or invalid", () => {
    const r = parseLeads("email\nx@y.co\n\n");
    assert.equal(r.valid.length, 1);
    assert.equal(r.invalid.length, 0);
    assert.equal(r.skippedEmpty, 1);
  });
});
