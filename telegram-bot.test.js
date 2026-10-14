import test from 'node:test';
import assert from 'node:assert/strict';
import {telegramInternals} from './telegram-bot.js';

test('extracts a clinic code from a Telegram group title',()=>{
  assert.equal(telegramInternals.codeFromText('Армянская клиника · cd-cl-83017426'),'CD-CL-83017426');
  assert.equal(telegramInternals.codeFromText('Армянская клиника'),'');
});

test('recognizes the CreateDental support account case-insensitively',()=>{
  assert.equal(telegramInternals.isSupportUsername('@CreateDental'),true);
  assert.equal(telegramInternals.isSupportUsername('@createdental_admin'),true);
  assert.equal(telegramInternals.isSupportUsername('@CreateDental_io'),true);
  assert.equal(telegramInternals.isSupportUsername('doctor_account'),false);
  assert.equal(telegramInternals.supportLabel('@CreateDental'),'Главный техник');
  assert.equal(telegramInternals.supportLabel('@createdental_admin'),'Техническая команда Create Dental');
});

test('describes Telegram photos and documents for storage',()=>{
  assert.deepEqual(telegramInternals.telegramMedia({message_id:15,photo:[{file_id:'small'},{file_id:'large',file_size:2048}]}),{fileId:'large',previewFileId:'small',fileSize:2048,name:'telegram-photo-15.jpg',type:'image/jpeg',kind:'photo',orderEligible:true});
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
  const analysis=telegramInternals.normalizeAnalysis({intent:'create_order',fields:{patient:'Петров Пётр',work:'',teeth:[]}});
  assert.deepEqual(telegramInternals.missingCreateFields(analysis),['режим: одиночка, мост или челюсть','номер зуба или номера зубов','вид работы из прайса','желаемый срок готовности','цвет/оттенок или «не требуется»']);
});

test('does not allow creating an order with only one part of the patient name',()=>{
  const analysis=telegramInternals.normalizeAnalysis({intent:'create_order',patientSurname:'Петров',fields:{patient:'Петров',work:'Вкладки',material:'Вкладка культевая',teeth:[11]}});
  assert.deepEqual(telegramInternals.missingCreateFields(analysis),['имя и фамилию пациента','режим: одиночка, мост или челюсть','желаемый срок готовности','цвет/оттенок или «не требуется»']);
});

test('preserves the full patient name including patronymic',()=>{
  const analysis=telegramInternals.normalizeAnalysis({intent:'create_order',patientSurname:'Петров',fields:{patient:'Пётр Сергеевич Петров',work:'Вкладки',material:'Вкладка культевая',teeth:[11],toothMode:'Одиночка',dueDate:'2026-10-20',shade:'A2'}});
  assert.equal(analysis.fields.patient,'Пётр Сергеевич Петров');
  assert.equal(analysis.patientSurname,'Петров');
  assert.deepEqual(telegramInternals.missingCreateFields(analysis),[]);
});

test('repairs a surname lost by speech analysis when the source names the full patient',()=>{
  const analysis=telegramInternals.normalizeAnalysis({intent:'create_order',fields:{patient:'Виктор Арменович'}});
  telegramInternals.repairPatientName(analysis,'Расшифровка аудио: Новый заказ Бабаян Виктор Арменович, зубы 17 и 18');
  assert.equal(analysis.fields.patient,'Бабаян Виктор Арменович');
});

test('requires an exact priced service when only a catalog category is given',()=>{
  const analysis=telegramInternals.normalizeAnalysis({intent:'create_order',fields:{patient:'Петров Пётр',work:'Реставрации',teeth:[11],toothMode:'Одиночка',dueDate:'2026-10-20',shade:'A2'}});
  assert.deepEqual(telegramInternals.missingCreateFields(analysis),['точное название услуги из прайса']);
});

test('keeps recognized order data while collecting a follow-up message',()=>{
  const first=telegramInternals.normalizeAnalysis({intent:'create_order',fields:{patient:'Петров Пётр Сергеевич',teeth:[11,21],toothMode:'Одиночка'}});
  const second=telegramInternals.normalizeAnalysis({intent:'create_order',fields:{work:'Реставрации',material:'Коронка E.max, ZrO2',dueDate:'2026-10-20',shade:'A2'}});
  const merged=telegramInternals.mergeCreateAnalysis(first,second);
  assert.equal(merged.fields.patient,'Петров Пётр Сергеевич');
  assert.deepEqual(merged.fields.teeth,[11,21]);
  assert.equal(merged.fields.material,'Коронка E.max, ZrO2');
  assert.deepEqual(telegramInternals.missingCreateFields(merged),[]);
});

test('allows any number of separately selected teeth',()=>{
  const analysis=telegramInternals.normalizeAnalysis({intent:'create_order',fields:{
    patient:'Петров Пётр',toothMode:'Одиночка',teeth:[11,12,13,14,15,16],
    work:'Реставрации',material:'Коронка E.max, ZrO2',dueDate:'2026-10-20',shade:'A2'
  }});
  assert.deepEqual(telegramInternals.missingCreateFields(analysis),[]);
  assert.equal(telegramInternals.priceEstimate(analysis).units,6);
});

