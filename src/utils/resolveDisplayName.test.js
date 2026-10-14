import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDisplayName, isGenericName } from './resolveDisplayName.js';

test('staged queue name wins over everything', () => {
  const got = resolveDisplayName({ studentName: 'Not provided', to_number: '919391751639' }, { name: 'Akash' });
  assert.equal(got, 'Akash');
});

test('sheet rawFields name used when direct name is generic', () => {
  const got = resolveDisplayName(
    { studentName: 'Not provided', to_number: '919391751639', rawFields: { student_name: 'Srikar' } },
    null
  );
  assert.equal(got, 'Srikar');
});

test('name recovered from caller stating it in transcript', () => {
  const got = resolveDisplayName(
    { studentName: 'Student', to_number: '919391751639', call_conversation: 'agent: hello\nuser: my name is Arjun' },
    null
  );
  assert.equal(got, 'Arjun');
});

test('name recovered from bot greeting in transcript', () => {
  const got = resolveDisplayName(
    { studentName: 'Student', to_number: '919391751639', call_conversation: 'agent: Hello Priya, thanks for your time' },
    null
  );
  assert.equal(got, 'Priya');
});

test('agent greeting question never counts as caller interest-name', () => {
  const got = resolveDisplayName(
    { studentName: 'Student', to_number: '919391751639', call_conversation: 'agent: Are you interested?' },
    null
  );
  assert.equal(got, '+919391751639');
});

test('name recovered from rawFields.full_conversation when top-level transcript is empty', () => {
  const got = resolveDisplayName(
    { studentName: 'Student', to_number: '917016466503', call_conversation: '', rawFields: { full_conversation: 'agent: hi\nuser: my name is Kiran', student_name: 'Student' } },
    null
  );
  assert.equal(got, 'Kiran');
});

test('genuinely unknown name falls back to plain phone, never Recipient() wrapper', () => {
  const got = resolveDisplayName({ studentName: 'Not provided', to_number: '919391751639' }, null);
  assert.equal(got, '+919391751639');
  assert.ok(!got.includes('Recipient'));
});

test('Not provided counts as generic', () => {
  assert.equal(isGenericName('Not provided'), true);
  assert.equal(isGenericName('Recipient (+91939)'), true);
  assert.equal(isGenericName('Akash'), false);
});
