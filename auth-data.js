import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';

const file=process.env.AUTH_DATA_FILE||path.join(process.cwd(),'.data','accounts.json');
let accounts=[];
try{accounts=JSON.parse(fs.readFileSync(file,'utf8'))}catch(error){if(error.code!=='ENOENT')throw error}
const sessions=new Map();
let queue=Promise.resolve();

const normalize=email=>String(email||'').trim().toLowerCase();
export const validEmail=email=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalize(email))&&normalize(email).length<=200;
export const validPassword=password=>typeof password==='string'&&password.length>=10&&password.length<=200;
const hash=password=>{const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(password,salt,64).toString('hex')}`};
const verify=(password,stored)=>{const [salt,digest]=stored.split(':');const actual=scryptSync(password,salt,64),expected=Buffer.from(digest,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected)};
async function save(){
  queue=queue.catch(()=>{}).then(async()=>{
    await fs.promises.mkdir(path.dirname(file),{recursive:true,mode:0o700});
    await fs.promises.writeFile(file+'.tmp',JSON.stringify(accounts),{mode:0o600});
    await fs.promises.rename(file+'.tmp',file);
  });
  await queue;
}
export function hasAccount(email){return accounts.some(account=>account.email===normalize(email))}
export async function createAccount({email,password,role,subjectId}){
  if(!validEmail(email)||!validPassword(password)||hasAccount(email))throw new Error('invalid_account');
  const account={id:randomBytes(16).toString('hex'),email:normalize(email),passwordHash:hash(password),role,subjectId};
  accounts.push(account);
  try{await save()}catch(error){accounts=accounts.filter(item=>item!==account);throw error}
  return account;
}
export async function upsertWorkerAccount({employeeId,email,password}){
  if(!validEmail(email)||password&&!validPassword(password))throw new Error('invalid_account');
  const normalized=normalize(email);
  if(accounts.some(item=>item.email===normalized&&item.subjectId!==employeeId))throw new Error('duplicate_email');
  let account=accounts.find(item=>item.role==='worker'&&item.subjectId===employeeId);
  if(!account){if(!password)throw new Error('password_required');return createAccount({email,password,role:'worker',subjectId:employeeId})}
  account.email=normalized;
  if(password)account.passwordHash=hash(password);
  await save();
  return account;
}
export function login(email,password){
  const account=accounts.find(item=>item.email===normalize(email));
  if(!account||typeof password!=='string'||!verify(password,account.passwordHash))return null;
  return account;
}
export function issueSession(role,subjectId){
  const token=randomBytes(32).toString('hex');
  sessions.set(token,{role,subjectId,expires:Date.now()+7*86400000});
  return token;
}
export function sessionFor(token){
  const session=sessions.get(String(token||''));
  if(!session)return null;
  if(session.expires<Date.now()){sessions.delete(token);return null}
  return session;
}
export function revokeSession(token){sessions.delete(String(token||''))}
export function revokeSubjectSessions(role,subjectId){for(const [token,current] of sessions)if(current.role===role&&current.subjectId===subjectId)sessions.delete(token)}