test('keeps the tooth buttons open until done and hides every selected tooth',()=>{
  const analysis=telegramInternals.normalizeAnalysis({intent:'create_order',fields:{patient:'Петров Пётр',toothMode:'Одиночка',teeth:[11,12,13,21,22]}});
  const markup=telegramInternals.createOrderChoiceMarkup(analysis,'teeth');
  const buttons=markup.inline_keyboard.flat();
  assert.ok(buttons.some(button=>button.callback_data==='tgnew:teeth:done'));
  assert.ok(buttons.some(button=>/выбрано 5/i.test(button.text)));
  assert.ok(buttons.some(button=>button.callback_data==='tgnew:tooth:23'));
  assert.ok(!buttons.some(button=>button.callback_data==='tgnew:tooth:11'));
  assert.match(telegramInternals.createOrderWizardPrompt(analysis,'teeth'),/После выбора нажмите «Готово»/);
});

test('accepts tooth numbers typed into the guided Telegram picker',()=>{
  assert.deepEqual(telegramInternals.parseGuidedTeethInput('12, 15'),[12,15]);
  assert.deepEqual(telegramInternals.parseGuidedTeethInput('зуб 12 и зуб 15'),[12,15]);
  assert.deepEqual(telegramInternals.parseGuidedTeethInput('99'),[]);
});

test('collects patient name before the guided order can continue',()=>{
  const partial=telegramInternals.parseGuidedPatientInput('Манвел');
  assert.equal(partial.hasFullName,false);
  assert.equal(partial.value,'Манвел');
  const full=telegramInternals.parseGuidedPatientInput('Петросян Манвел');
  assert.equal(full.hasFullName,true);
  assert.equal(full.value,'Петросян Манвел');
  assert.match(telegramInternals.guidedPatientPrompt(),/Сначала укажите фамилию и имя/);
  assert.match(telegramInternals.guidedPatientPrompt('Манвел'),/Первая часть ФИО/);
});

test('shows catalog categories first and services as the next button level',()=>{
  const categoryStep=telegramInternals.normalizeAnalysis({intent:'create_order',fields:{patient:'Петров Пётр',toothMode:'Одиночка',teeth:[11]}});
  const categoryButtons=telegramInternals.createOrderChoiceMarkup(categoryStep).inline_keyboard.flat();
  assert.ok(categoryButtons.some(button=>button.text==='Реставрации'));
  const serviceStep=telegramInternals.normalizeAnalysis({intent:'create_order',fields:{patient:'Петров Пётр',toothMode:'Одиночка',teeth:[11],work:'Реставрации'}});
  const serviceButtons=telegramInternals.createOrderChoiceMarkup(serviceStep).inline_keyboard.flat();
  assert.ok(serviceButtons.some(button=>/Коронка E\.max, ZrO2/.test(button.text)));
  assert.equal(telegramInternals.createOrderWizardPrompt(serviceStep),'Выберите услугу из раздела «Реставрации»:');
  assert.equal(telegramInternals.createOrderWizardPrompt(serviceStep).split('\n').length,1);
});

test('explains missing stages and provides valid choices',()=>{
  const analysis=telegramInternals.normalizeAnalysis({intent:'create_order',fields:{patient:'Петров Пётр',work:'Реставрации'}});
  const prompt=telegramInternals.createOrderMissingPrompt(analysis);
  assert.match(prompt,/Одиночка.*Мост.*Челюсть/);
  assert.match(prompt,/PMMA коронка CAD\/CAM/);
  assert.match(prompt,/Желаемый срок|Срок:/i);
  assert.match(prompt,/A1 \/ A2/);
  assert.match(prompt,/Уже названные данные повторять не нужно/);
});

test('canonicalizes a catalog service and estimates the Telegram order price',()=>{
  const analysis=telegramInternals.canonicalizeCatalogSelection(telegramInternals.normalizeAnalysis({intent:'create_order',fields:{patient:'Петров',work:'Коронка E.max, ZrO2',teeth:[11,21],toothMode:'Мост'}}));
  assert.equal(analysis.fields.work,'Реставрации');
  assert.equal(analysis.fields.material,'Коронка E.max, ZrO2');
  assert.deepEqual(telegramInternals.priceEstimate(analysis),{category:{name:'Реставрации',price:null,options:[{name:'PMMA коронка CAD/CAM',price:4000},{name:'Композитная коронка CAD/CAM',price:10000},{name:'Коронка E.max, ZrO2',price:12000},{name:'Коронка E.max, ZrO2 по Славичеку',price:16000},{name:'Коронка, винир на рефракторе',price:18000},{name:'Одиночная реставрация OPTISHADE/MATISSE',price:25000}]},option:{name:'Коронка E.max, ZrO2',price:12000},price:12000,units:2,amount:24000,text:'24 000 ₽'});
});

