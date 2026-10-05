import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const source=path.resolve(process.env.DATA_DIR||path.join(root,'.data'));
const destination=path.resolve(process.env.BACKUP_DIR||path.join(root,'.backups'));
const requestedKeep=Number(process.env.BACKUP_KEEP||14);
const keep=Number.isInteger(requestedKeep)?Math.max(2,Math.min(90,requestedKeep)):14;

export async function createDataBackup(){
  if(destination===source||destination.startsWith(source+path.sep))throw new Error('Backup folder must be outside the data folder');
  const now=new Date();
  const label=now.toISOString().replace(/[:.]/g,'-');
  const target=path.join(destination,`snapshot-${label}`);
  await fs.promises.mkdir(source,{recursive:true,mode:0o700});
  await fs.promises.chmod(source,0o700);
  await fs.promises.mkdir(destination,{recursive:true,mode:0o700});
  await fs.promises.chmod(destination,0o700);
  await fs.promises.cp(source,target,{recursive:true,errorOnExist:true,force:false,preserveTimestamps:true});
  await fs.promises.chmod(target,0o700);
  const snapshots=(await fs.promises.readdir(destination,{withFileTypes:true}))
    .filter(entry=>entry.isDirectory()&&/^snapshot-[0-9T-]+Z$/.test(entry.name))
    .map(entry=>entry.name).sort().reverse();
  for(const stale of snapshots.slice(keep))await fs.promises.rm(path.join(destination,stale),{recursive:true,force:true});
  return target;
}
