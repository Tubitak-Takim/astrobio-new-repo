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
it('exports saved symptoms separately from numeric readings and diagnoses',()=>{
  const data=structuredClone(crewFixture);
  data.crew[0].series[0].observations=[{source:'chat_self_report',measuredAt:'2026-11-15T12:00:00Z',values:{},symptoms:['dizziness','nausea']}];
  const csv=crewCsv(data,'C1');
  expect(csv).toContain('reportedSymptoms');
  expect(csv).toContain('dizziness|nausea');
  expect(crewCsv(data,'C2')).not.toContain('dizziness|nausea');
});
