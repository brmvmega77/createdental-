import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createOwnerAccount} from './auth-data.js';
const email=process.argv[2];
if(!email){console.error('Usage: node create-owner-account.mjs owner@example.com [private-credentials-path]');process.exit(1);}
const password=randomBytes(24).toString('base64url');
const target=path.resolve(process.argv[3]||path.join(process.env.DATA_DIR||'.data','owner-access.txt'));
await fs.mkdir(path.dirname(target),{recursive:true,mode:0o700});
// Reserve the private output before changing credentials so a second run cannot overwrite access.
const output=await fs.open(target,'wx',0o600);
try{const account=await createOwnerAccount({email,password});await output.writeFile(`Create Dental - кабинет владельца\nАдрес: /owner/login\nEmail: ${account.email}\nВременный пароль: ${password}\n\nПосле входа смените пароль в разделе «Цели и данные».\n`);console.log(`Owner account created for ${account.email}. Access details saved privately.`);}catch(e){await fs.unlink(target);throw e;}finally{await output.close();}
