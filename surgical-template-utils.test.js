import test from 'node:test';
import assert from 'node:assert/strict';
import {SURGICAL_TEMPLATE_CATEGORY,SURGICAL_TEMPLATE_OPTION,SURGICAL_SOCKET_OPTION,SURGICAL_SOCKETS_PER_JAW,isSurgicalTemplate,isSurgicalSocket,hasSurgicalJaw,surgicalJawCount,maxSurgicalSockets,surgicalVariantUnits,adjustSurgicalSockets,groupSurgicalSockets} from './public/assets/surgical-template-utils.js';

const upper=[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
const lower=[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
const variant=(workOption,selectedTeeth,units)=>({work:SURGICAL_TEMPLATE_CATEGORY,workOption,selectedTeeth,units});

test('one selected jaw creates one guide and allows up to 16 implant sockets',()=>{
  const guide=variant(SURGICAL_TEMPLATE_OPTION,upper);
  const socket=variant(SURGICAL_SOCKET_OPTION,upper,20);
  assert.equal(isSurgicalTemplate(guide),true);
  assert.equal(isSurgicalSocket(socket),true);
  assert.equal(hasSurgicalJaw(guide,'upper'),true);
  assert.equal(hasSurgicalJaw(guide,'lower'),false);
  assert.equal(surgicalJawCount(guide),1);
  assert.equal(maxSurgicalSockets(socket),SURGICAL_SOCKETS_PER_JAW);
  assert.equal(surgicalVariantUnits(guide),1);
  assert.equal(surgicalVariantUnits(socket),16);
  assert.equal(adjustSurgicalSockets(variant(SURGICAL_SOCKET_OPTION,upper,1),1),2);
  assert.equal(adjustSurgicalSockets(variant(SURGICAL_SOCKET_OPTION,upper,16),1),16);
  assert.equal(adjustSurgicalSockets(variant(SURGICAL_SOCKET_OPTION,upper,1),-1),1);
});

test('two selected jaws create two guides and allow up to 32 sockets',()=>{
  const guide=variant(SURGICAL_TEMPLATE_OPTION,[...upper,...lower]);
  const socket=variant(SURGICAL_SOCKET_OPTION,[...upper,...lower],32);
  assert.equal(surgicalJawCount(guide),2);
  assert.equal(surgicalVariantUnits(guide),2);
  assert.equal(maxSurgicalSockets(socket),32);
  assert.equal(surgicalVariantUnits(socket),32);
  assert.equal(adjustSurgicalSockets(socket,-1),31);
});

test('socket add-ons are grouped into the matching jaw template for the order summary',()=>{
  const upperGuide=variant(SURGICAL_TEMPLATE_OPTION,upper);
  const lowerGuide=variant(SURGICAL_TEMPLATE_OPTION,lower);
  const upperSocket=variant(SURGICAL_SOCKET_OPTION,upper,2);
  const lowerSocket=variant(SURGICAL_SOCKET_OPTION,lower,3);
  const groups=groupSurgicalSockets([upperGuide,upperSocket,lowerGuide,lowerSocket]);
  assert.equal(groups.length,2);
  assert.deepEqual(groups.map(group=>group.sockets.map(socket=>socket.index)),[[1],[3]]);
  assert.deepEqual(groups.map(group=>group.index),[0,2]);
  assert.equal(groupSurgicalSockets([upperGuide,upperSocket]).length,1);
});
