import test from 'node:test';
import assert from 'node:assert/strict';
import {routeForOrder,requiresCategory1AfterCam,isRestorationRoute,isDirectCategory1,normalizeProductionFlow} from './production-routes.js';

test('restorations keep the existing CAM and aesthetic route',()=>{
  const route=routeForOrder({work:'Реставрации',material:'PMMA коронка CAD/CAM',productionType:'digital'});
  assert.equal(isRestorationRoute({work:'Реставрации'}),true);
  assert.deepEqual(route.roles,['cad','cam','esthetic']);
  assert.equal(route.category1,false);
});

test('analog non-restoration work starts with preprod',()=>{
  const route=routeForOrder({work:'Ложки прикуса',material:'Индивидуальная ложка',productionType:'analog'});
  assert.deepEqual(route.roles,['preprod','cad','cam','category1']);
});

test('category one services follow CAM',()=>{
  const order={work:'Балочные конструкции',material:'Цельнофрезерованная балка CoCr за единицу',productionType:'digital'};
  assert.equal(requiresCategory1AfterCam(order),true);
  assert.deepEqual(routeForOrder(order).roles,['cad','cam','category1']);
});

test('direct category one services do not create CAD or CAM steps',()=>{
  const order={work:'Дополнительные работы',material:'Анодирование',productionType:'digital'};
  assert.equal(isDirectCategory1(order),true);
  assert.deepEqual(routeForOrder(order).roles,['category1']);
});

test('production builder keeps required steps and supports a custom order',()=>{
  assert.deepEqual(normalizeProductionFlow(['cam','cad','delivery','done','intake'],[]),['intake','cam','cad','delivery','done']);
  assert.deepEqual(normalizeProductionFlow(['cad','cam'],[]),['intake','cad','cam','delivery','done']);
});

