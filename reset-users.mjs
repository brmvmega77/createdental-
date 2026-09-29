import {resetAccountsToChief} from './auth-data.js';
import {replacePortalCollection} from './portal-data.js';

const username=process.argv[2];
let password='';
for await(const chunk of process.stdin)password+=chunk;
password=password.trimEnd();
if(!username||!password)throw new Error('Usage: provide chief username and password on stdin');

await replacePortalCollection('clients',[]);
await replacePortalCollection('employees',[]);
await replacePortalCollection('orderOverrides',{});
await resetAccountsToChief(username,password);
console.log('Все прежние пользователи удалены. Создан один главный техник.');
