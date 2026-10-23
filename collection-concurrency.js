// Optimistic locking protects whole-collection clients as well as server actions.
const clean=value=>{if(!value||typeof value!=='object')return value;const {_revision,...data}=value;return data};
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
export const samePortalValue=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
const equal=(a,b)=>samePortalValue(clean(a),clean(b));
const recordId=(key,item,index)=>item.id??(key==='promoCodes'?String(item.code).toUpperCase():String(index));
export function versionCollection(key,next,previous,expectedVersion,currentVersion=0){
  if(expectedVersion!==undefined&&expectedVersion!==currentVersion)throw new Error('collection_conflict');
  const list=Array.isArray(next),recordMap=key==='orderOverrides';
  if(!list&&!recordMap)return next;
  const before=list?new Map((previous||[]).map((item,index)=>[recordId(key,item,index),item])):new Map(Object.entries(previous||{}));
  const entries=list?next.map((item,index)=>[recordId(key,item,index),item]):Object.entries(next);
  const result=entries.map(([id,item])=>{
    const old=before.get(id);
    if(old&&equal(item,old))return [id,{...item,_revision:old._revision||0}];
    if(old&&(item._revision||0)!==(old._revision||0))throw new Error('collection_conflict');
    return [id,{...item,_revision:(old?old._revision||0:0)+1}];
  });
  const present=new Set(entries.map(([id])=>id));
  if(expectedVersion===undefined&&[...before].some(([id,item])=>!present.has(id)&&item._revision))throw new Error('collection_conflict');
  return list?result.map(([,item])=>item):Object.fromEntries(result);
}
