import test from 'node:test';
import assert from 'node:assert/strict';
import {
  USER_ID_PATTERN,
  createCallsignItem,
  createUserIdentity,
  deleteCallsignItem,
  generateReadableUserId,
  isValidReadableUserId,
  setActiveCallsign,
  updateCallsignItem
} from './identityCallsigns.ts';

test('generateReadableUserId matches NB-XXXX-XXXX format and validates cleanly', () => {
  for (let i = 0; i < 15; i += 1) {
    const id = generateReadableUserId();
    assert.match(id, USER_ID_PATTERN);
    assert.equal(isValidReadableUserId(id), true);
  }
  assert.equal(isValidReadableUserId('NB-123-ABCD'), false);
  assert.equal(isValidReadableUserId('not-an-id'), false);
});

test('createUserIdentity preserves valid existingUserId and authenticates provider', () => {
  const fixed = createUserIdentity({
    authUid: 'uid-google-1',
    linkedProvider: 'google',
    existingUserId: 'NB-7F3K-92QX',
    createdAt: '2026-11-20T10:00:00.000Z'
  });
  assert.equal(fixed.userId, 'NB-7F3K-92QX');
  assert.equal(fixed.linkedProvider, 'google');
  assert.equal(fixed.authUid, 'uid-google-1');
});

test('createCallsignItem allows duplicate displayNames and enforces single active callsign', () => {
  const first = createCallsignItem({
    id: 'cs-1',
    userId: 'NB-7F3K-92QX',
    displayName: 'Alex Ops',
    avatar: '🧭',
    existingCallsigns: []
  });
  assert.equal(first.created.isActive, true);
  assert.equal(first.callsigns.length, 1);

  const duplicate = createCallsignItem({
    id: 'cs-2',
    userId: 'NB-7F3K-92QX',
    displayName: 'Alex Ops',
    avatar: '⚡️',
    isActive: true,
    existingCallsigns: first.callsigns
  });
  assert.equal(duplicate.callsigns.length, 2);
  assert.equal(duplicate.callsigns[0].displayName, 'Alex Ops');
  assert.equal(duplicate.callsigns[1].displayName, 'Alex Ops');
  assert.equal(duplicate.callsigns.filter((c) => c.isActive).length, 1);
  assert.equal(duplicate.callsigns[0].id, 'cs-2');
  assert.equal(duplicate.callsigns[0].isActive, true);
});

test('setActiveCallsign, updateCallsignItem, and deleteCallsignItem keep an active fallback', () => {
  const { callsigns: c1 } = createCallsignItem({
    id: 'cs-a',
    userId: 'NB-7F3K-92QX',
    displayName: 'Alpha',
    existingCallsigns: []
  });
  const { callsigns: c2 } = createCallsignItem({
    id: 'cs-b',
    userId: 'NB-7F3K-92QX',
    displayName: 'Beta',
    isActive: true,
    existingCallsigns: c1
  });

  const switched = setActiveCallsign(c2, 'cs-a');
  assert.equal(switched.find((c) => c.id === 'cs-a')?.isActive, true);
  assert.equal(switched.find((c) => c.id === 'cs-b')?.isActive, false);

  const edited = updateCallsignItem(switched, 'cs-b', { displayName: 'Beta Prime', avatar: '🚀' });
  assert.equal(edited.find((c) => c.id === 'cs-b')?.displayName, 'Beta Prime');
  assert.equal(edited.find((c) => c.id === 'cs-b')?.avatar, '🚀');

  const afterDelete = deleteCallsignItem(edited, 'cs-a');
  assert.equal(afterDelete.length, 1);
  assert.equal(afterDelete[0].id, 'cs-b');
  assert.equal(afterDelete[0].isActive, true);
});
