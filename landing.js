(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const revealParts = document.querySelectorAll('.landing-nav, .hero-copy, .hero-stage, .landing-footer');

  const reveal = () => {
    if (reduce || !window.gsap) return;
    revealParts.forEach(node => node.classList.add('js-reveal'));
    const timeline = window.gsap.timeline({defaults: {ease: 'power3.out'}});
    timeline
      .to('.landing-nav', {autoAlpha: 1, duration: .55})
      .to('.hero-copy', {autoAlpha: 1, duration: .78}, '-=.2')
      .to('.hero-stage', {autoAlpha: 1, duration: .9}, '-=.52')
      .to('.landing-footer', {autoAlpha: 1, duration: .42}, '-=.42');
  };

  if (window.gsap) reveal();

  const stage = document.querySelector('.hero-stage');
  const specimen = document.querySelector('.team-figure');
  const processVignette = document.querySelector('.process-readout');
  const processTitle = document.querySelector('.process-vignette-title');
  const processIndex = document.querySelector('.process-vignette-index');
  const processProgress = [...document.querySelectorAll('.process-vignette-progress i')];
  const processGlyphs = [...document.querySelectorAll('.process-glyph')];

  const animateProcess = () => {
    if (!stage || !processVignette) return;
    const stages = [
      'Создание заказа',
      'CAD моделирование',
      'Согласование',
      'Фрезеровка',
      'Эстетика',
      'Контроль качества',
      'Доставка'
    ];
    const beat = 2240;
    const showStage = (index, startedAt = performance.now()) => {
      const scene = ['create', 'cad', 'approval', 'milling', 'aesthetic', 'quality', 'delivery'][index];
      processVignette.classList.remove('is-changing');
      void processVignette.offsetWidth;
      processVignette.classList.add('is-changing');
      window.setTimeout(() => processVignette.classList.remove('is-changing'), 182);
      processVignette.dataset.scene = scene;
      if (processTitle) processTitle.textContent = stages[index];
      if (processIndex) processIndex.textContent = `${String(index + 1).padStart(2, '0')} / 07`;
      processGlyphs.forEach(glyph => glyph.classList.toggle('is-active', glyph.dataset.scene === scene));
      processProgress.forEach((dot, dotIndex) => {
        dot.classList.toggle('is-done', dotIndex < index);
        dot.classList.toggle('is-current', dotIndex === index);
      });
      window.dispatchEvent(new CustomEvent('landing:stage', {detail: {
        index,
        duration: beat,
        startedAt,
        cycleStartedAt: Math.floor(startedAt / (beat * stages.length)) * beat * stages.length
      }}));
    };
    if (reduce) {
      showStage(1);
      return;
    }
    let activeIndex = -1;
    const tick = now => {
      const index = Math.floor(now / beat) % stages.length;
      if (index !== activeIndex) {
        activeIndex = index;
        showStage(index, now);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  animateProcess();

  if (!reduce && stage && specimen && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const moveSpecimen = window.gsap ? window.gsap.quickTo(specimen, 'x', {duration: .65, ease: 'power3.out'}) : value => { specimen.style.setProperty('--x', `${value}px`); };
    stage.addEventListener('pointermove', event => {
      const rect = stage.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width - .5) * 2;
      moveSpecimen(x * 7);
    }, {passive: true});
    stage.addEventListener('pointerleave', () => { moveSpecimen(0); }, {passive: true});
  }

  const projectDialog = document.querySelector('#project-dialog');
  const projectDialogTrigger = document.querySelector('.action-secondary[aria-controls="project-dialog"]');
  const projectDialogClose = projectDialog?.querySelector('.project-dialog-close');
  projectDialogTrigger?.addEventListener('click', () => projectDialog?.showModal());
  projectDialogClose?.addEventListener('click', () => projectDialog?.close());
  projectDialog?.addEventListener('click', event => {
    if (event.target === projectDialog) projectDialog.close();
  });
})();
(() => {
  const locales = {
    ru: {
      code: 'RU', slug: 'ru', name: 'Русский', lang: 'ru', dir: 'ltr', navLabel: 'Основная навигация', languageButton: 'Язык сайта: Русский', navLogin: 'Войти в кабинет', eyebrow: 'AI-ЗУБОТЕХНИЧЕСКАЯ ЛАБОРАТОРИЯ', heroTitle: 'Точность<br><em>начинается</em><br>с процесса.', heroLede: 'Соединяем клинику и лабораторию в один спокойный рабочий поток — от первого файла до готовой работы.', register: 'Зарегистрировать клинику', howItWorks: 'Как это работает', featuresLabel: 'Особенности Create Dental', featureOne: 'Один поток<br>для всей команды', featureTwo: 'Статус<br>на каждом этапе', featureThree: 'Контроль<br>до передачи', processLabel: 'Цифровой процесс заказа', currentStageLabel: 'Текущий этап заказа', teamLabel: 'Стоматолог и специалист лаборатории Create Dental передают цифровой заказ', footerLine: 'Для клиник, которым важен результат', closeDescription: 'Закрыть описание', dialogTitle: 'Мы строим лабораторию, которая должна быть лучше 99% привычных вариантов.', dialogLead: 'Не за счет громких обещаний, а благодаря системе, где у каждого заказа есть понятный маршрут, у клиники — видимость процесса, а у команды — общая картина работы.', dialogH1: 'Заказ не исчезает после отправки', dialogP1: 'Работа проходит в едином цифровом потоке. Клиника может открыть заказ и увидеть его актуальный этап — без догадок, где он сейчас и что происходит дальше. Важные детали собраны вокруг самого заказа, поэтому командам проще говорить об одной и той же задаче. Когда нужно уточнить статус, не приходится восстанавливать путь работы по разрозненным сообщениям: отправная точка — сам заказ и его текущий этап.', dialogH2: 'Путь работы виден от начала до доставки', dialogP2: 'У каждого этапа есть свое место в производственном маршруте. Это помогает клинике понимать ход работы, а лабораторной команде — последовательно передавать заказ дальше. Согласование вынесено в отдельную точку до фрезеровки: клиника и лаборатория могут сверить детали, прежде чем работа перейдет к следующей производственной операции.', dialogH3: 'Качество — отдельная часть процесса', dialogP3: 'Контроль качества стоит перед доставкой как самостоятельный этап. Это принципиально: готовую работу важно проверить до передачи клинике, а не вспоминать о проверке в последний момент. Такой этап не заменяет мастерство техника — он добавляет отдельную контрольную точку в общий маршрут и помогает команде не терять качество в потоке заказов.', dialogH4: 'Цифровая точность и работа специалистов', dialogP4: 'Create Dental — AI-зуботехническая лаборатория. Мы соединяем цифровой подход с профессиональной работой техников: технология помогает выстроить последовательный процесс, а внимание к конкретному заказу остается в руках команды. AI-направление для нас — способ постепенно убирать рутину и давать специалистам больше времени на точные технические решения, а не обещание заменить их опыт автоматикой.', dialogH5: 'Система, которая помогает расти без потери внимания', dialogP5: 'Когда заказов становится больше, особенно важно не полагаться только на память и переписки. Общие этапы и видимый статус помогают держать поток организованным и уделять внимание каждой работе. Мы строим Create Dental именно вокруг этой идеи — понятного процесса, в котором клиника и лаборатория действуют как одна команда.', stagesLabel: 'Этапы работы над заказом', stages: ['Создание заказа', 'CAD-моделирование', 'Согласование', 'Фрезеровка', 'Эстетика', 'Контроль качества', 'Доставка']
    },
    am: {
      code: 'AM', slug: 'am', name: 'Հայերեն', lang: 'hy', dir: 'ltr', navLabel: 'Հիմնական նավարկում', languageButton: 'Կայքի լեզուն՝ Հայերեն', navLogin: 'Մուտք գործել', eyebrow: 'AI ԱՏԱՄՆԱՏԵԽՆԻԿԱԿԱՆ ԼԱԲՈՐԱՏՈՐԻԱ', heroTitle: 'Ճշգրտությունը<br><em>սկսվում է</em><br>գործընթացից։', heroLede: 'Միավորում ենք կլինիկան ու լաբորատորիան մեկ հստակ աշխատանքային հոսքում՝ առաջին ֆայլից մինչև պատրաստի աշխատանքը։', register: 'Գրանցել կլինիկան', howItWorks: 'Ինչպես է աշխատում', featuresLabel: 'Create Dental-ի առավելությունները', featureOne: 'Մեկ հոսք<br>ամբողջ թիմի համար', featureTwo: 'Կարգավիճակ<br>յուրաքանչյուր փուլում', featureThree: 'Ստուգում<br>մինչև փոխանցումը', processLabel: 'Պատվերի թվային ընթացքը', currentStageLabel: 'Պատվերի ընթացիկ փուլը', teamLabel: 'Ատամնաբույժն ու Create Dental-ի լաբորատորիայի մասնագետը փոխանցում են թվային պատվերը', footerLine: 'Կլինիկաների համար, որոնց համար կարևոր է արդյունքը', closeDescription: 'Փակել նկարագրությունը', dialogTitle: 'Մենք ստեղծում ենք լաբորատորիա, որը պետք է գերազանցի ընդունված լուծումների 99%-ին։', dialogLead: 'Ոչ թե բարձրագոչ խոստումներով, այլ համակարգով, որտեղ յուրաքանչյուր պատվեր ունի հստակ ուղի, կլինիկան տեսնում է ընթացքը, իսկ թիմն ունի աշխատանքի միասնական պատկերը։', dialogH1: 'Պատվերը ուղարկելուց հետո չի կորչում', dialogP1: 'Աշխատանքը կատարվում է միասնական թվային հոսքով։ Կլինիկան կարող է բացել պատվերը և տեսնել դրա ընթացիկ փուլը՝ առանց գուշակելու, թե որտեղ է այն և ինչ կլինի հետո։ Կարևոր մանրամասները հավաքված են պատվերի շուրջ, ուստի թիմերի համար ավելի հեշտ է քննարկել նույն խնդիրը։ Կարգավիճակը ճշտելու համար պետք չէ տարբեր հաղորդագրություններից վերականգնել աշխատանքի ուղին․ մեկնակետը հենց պատվերն ու դրա ընթացիկ փուլն են։', dialogH2: 'Աշխատանքի ուղին տեսանելի է սկզբից մինչև առաքում', dialogP2: 'Արտադրական ուղու յուրաքանչյուր փուլ ունի իր տեղը։ Սա օգնում է կլինիկային հասկանալ ընթացքը, իսկ լաբորատոր թիմին՝ պատվերը հաջորդաբար առաջ փոխանցել։ Համաձայնեցումը առանձին փուլ է մինչև ֆրեզավորումը, որպեսզի կլինիկան և լաբորատորիան ճշտեն մանրամասները մինչև հաջորդ գործողությունը։', dialogH3: 'Որակը գործընթացի առանձին մասն է', dialogP3: 'Որակի ստուգումը առանձին փուլ է առաքումից առաջ։ Պատրաստի աշխատանքը պետք է ստուգել մինչև կլինիկային հանձնելը։ Այս փուլը չի փոխարինում տեխնիկի վարպետությանը․ այն ընդհանուր ուղուն ավելացնում է ստուգման հստակ կետ և օգնում թիմին պահպանել որակը պատվերների հոսքում։', dialogH4: 'Թվային ճշգրտություն և մասնագետների աշխատանք', dialogP4: 'Create Dental-ը AI ատամնատեխնիկական լաբորատորիա է։ Մենք թվային մոտեցումը համադրում ենք տեխնիկների մասնագիտական աշխատանքի հետ․ տեխնոլոգիան կառուցում է հետևողական գործընթացը, իսկ յուրաքանչյուր պատվերի նկատմամբ ուշադրությունը մնում է թիմի ձեռքում։ AI-ն օգնում է աստիճանաբար նվազեցնել առօրյա աշխատանքը և մասնագետներին ավելի շատ ժամանակ տալ ճշգրիտ տեխնիկական որոշումների համար, այլ ոչ թե փոխարինել նրանց փորձը։', dialogH5: 'Համակարգ, որն օգնում է աճել՝ առանց ուշադրությունը կորցնելու', dialogP5: 'Երբ պատվերներն ավելանում են, հատկապես կարևոր է չհենվել միայն հիշողության և նամակագրության վրա։ Ընդհանուր փուլերն ու տեսանելի կարգավիճակը օգնում են կազմակերպել աշխատանքը և ուշադրություն դարձնել յուրաքանչյուր պատվերին։ Create Dental-ը կառուցում ենք այս գաղափարի շուրջ՝ կլինիկայի և լաբորատորիայի միասնական ու հասկանալի աշխատանքի։', stagesLabel: 'Պատվերի աշխատանքային փուլերը', stages: ['Պատվերի ստեղծում', 'CAD մոդելավորում', 'Համաձայնեցում', 'Ֆրեզավորում', 'Էսթետիկա', 'Որակի ստուգում', 'Առաքում']
    },
    uz: {
      code: 'UZ', slug: 'uz', name: 'O‘zbekcha', lang: 'uz', dir: 'ltr', navLabel: 'Asosiy navigatsiya', languageButton: 'Sayt tili: O‘zbekcha', navLogin: 'Kabinetga kirish', eyebrow: 'AI TISH TEXNIKASI LABORATORIYASI', heroTitle: 'Aniqlik<br><em>boshlanadi</em><br>jarayondan.', heroLede: 'Klinika va laboratoriyani bir xotirjam ish jarayoniga birlashtiramiz — birinchi fayldan tayyor ishgacha.', register: 'Klinikani ro‘yxatdan o‘tkazish', howItWorks: 'Bu qanday ishlaydi', featuresLabel: 'Create Dental afzalliklari', featureOne: 'Butun jamoa uchun<br>yagona jarayon', featureTwo: 'Har bir bosqichda<br>holat ko‘rinadi', featureThree: 'Topshirishdan oldin<br>nazorat', processLabel: 'Buyurtmaning raqamli jarayoni', currentStageLabel: 'Buyurtmaning joriy bosqichi', teamLabel: 'Stomatolog va Create Dental laboratoriyasi mutaxassisi raqamli buyurtmani topshirmoqda', footerLine: 'Natijani qadrlaydigan klinikalar uchun', closeDescription: 'Tavsifni yopish', dialogTitle: 'Biz odatiy variantlarning 99 foizidan yaxshiroq bo‘lishi kerak bo‘lgan laboratoriya qurmoqdamiz.', dialogLead: 'Balandparvoz va’dalar bilan emas, balki har bir buyurtmaning aniq yo‘li, klinika uchun ko‘rinadigan jarayon va jamoa uchun umumiy ish manzarasiga ega tizim bilan.', dialogH1: 'Buyurtma yuborilgach yo‘qolib qolmaydi', dialogP1: 'Ish yagona raqamli jarayonda bajariladi. Klinika buyurtmani ochib, uning joriy bosqichini ko‘rishi mumkin — qayerdaligi yoki keyin nima bo‘lishini taxmin qilish shart emas. Muhim tafsilotlar buyurtma atrofida jamlangan, shu sabab jamoalarga bir vazifani muhokama qilish osonroq. Holatni aniqlash uchun turli xabarlardan ish yo‘lini tiklashga hojat yo‘q: boshlang‘ich nuqta — buyurtmaning o‘zi va uning joriy bosqichi.', dialogH2: 'Ish yo‘li boshidan yetkazib berishgacha ko‘rinadi', dialogP2: 'Ishlab chiqarish yo‘nalishidagi har bir bosqich o‘z o‘rniga ega. Bu klinikaga jarayonni tushunishga, laboratoriya jamoasiga esa buyurtmani izchil keyingi bosqichga o‘tkazishga yordam beradi. Frezalashdan oldin alohida kelishuv bosqichi bor: klinika va laboratoriya keyingi operatsiyadan oldin tafsilotlarni tekshiradi.', dialogH3: 'Sifat — jarayonning alohida qismi', dialogP3: 'Sifat nazorati yetkazib berishdan oldingi mustaqil bosqichdir. Tayyor ish klinikaga topshirilishidan avval tekshirilishi kerak. Bu bosqich texnik mahoratini almashtirmaydi — umumiy yo‘nalishga alohida nazorat nuqtasini qo‘shib, buyurtmalar oqimida sifatni saqlashga yordam beradi.', dialogH4: 'Raqamli aniqlik va mutaxassislar mehnati', dialogP4: 'Create Dental — AI tish texnikasi laboratoriyasi. Raqamli yondashuvni texniklarning professional ishi bilan birlashtiramiz: texnologiya izchil jarayon yaratadi, har bir buyurtmaga e’tibor esa jamoa qo‘lida qoladi. AI yo‘nalishi kundalik takroriy ishlarni kamaytirib, mutaxassislarga aniq texnik qarorlar uchun ko‘proq vaqt berishga xizmat qiladi — ularning tajribasini avtomatika bilan almashtirish uchun emas.', dialogH5: 'E’tiborni yo‘qotmasdan o‘sishga yordam beradigan tizim', dialogP5: 'Buyurtmalar ko‘payganda faqat xotira va yozishmalarga tayanmaslik juda muhim. Umumiy bosqichlar va ko‘rinadigan holat ish oqimini tartibli saqlab, har bir ishga e’tibor berishga yordam beradi. Create Dental’ni klinika va laboratoriya bir jamoa bo‘lib ishlaydigan tushunarli jarayon g‘oyasi asosida qurmoqdamiz.', stagesLabel: 'Buyurtma ustidagi ish bosqichlari', stages: ['Buyurtma yaratish', 'CAD modellashtirish', 'Kelishish', 'Frezalash', 'Estetika', 'Sifat nazorati', 'Yetkazib berish']
    },
    kk: {
      code: 'KZ', slug: 'kz', name: 'Қазақша', lang: 'kk', dir: 'ltr', navLabel: 'Негізгі навигация', languageButton: 'Сайт тілі: Қазақша', navLogin: 'Жеке кабинетке кіру', eyebrow: 'AI ТІС ТЕХНИКАСЫ ЗЕРТХАНАСЫ', heroTitle: 'Дәлдік<br><em>басталады</em><br>үдерістен.', heroLede: 'Клиника мен зертхананы алғашқы файлдан дайын жұмысқа дейінгі біртұтас жұмыс үдерісіне біріктіреміз.', register: 'Клиниканы тіркеу', howItWorks: 'Бұл қалай жұмыс істейді', featuresLabel: 'Create Dental артықшылықтары', featureOne: 'Бүкіл командаға<br>бір ортақ үдеріс', featureTwo: 'Әр кезеңдегі<br>мәртебе', featureThree: 'Тапсырар алдында<br>бақылау', processLabel: 'Тапсырыстың цифрлық үдерісі', currentStageLabel: 'Тапсырыстың ағымдағы кезеңі', teamLabel: 'Стоматолог пен Create Dental зертханасының маманы цифрлық тапсырысты беріп жатыр', footerLine: 'Нәтижені бағалайтын клиникаларға арналған', closeDescription: 'Сипаттаманы жабу', dialogTitle: 'Біз әдеттегі нұсқалардың 99 пайызынан жақсы болуы тиіс зертхана құрып жатырмыз.', dialogLead: 'Даңғаза уәделермен емес, әр тапсырыстың айқын жолы, клиникаға көрінетін үдеріс және командаға ортақ жұмыс көрінісі бар жүйемен.', dialogH1: 'Тапсырыс жіберілгеннен кейін жоғалып кетпейді', dialogP1: 'Жұмыс біртұтас цифрлық үдерісте орындалады. Клиника тапсырысты ашып, оның қазіргі кезеңін көре алады — қайда екенін немесе әрі қарай не болатынын болжаудың қажеті жоқ. Маңызды мәліметтер тапсырыстың өзіне жинақталғандықтан, командаларға бір міндетті талқылау оңай. Мәртебені нақтылау үшін әртүрлі хабарламадан жұмыс жолын қалпына келтірудің қажеті жоқ: бастапқы нүкте — тапсырыстың өзі мен оның ағымдағы кезеңі.', dialogH2: 'Жұмыс жолы басынан жеткізуге дейін көрінеді', dialogP2: 'Өндірістік жолдағы әр кезеңнің өз орны бар. Бұл клиникаға жұмыстың барысын түсінуге, ал зертхана командасына тапсырысты келесі кезеңге ретімен өткізуге көмектеседі. Фрезерлеуге дейін бөлек келісу кезеңі бар: клиника мен зертхана келесі операцияға дейін егжей-тегжейін нақтылайды.', dialogH3: 'Сапа — үдерістің жеке бөлігі', dialogP3: 'Сапаны бақылау жеткізудің алдындағы жеке кезең ретінде қарастырылған. Дайын жұмысты клиникаға тапсырмас бұрын тексеру маңызды. Бұл кезең техниктің шеберлігін алмастырмайды — ортақ жолға жеке бақылау нүктесін қосып, тапсырыстар ағынында сапаны сақтауға көмектеседі.', dialogH4: 'Цифрлық дәлдік және мамандардың жұмысы', dialogP4: 'Create Dental — AI тіс техникасы зертханасы. Біз цифрлық тәсілді техниктердің кәсіби жұмысымен біріктіреміз: технология жүйелі үдеріс құруға көмектеседі, ал әр тапсырысқа назар аудару командада қалады. AI бағыты күнделікті қайталанатын жұмысты азайтып, мамандарға нақты техникалық шешімдерге көбірек уақыт бөлуге мүмкіндік береді; ол тәжірибені автоматтандырумен алмастыруды көздемейді.', dialogH5: 'Назарды жоғалтпай өсуге көмектесетін жүйе', dialogP5: 'Тапсырыс көбейген сайын тек есте сақтау мен хат алмасуға сүйенбеу маңызды. Ортақ кезеңдер мен көрінетін мәртебе үдерісті реттеп, әр жұмысқа көңіл бөлуге көмектеседі. Create Dental-ды клиника мен зертхана бір команда болып әрекет ететін түсінікті үдеріс идеясына негіздеп құрып жатырмыз.', stagesLabel: 'Тапсырысты орындау кезеңдері', stages: ['Тапсырысты жасау', 'CAD модельдеу', 'Келісу', 'Фрезерлеу', 'Эстетика', 'Сапаны бақылау', 'Жеткізу']
    },
    ar: {
      code: 'AR', slug: 'uea', name: 'العربية', lang: 'ar', dir: 'rtl', navLabel: 'التنقل الرئيسي', languageButton: 'لغة الموقع: العربية', navLogin: 'تسجيل الدخول', eyebrow: 'مختبر أسنان بتقنيات الذكاء الاصطناعي', heroTitle: 'الدقة<br><em>تبدأ</em><br>من سير العمل.', heroLede: 'نجمع العيادة والمختبر في سير عمل واضح وهادئ، من الملف الأول حتى إنجاز العمل.', register: 'تسجيل العيادة', howItWorks: 'كيف يعمل', featuresLabel: 'مزايا Create Dental', featureOne: 'مسار واحد<br>للفريق بأكمله', featureTwo: 'حالة واضحة<br>في كل مرحلة', featureThree: 'مراجعة<br>قبل التسليم', processLabel: 'المسار الرقمي للطلب', currentStageLabel: 'المرحلة الحالية للطلب', teamLabel: 'طبيب الأسنان واختصاصي مختبر Create Dental يتبادلان طلباً رقمياً', footerLine: 'للعيادات التي تهتم بالنتيجة', closeDescription: 'إغلاق الوصف', dialogTitle: 'نبني مختبراً يطمح إلى التفوق على ٩٩٪ من الخيارات المعتادة.', dialogLead: 'ليس بوعود كبيرة، بل بنظام له مسار واضح لكل طلب، ورؤية للعملية لدى العيادة، وصورة مشتركة للعمل لدى الفريق.', dialogH1: 'الطلب لا يختفي بعد إرساله', dialogP1: 'ينفذ العمل ضمن مسار رقمي موحد. تستطيع العيادة فتح الطلب ومعرفة مرحلته الحالية دون تخمين مكانه أو ما سيحدث بعد ذلك. جُمعت التفاصيل المهمة حول الطلب نفسه، مما يسهل على الفرق مناقشة المهمة ذاتها. وعند الحاجة إلى معرفة الحالة، لا يلزم جمع مسار العمل من رسائل متفرقة؛ نقطة البداية هي الطلب ومرحلته الحالية.', dialogH2: 'مسار العمل واضح من البداية حتى التسليم', dialogP2: 'لكل مرحلة مكانها في مسار الإنتاج. يساعد ذلك العيادة على متابعة سير العمل، والفريق المخبري على نقل الطلب إلى المرحلة التالية بترتيب. وتأتي الموافقة في مرحلة مستقلة قبل التفريز، كي تراجع العيادة والمختبر التفاصيل قبل بدء العملية الإنتاجية التالية.', dialogH3: 'الجودة جزء مستقل من العملية', dialogP3: 'مراقبة الجودة مرحلة مستقلة تسبق التسليم. من المهم فحص العمل المكتمل قبل تسليمه إلى العيادة. لا تحل هذه المرحلة محل مهارة الفني، بل تضيف نقطة تحقق واضحة إلى المسار وتساعد الفريق في الحفاظ على الجودة مع تعدد الطلبات.', dialogH4: 'الدقة الرقمية وخبرة المختصين', dialogP4: 'Create Dental مختبر أسنان يعمل بتقنيات الذكاء الاصطناعي. نجمع النهج الرقمي مع العمل المهني للفنيين: تساعد التقنية على تنظيم الخطوات، بينما يبقى الاهتمام بكل طلب بيد الفريق. ويساعدنا الذكاء الاصطناعي تدريجياً على تقليل الأعمال المتكررة ومنح المختصين وقتاً أكبر للقرارات التقنية الدقيقة، لا على استبدال خبرتهم بالأتمتة.', dialogH5: 'نظام يساعد على النمو مع الحفاظ على الاهتمام', dialogP5: 'مع ازدياد الطلبات، يصبح من المهم ألا نعتمد على الذاكرة والمراسلات وحدهما. تساعد المراحل المشتركة والحالة الواضحة على تنظيم العمل ومنح كل مهمة ما تستحقه من اهتمام. نبني Create Dental حول هذه الفكرة: عملية مفهومة تعمل فيها العيادة والمختبر كفريق واحد.', stagesLabel: 'مراحل تنفيذ الطلب', stages: ['إنشاء الطلب', 'تصميم CAD', 'الموافقة', 'التفريز', 'اللمسات الجمالية', 'مراقبة الجودة', 'التسليم']
    }
  };

  const trigger = document.querySelector('#language-trigger');
  const menu = document.querySelector('#language-menu');
  const current = document.querySelector('[data-current-language]');
  const choices = [...document.querySelectorAll('[data-language-choice]')];
  const stageTitles = [...document.querySelectorAll('.process-vignette-title')];
  const processReadout = document.querySelector('.process-readout');
  const flowItems = [...document.querySelectorAll('.project-flow [data-stage]')];
  let activeLanguage = 'ru';
  let activeStage = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0;

  // Fit complete translated lines inside the same three line boxes as Russian.
  // Measure actual glyphs after fonts load; never resize or move the illustration per locale.
  const fitHeading = () => {
    const heading = document.querySelector('.landing-hero h1');
    if (!heading) return;
    const hero = document.querySelector('.landing-hero');
    if (window.matchMedia('(min-width: 781px)').matches) {
      const copy = document.querySelector('.hero-copy').getBoundingClientRect();
      const chair = document.querySelector('.stage-prop--chair').getBoundingClientRect();
      hero.style.setProperty('--copy-safe-width', `${Math.min(copy.width, chair.left - copy.left - 12)}px`);
    } else hero.style.removeProperty('--copy-safe-width');
    const texts = [...heading.querySelectorAll('.hero-title-text')];
    heading.style.removeProperty('--title-fit');
    const available = heading.clientWidth - 2;
    const widest = Math.max(...texts.map(node => node.getBoundingClientRect().width));
    if (widest > available) {
      let ratio = available / widest;
      for (let pass = 0; pass < 3; pass++) {
        heading.style.setProperty('--title-fit', `${ratio}em`);
        const measured = Math.max(...texts.map(node => node.getBoundingClientRect().width));
        if (measured <= available) break;
        ratio *= available / measured;
      }
    }
  };
  const syncCopyMetrics = () => {
    const hero = document.querySelector('.landing-hero');
    for (const [selector, key] of [['.eyebrow', 'eyebrow'], ['.hero-lede', 'lede'], ['.hero-actions', 'actions'], ['.hero-meta', 'meta']]) {
      const source = hero.querySelector(selector);
      const probe = source.cloneNode(true);
      probe.setAttribute('aria-hidden', 'true');
      probe.inert = true;
      Object.assign(probe.style, {position: 'fixed', left: '-10000px', top: '0', visibility: 'hidden', width: `${source.getBoundingClientRect().width}px`, minHeight: '0', height: 'auto', pointerEvents: 'none'});
      document.body.append(probe);
      let height = 0;
      for (const locale of Object.values(locales)) {
        probe.lang = locale.lang;
        probe.style.direction = 'ltr';
        const nodes = [probe, ...probe.querySelectorAll('[data-i18n], [data-i18n-html]')];
        nodes.forEach(node => {
          const textKey = node.dataset.i18n || node.dataset.i18nHtml;
          if (textKey && locale[textKey] !== undefined) {
            if (node.dataset.i18nHtml) node.innerHTML = locale[textKey];
            else node.textContent = locale[textKey];
          }
        });
        height = Math.max(height, probe.getBoundingClientRect().height);
      }
      probe.remove();
      hero.style.setProperty(`--copy-${key}-height`, `${Math.ceil(height)}px`);
    }
  };
  let fitFrame;
  const scheduleFit = () => {
    cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(() => { fitHeading(); syncCopyMetrics(); });
  };
  new ResizeObserver(scheduleFit).observe(document.querySelector('.landing-main'));
  document.fonts.ready.then(scheduleFit);

  const closeMenu = (restoreFocus = false) => {
    if (!menu || !trigger) return;
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  };
  const applyLanguage = (_language, {replaceUrl = false} = {}) => {
    const language = 'ru';
    const locale = locales.ru;
    activeLanguage = 'ru';
    document.documentElement.lang = locale.lang;
    document.documentElement.dir = locale.dir;
    document.documentElement.dataset.locale = language;
    document.querySelectorAll('[data-i18n]').forEach(node => {
      const value = locale[node.dataset.i18n];
      if (value !== undefined) node.textContent = value;
    });
    document.querySelectorAll('[data-i18n-html]').forEach(node => {
      const value = locale[node.dataset.i18nHtml];
      if (value !== undefined) node.innerHTML = node.dataset.i18nHtml === 'heroTitle'
        ? value.split(/<br\s*\/?\s*>/i).map(line => `<span class="hero-title-line"><span class="hero-title-text">${line}</span></span>`).join('')
        : value;
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(node => {
      const value = locale[node.dataset.i18nAria];
      if (value !== undefined) node.setAttribute('aria-label', value);
    });
    if (processReadout) processReadout.setAttribute('aria-label', locale.currentStageLabel);
    if (current) current.textContent = locale.code;
    if (trigger) trigger.setAttribute('aria-label', locale.languageButton);
    choices.forEach(choice => choice.setAttribute('aria-selected', String(choice.dataset.languageChoice === language)));
    flowItems.forEach(item => { item.textContent = locale.stages[Number(item.dataset.stage)]; });
    stageTitles.forEach(node => { node.textContent = locale.stages[activeStage]; });
    const plainTitle = locale.heroTitle.replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    document.title = `Create Dental — ${plainTitle}`;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = locale.heroLede;
    try { localStorage.removeItem('create-dental-locale'); } catch (_) {}
    const firstPath = window.location.pathname.split('/').filter(Boolean)[0];
    const oldLanguageRoute = Object.values(locales).some(item => item.slug === firstPath);
    if (oldLanguageRoute) history[replaceUrl ? 'replaceState' : 'pushState'](null, '', `/${window.location.hash}`);
    const brand = document.querySelector('.landing-brand'); if (brand) brand.href = '/';
    document.querySelectorAll('.landing-login').forEach(link => { link.href = '/login'; });
    document.querySelectorAll('.action-primary, .project-dialog-cta').forEach(link => { link.href = '/register'; });
    fitHeading();
    scheduleFit();
    window.dispatchEvent(new CustomEvent('landing:language-changed', {detail: {language, locale}}));
  };

  window.addEventListener('landing:stage', event => {
    activeStage = event.detail.index;
    const locale = locales[activeLanguage];
    stageTitles.forEach(node => { node.textContent = locale.stages[activeStage]; });
  });
  trigger?.addEventListener('click', () => {
    const isOpen = trigger.getAttribute('aria-expanded') === 'true';
    menu.hidden = isOpen;
    trigger.setAttribute('aria-expanded', String(!isOpen));
    if (!isOpen) choices.find(choice => choice.dataset.languageChoice === activeLanguage)?.focus();
  });
  choices.forEach((choice, index) => {
    choice.addEventListener('click', () => { applyLanguage(choice.dataset.languageChoice); closeMenu(); trigger?.focus(); });
    choice.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); closeMenu(true); return; }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const next = (index + (event.key === 'ArrowDown' ? 1 : choices.length - 1)) % choices.length;
        choices[next].focus();
      }
    });
  });
  document.addEventListener('pointerdown', event => {
    if (!event.target.closest('.language-switcher')) closeMenu();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  try { localStorage.removeItem('create-dental-locale'); } catch (_) {}
  applyLanguage('ru', {replaceUrl: true});
  window.addEventListener('popstate', () => {
    applyLanguage('ru', {replaceUrl: true});
  });
})();
