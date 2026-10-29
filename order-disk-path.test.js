import test from 'node:test';
import assert from 'node:assert/strict';
import {orderDiskFolderPath} from './order-disk-path.js';

test('parent and all its works share clients/year/month/compact parent id',()=>{
 const orders=[{id:'CD-MVSH7K9Y-67E7',createdAt:'2026-10-28T19:00:00Z'},
 {id:'CD-MVSH7K9Y-67E7_W1',parentOrderId:'CD-MVSH7K9Y-67E7',createdAt:'2026-11-01T10:00:00Z'},
 {id:'CD-MVSH7K9Y-67E7_W2',parentOrderId:'CD-MVSH7K9Y-67E7'}];
 for(const order of orders)assert.equal(orderDiskFolderPath(order.id,orders),'/clients/2026/10/MVSH7K9Y-67E7');
});
test('creation month is padded, follows Moscow date, and never follows the deadline',()=>{
 const orders=[{id:'CD-TEST',createdAt:'2025-12-31T22:00:00Z',date:'20.05.2026'}];
 assert.equal(orderDiskFolderPath('CD-TEST',orders),'/clients/2026/01/TEST');
});
test('legacy missing dates use supplied stable fallback; unknown orders and unsafe ids fail',()=>{
 assert.equal(orderDiskFolderPath('CD-OLD',[{id:'CD-OLD'}],{fallbackDate:'2024-02-01'}),'/clients/2024/02/OLD');
 assert.throws(()=>orderDiskFolderPath('missing',[]));
 assert.throws(()=>orderDiskFolderPath('../oops',[{id:'../oops'}]));
});
