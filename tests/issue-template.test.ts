import { expect, test } from 'bun:test';
import { ANSWER_FIELDS, ANSWER_OPTIONS, FIELDS, NO_SELECTION } from '../scripts/lib/issue-form';
import { CATEGORY_INFO } from '../src/lib/labels';
import { CATEGORIES, DIMENSIONS, VERDICTS } from '../src/lib/schema';

test('issue form labels and options match the intake parser', async () => {
  const form = Bun.YAML.parse(await Bun.file('.github/ISSUE_TEMPLATE/add-project.yml').text()) as {
    body: { type: string; attributes: { label?: string; options?: string[] } }[];
  };
  const field = (label: string) => form.body.find((b) => b.attributes.label === label);
  for (const label of Object.values(FIELDS)) expect(field(label)).toBeDefined();
  expect(field(FIELDS.category)!.attributes.options).toEqual(CATEGORIES.map((c) => CATEGORY_INFO[c]));
  for (const dim of DIMENSIONS) {
    expect(field(ANSWER_FIELDS[dim])!.attributes.options).toEqual(VERDICTS.map((v) => ANSWER_OPTIONS[v]));
  }
  // GitHub reserves this for an empty dropdown, so the parser reads it as no answer.
  expect(Object.values(ANSWER_OPTIONS)).not.toContain(NO_SELECTION);
});
