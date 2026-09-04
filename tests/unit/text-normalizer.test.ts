import { describe, it } from "node:test";
import assert from "node:assert";
import { normalizeResumeText } from "../../src/utils/text-normalizer.util.js";

describe("normalizeResumeText", () => {
  it("1. converts Windows line endings (\\r\\n) and legacy Mac (\\r) to Unix (\\n)", () => {
    const raw = "Jane Doe\r\nSoftware Engineer\r\nBoston, MA";
    const expected = "Jane Doe\nSoftware Engineer\nBoston, MA";
    assert.equal(normalizeResumeText(raw), expected);
  });

  it("2. preserves Unix line endings (\\n)", () => {
    const raw = "Jane Doe\nSoftware Engineer\nBoston, MA";
    const expected = "Jane Doe\nSoftware Engineer\nBoston, MA";
    assert.equal(normalizeResumeText(raw), expected);
  });

  it("3. collapses excessive blank lines (3+ newlines -> 2 newlines)", () => {
    const raw = "Summary:\n\n\n\n\nExperienced Backend Engineer\n\n\n\nSkills:";
    const expected = "Summary:\n\nExperienced Backend Engineer\n\nSkills:";
    assert.equal(normalizeResumeText(raw), expected);
  });

  it("4. removes trailing whitespace from lines", () => {
    const raw = "Jane Doe    \nSoftware Engineer \t  \nBoston, MA   ";
    const expected = "Jane Doe\nSoftware Engineer\nBoston, MA";
    assert.equal(normalizeResumeText(raw), expected);
  });

  it("5. normalizes excessive horizontal whitespace between words", () => {
    const raw = "Senior    Backend     Engineer   with   Node.js";
    const expected = "Senior Backend Engineer with Node.js";
    assert.equal(normalizeResumeText(raw), expected);
  });

  it("6. preserves meaningful section headers and structure", () => {
    const raw = `SUMMARY
Experienced engineer with 6 years in cloud backend.

EXPERIENCE
Staff Engineer — ACME Corp (2021 - Present)
• Architected distributed services in TypeScript.

EDUCATION
MIT — B.S. in Computer Science (2018)`;

    const expected = `SUMMARY
Experienced engineer with 6 years in cloud backend.

EXPERIENCE
Staff Engineer — ACME Corp (2021 - Present)
• Architected distributed services in TypeScript.

EDUCATION
MIT — B.S. in Computer Science (2018)`;

    assert.equal(normalizeResumeText(raw), expected);
  });

  it("7. preserves Unicode characters, symbols, bullets, numbers, and dates", () => {
    const raw = "• Python & C++\n- Montréal / Zürich / São Paulo\n* €100k+ budget (2020–2024)";
    const expected = "• Python & C++\n- Montréal / Zürich / São Paulo\n* €100k+ budget (2020–2024)";
    assert.equal(normalizeResumeText(raw), expected);
  });

  it("8. removes unwanted ASCII control characters without removing Unicode or whitespace", () => {
    const raw = "Jane\x00 Doe\x07 —\x0B Backend\x1F Engineer\x7F";
    const expected = "Jane Doe — Backend Engineer";
    assert.equal(normalizeResumeText(raw), expected);
  });

  it("9. returns empty string for empty input, null, or whitespace-only input", () => {
    assert.equal(normalizeResumeText(""), "");
    assert.equal(normalizeResumeText("   \n\t\n  \r\n   "), "");
    assert.equal(normalizeResumeText(null), "");
    assert.equal(normalizeResumeText(undefined), "");
  });

  it("10. is idempotent (already normalized text remains unchanged)", () => {
    const clean = "Jane Doe\n\nSoftware Engineer\n• Node.js & PostgreSQL";
    assert.equal(normalizeResumeText(clean), clean);
    assert.equal(normalizeResumeText(normalizeResumeText(clean)), clean);
  });
});
