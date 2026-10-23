export function parseMoneyAmount(value){
  if(typeof value==='number')return Number.isFinite(value)&&value>=0?value:null;
  const raw=String(value??'').trim();
  if(!raw)return null;
  let normalized=raw.replace(/\u00a0/g,'').replace(/\s/g,'').replace(/[₽$€£]/g,'');
  const comma=normalized.lastIndexOf(','),dot=normalized.lastIndexOf('.');
  if(comma>=0&&dot>=0){
    if(comma>dot)normalized=normalized.replace(/\./g,'').replace(',', '.');
    else normalized=normalized.replace(/,/g,'');
  }else if(comma>=0){
    normalized=normalized.replace(',', '.');
  }
  normalized=normalized.replace(/[^0-9.-]/g,'');
  const amount=Number(normalized);
  return Number.isFinite(amount)&&amount>=0?amount:null;
}
