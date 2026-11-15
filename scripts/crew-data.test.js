import { expect, it } from 'vitest';
import { crewCsv } from '../frontend/js/crew-data.js';
import { crewFixture } from './crew-data.fixture.js';

it('exports only the selected authorized profile and the complete selected window',()=>{
  const csv=crewCsv(crewFixture,'C1');
  expect(csv.split('\n')).toHaveLength(9);
  expect(csv).toContain('C1,mars,53,synthetic_dataset');
  expect(csv).not.toContain('C2,');
  expect(csv).not.toContain('note');
});