test('prices a full jaw as sixteen units',()=>{
  const analysis=telegramInternals.canonicalizeCatalogSelection(telegramInternals.normalizeAnalysis({intent:'create_order',fields:{patient:'Петров',work:'Вкладки',material:'Вкладка культевая',toothMode:'Челюсть',jaw:'upper'}}));
  const estimate=telegramInternals.priceEstimate(analysis);
  assert.equal(estimate.units,16);
  assert.equal(estimate.amount,64000);
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

test('matches a Russian surname used in a declined form',()=>{
  const snapshot={orders:[
    {id:'CD-1',clinicId:'clinic-1',patient:'Абрамов Мамед',status:'Новый'},
    {id:'CD-2',clinicId:'clinic-2',patient:'Мамедов Роман',status:'Новый'}
  ],orderOverrides:{}};
  const found=telegramInternals.findOrder(snapshot,'clinic-1',{orderId:'',patientSurname:'Мамедову',fields:{}});
  assert.equal(found.order?.id,'CD-1');
});

test('turns an attachment upload phrase into an order update',()=>{
  const snapshot={orders:[
    {id:'CD-1',clinicId:'clinic-1',patient:'Абрамов Мамед',status:'Новый'},
    {id:'CD-2',clinicId:'clinic-1',patient:'Иванов Илья',status:'Новый'}
  ],orderOverrides:{}};
  const analysis=telegramInternals.normalizeAnalysis({intent:'general_message',fields:{}});
  const result=telegramInternals.attachmentCommandAnalysis('загрузи Мамедову снимок',{name:'111.jpg',orderEligible:true},'clinic-1',snapshot,analysis);
  assert.equal(result.intent,'update_order');
  assert.equal(result.orderId,'CD-1');
});

test('uses the recent order context for another attachment',()=>{
  const snapshot={orders:[{id:'CD-1',clinicId:'clinic-1',patient:'Абрамов Мамед',status:'Новый'}],orderOverrides:{}};
  const analysis=telegramInternals.normalizeAnalysis({intent:'general_message',fields:{}});
  const result=telegramInternals.attachmentCommandAnalysis('прикрепи еще это',{name:'scan.pdf',orderEligible:true},'clinic-1',snapshot,analysis,'CD-1');
  assert.equal(result.intent,'update_order');
  assert.equal(result.orderId,'CD-1');
});

test('repairs a harmless trailing comma in the model JSON',()=>{
  assert.deepEqual(telegramInternals.parseJson('```json\n{"intent":"status_request",}\n```'),{intent:'status_request'});
});

test('detects when this bot is added to a group',()=>{
  const message={new_chat_members:[{id:10,is_bot:false,username:'doctor'},{id:20,is_bot:true,username:'createdental_helper_bot'}]};
  assert.equal(telegramInternals.messageAddsBot(message,{id:20,username:'createdental_helper_bot'}),true);
  assert.equal(telegramInternals.messageAddsBot(message,{id:30,username:'another_bot'}),false);
});

test('keeps the welcome guide within the Telegram message limit',()=>{
  assert.ok(telegramInternals.welcomeText.includes('/menu'));
  assert.ok(telegramInternals.welcomeText.includes('до 10 файлов'));
  assert.ok(!telegramInternals.welcomeText.includes('Файл до 20 МБ'));
  assert.ok(telegramInternals.welcomeText.length<4096);
});

test('treats a Telegram order like a regular new order for file links',()=>{
  const draft={id:'CD-DRAFT',patient:'Иванов Иван',date:'20.10.2026',status:'Новый',telegramDraft:true};
  const accepted={...draft,id:'CD-READY',telegramDraft:false};
  const snapshot={orderOverrides:{'CD-DRAFT':{stage:'Черновик из Telegram'},'CD-READY':{stage:'Ожидает распределения'}}};
  assert.equal(telegramInternals.orderCanReceiveFiles(snapshot,draft),true);
  assert.equal(telegramInternals.orderCanReceiveFiles(snapshot,accepted),true);
});

test('shows the current deadline in Telegram order choices',()=>{
  assert.equal(telegramInternals.orderPickerLabel({patient:'Иванов Иван',work:'Коронка',date:'20.10.2026'}),'Иванов Иван · до 20.10.2026');
});

test('requires a month when a client enters a new deadline',()=>{
  assert.equal(telegramInternals.hasExplicitDueMonth('10'),false);
  assert.equal(telegramInternals.hasExplicitDueMonth('10 число'),false);
  assert.equal(telegramInternals.hasExplicitDueMonth('10 ноября'),true);
  assert.equal(telegramInternals.hasExplicitDueMonth('10.11.2026'),true);
  assert.equal(telegramInternals.hasExplicitDueMonth('завтра'),true);
});

test('routes existing order changes through chief approval',()=>{
  assert.equal(telegramInternals.clientRequestType('update_order',{date:'20.10.2026'}),'deadline');
  assert.equal(telegramInternals.clientRequestType('update_order',{date:'20.10.2026',quantity:2,sum:'24 000 ₽'}),'deadline');
  assert.equal(telegramInternals.clientRequestType('update_order',{work:'Реставрации',material:'Коронка E.max, ZrO2'}),'edit');
  assert.equal(telegramInternals.clientRequestType('cancel_order',{}),'cancel');
});
