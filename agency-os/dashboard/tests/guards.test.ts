import {test} from 'node:test';import assert from 'node:assert/strict';
import {authorize,validateSchedule} from '../server/guards.ts';
import {baliDate,toUTC,statusLabel} from '../src/lib/dates.ts';
test('denies missing, expired and wrong owner sessions',()=>{assert.equal(authorize(null,'owner'),false);assert.equal(authorize({id:'other',expires:Date.now()+10000},'owner'),false);assert.equal(authorize({id:'owner',expires:0},'owner'),false);assert.equal(authorize({id:'owner',expires:Date.now()+10000},'owner'),true)});
test('schedule is future ISO or null',()=>{assert.equal(validateSchedule(null),null);assert.throws(()=>validateSchedule('2020-01-01'));assert.throws(()=>validateSchedule('junk'));assert.throws(()=>validateSchedule('2099-01-01T10:00'));assert.equal(validateSchedule('2099-01-01T10:00:00Z'),'2099-01-01T10:00:00.000Z')});
test('Bali crosses UTC day correctly',()=>{assert.equal(baliDate('2026-10-11T17:30:00Z'),'2026-10-12');assert.equal(toUTC('2026-10-12T01:30'),'2026-10-11T17:30:00.000Z')});
test('scheduled is derived; drafts stay draft',()=>{assert.equal(statusLabel({status:'approved',scheduled_for:'2026-10-12'}),'Scheduled');assert.equal(statusLabel({status:'approved',scheduled_for:null}),'Approved');assert.equal(statusLabel({status:'draft',scheduled_for:'2026-10-12'}),'Draft')});
