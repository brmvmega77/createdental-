import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {pathFor,routeFromPath} from './routes.js';

const source=readFileSync(new URL('./worker.js',import.meta.url),'utf8');
const identity=source.slice(source.indexOf('  const orderIdKey='),source.indexOf('  const findMyOrder='));
const upload=source.slice(source.indexOf('  function workerOrderUploadDialog('),source.indexOf('  function orderServiceCards('));

for(const mode of ['files','cad'])test(`${mode} upload dialog survives compact order URL through progress and completion`,async()=>{
  const id='CD-MW6V3TU5-8E24_W1';
  const state={orderId:routeFromPath(pathFor('worker','detail',id)).orderId,orderUpload:{mode,orderId:id,files:[]}};
  const screens=[];
  const context={state,Array,Math,String,safe:String,icon:()=>'',root:()=>({querySelector:()=>null}),findMyOrder:()=>({id}),toast:()=>{},localStorage:{setItem(){}},readOrders:()=>({}),loadOrderFiles:async()=>({files:[],folderUrl:''}),submitCadReview:async()=>({}),uploadOrderFile:async(orderId,file,{onProgress})=>{
    assert.equal(orderId,id);
    for(const value of [0,35,99]){
      onProgress(value);
      context.render();
      assert.match(screens.at(-1),/role="dialog"/);
      assert.match(screens.at(-1),new RegExp(`width:${value}%`));
    }
    return {id:'uploaded-file'};
  }};
  vm.createContext(context);
  vm.runInContext(identity+upload+';globalThis.start=startWorkerOrderUpload;globalThis.dialog=workerOrderUploadDialog',context);
  context.render=()=>screens.push(context.dialog());
  await context.start([{name:mode==='cad'?'model.html':'scan.stl',size:100}]);
  assert.equal(state.orderUpload.status,'success');
  assert.match(screens.at(-1),/Готово/);
  assert.match(screens.at(-1),/width:100%/);
  context.render();
  assert.match(screens.at(-1),/Готово/);
  state.orderUpload=null;
  assert.equal(context.dialog(),'');
});
