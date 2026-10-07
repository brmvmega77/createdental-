import test from 'node:test';
import assert from 'node:assert/strict';
import {telegramInternals} from './telegram-bot.js';

test('extracts a clinic code from a Telegram group title',()=>{
  assert.equal(telegramInternals.codeFromText('Армянская клиника · cd-cl-0003'),'CD-CL-0003');
  assert.equal(telegramInternals.codeFromText('Армянская клиника'),'');
});

test('recognizes the CreateDental support account case-insensitively',()=>{
  assert.equal(telegramInternals.isSupportUsername('@CreateDental'),true);
  assert.equal(telegramInternals.isSupportUsername('@createdental_admin'),true);
  assert.equal(telegramInternals.isSupportUsername('doctor_account'),false);
  assert.equal(telegramInternals.supportLabel('@CreateDental'),'Главный техник');
  assert.equal(telegramInternals.supportLabel('@createdental_admin'),'Техническая команда Create Dental');
});

test('describes Telegram photos and documents for storage',()=>{
  assert.deepEqual(telegramInternals.telegramMedia({message_id:15,photo:[{file_id:'small'},{file_id:'large',file_size:2048}]}),{fileId:'large',previewFileId:'small',fileSize:2048,name:'telegram-photo-15.jpg',type:'image/jpeg',kind:'photo',orderEligible:false});
  const document=telegramInternals.telegramMedia({message_id:16,document:{file_id:'doc',file_name:'scan.zip',mime_type:'application/zip',file_size:4096}});
  assert.equal(document.name,'scan.zip');
  assert.equal(document.orderEligible,true);
});

test('normalizes model output and rejects invalid tooth numbers',()=>{
  const result=telegramInternals.normalizeAnalysis({intent:'create_order',fields:{patient:'Иванов',work:'E.max',teeth:[11,11,99],toothMode:'Одиночка',jaw:'upper',dueDate:'2026-10-20'}});
  assert.deepEqual(result.fields.teeth,[11]);
  assert.equal(result.fields.jaw,'upper');
  assert.equal(result.fields.dueDate,'2026-10-20');
});

test('requires the minimum safe fields before proposing a new order',()=>{
  const analysis=telegramInternals.normalizeAnalysis({intent:'create_order',fields:{patient:'Петров',work:'',teeth:[]}});
  assert.deepEqual(telegramInternals.missingCreateFields(analysis),['вид работы','номер зуба или верхнюю/нижнюю челюсть']);
});

test('matches an existing clinic order by surname only when unambiguous',()=>{
  const snapshot={orders:[
    {id:'CD-1',clinicId:'clinic-1',patient:'Иванов А.А.',status:'Новый'},
    {id:'CD-2',clinicId:'clinic-1',patient:'Петров Б.Б.',status:'Новый'},
    {id:'CD-3',clinicId:'clinic-2',patient:'Иванов В.В.',status:'Новый'}
  ],orderOverrides:{}};
  const found=telegramInternals.findOrder(snapshot,'clinic-1',{orderId:'',patientSurname:'Иванов',fields:{}});
  assert.equal(found.order?.id,'CD-1');
  assert.equal(found.matches.length,1);
});

test('refuses an ambiguous surname match',()=>{
  const snapshot={orders:[
    {id:'CD-1',clinicId:'clinic-1',patient:'Иванов А.А.',status:'Новый'},
    {id:'CD-2',clinicId:'clinic-1',patient:'Иванов Б.Б.',status:'Новый'}
  ],orderOverrides:{}};
  const found=telegramInternals.findOrder(snapshot,'clinic-1',{orderId:'',patientSurname:'Иванов',fields:{}});
  assert.equal(found.order,null);
  assert.equal(found.matches.length,2);
});
