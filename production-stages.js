// Shared, dependency-free production status labels. Keeping this module small
// lets the clinic cabinet render timelines without loading the technician UI.
export const productionStages = [
  {label:'Ожидает подтверждения',matches:['Черновик из Telegram','Ожидает распределения','Ожидает подтверждения']},
  {label:'Приём / Доставка',matches:['Подготовка']},
  {label:'Моделирование',matches:['Моделирование']},
  {label:'CAD на согласовании у врача',matches:['Согласование CAD']},
  {label:'Аналоговая подготовка',matches:['Препрод']},
  {label:'Изготовление',matches:['Изготовление']},
  {label:'Техник первой категории',matches:['Техник первой категории']},
  {label:'Доработка и эстетика',matches:['На доработке']},
  {label:'Контроль качества',matches:['Контроль качества']},
  {label:'Доставка в клинику',matches:['В доставке']},
  {label:'Принято врачом',matches:['Работа принята','Принято доктором','Готово к выдаче']}
];

export const productionStageIndex = stage => {
  const index=productionStages.findIndex(item=>item.matches.includes(stage));
  return index<0?0:index;
};

export const compactStageLabel = stage => ({
  'Черновик из Telegram':'Новый',
  'Ожидает распределения':'Новый',
  'Ожидает подтверждения':'Новый',
  'Подготовка':'Приём',
  'Приём / Доставка':'Приём',
  'Препрод':'Препрод',
  'Аналоговая подготовка':'Препрод',
  'Моделирование':'CAD',
  'Согласование CAD':'Согласование врача',
  'На согласовании':'Согласование врача',
  'CAD на согласовании у врача':'Согласование врача',
  'В работе у Каркасиста':'CAM',
  'Изготовление':'CAM',
  'В работе у Красильщика':'Эстетика',
  'Доработка и эстетика':'Эстетика',
  'Техник первой категории':'Техник I категории',
  'На доработке':'Доработка',
  'Контроль качества':'ОТК',
  'В доставке':'Доставка',
  'В пути к вам':'Доставка',
  'Доставка в клинику':'Доставка',
  'Работа принята':'Финал ОТК',
  'Принято доктором':'Готово',
  'Принято врачом':'Готово',
  'Готово к выдаче':'Готово'
}[stage] || stage);

export const productionStageLabel = stage => compactStageLabel(productionStages[productionStageIndex(stage)]?.label || stage);
