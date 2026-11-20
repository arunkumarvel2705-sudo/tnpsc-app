# Spike: Tamil question extraction (AT-P3)

Week-1 risk test from the spec. No exam content is stored in this public repo; the source PDFs live in the
private `tnpsc-content` repo under `bronze/tnpsc/ccse4_2025/`.

## Source tested

Official CCSE-IV (Group 4) 2025 papers from tnpsc.gov.in, fetched by the `Fetch sources into Bronze`
workflow in `tnpsc-content` (this workspace cannot reach tnpsc.gov.in; GitHub's runners can).

## Findings (2026-11-21)

1. **The papers are scanned images, not text.** 128 pages, no fonts, no text layer. The legacy-font problem
   the spec anticipated does not apply; the problem is OCR quality. The final answer key is scanned too.
2. **Tentative-key papers carry blue handwritten ticks** on the answers. Removing blue pixels before OCR
   fixed dropped lines and wrong words on the test page. The ticks are also a second answer source.
3. **Tesseract 4.1 (`tam+eng`, psm 4) after blue removal** reads most Tamil words correctly, but in a
   hand-checked sample of 8 questions only 6 had fully correct text. Failures seen:
   - a whole word dropped from an option;
   - Tamil words inside quotation marks read as Latin gibberish;
   - match-the-following tables scrambled;
   - question numbers misread (e.g. 20 read as 90), so numbering must come from layout order;
   - option labels next to ticks garbled (fixable: every question has exactly A-E in order);
   - zero-width joiners inserted (fixable: strip U+200C/U+200D).
4. **Answer keys are not always one letter**: some are "B/C" (either accepted) or "ALL" (mark to everyone).
   The `Question.answer` contract must become a set of accepted options or ALL.
5. **Past papers contain English-to-Tamil technical-term questions**, a direct Term Bridge source.
6. Git LFS objects pull fine from this workspace.

## Verdict

Tesseract alone does not meet AT-P3 (target: 95% of questions fully correct). See the spec's Gate 0
decision for the recommended approach.

## Scripts

- `ocr_eval.py` – raw OCR plus Tamil word-confidence statistics for a page range.
- `clean_ocr.py` – blue-ink removal then OCR for one page.
- `tamil_section.py` – OCR the Tamil section and count structurally complete questions (its question
  splitter trusts OCR'd numbers and fails on misreads; kept to document that finding).
