import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateCompanyPulse} from './company-pulse.js';
import {isValidIsoDate} from './work-catalog.js';

test('Company Pulse preserves decimal payment amounts',()=>{
  const result=calculateCompanyPulse([
    {id:'PAY-1',stage:'В доставке',sum:'1 234,50 ₽',paidAmount:100,createdAt:'2026-10-20T00:00:00Z',date:'31.12.2026'}
  ],[],new Date('2026-10-23T12:00:00Z'));
  assert.equal(result.payments.totalAmount,1234.5);
  assert.equal(result.payments.paidAmount,100);
  assert.equal(result.payments.outstandingAmount,1134.5);
});

test('calendar validation rejects impossible birth dates',()=>{
  assert.equal(isValidIsoDate('2026-02-31'),false);
  assert.equal(isValidIsoDate('2024-02-29'),true);
});
