import { computed, ref, watch } from 'vue'

export type AppLocale = 'ru' | 'fa' | 'en'

const STORAGE_KEY = 'amb-ar-locale'

export const localeOptions: ReadonlyArray<{ value: AppLocale; label: string; shortLabel: string }> = [
  { value: 'ru', label: 'Русский', shortLabel: 'RU' },
  { value: 'fa', label: 'فارسی', shortLabel: 'FA' },
  { value: 'en', label: 'English', shortLabel: 'EN' },
]

function getInitialLocale(): AppLocale {
  let savedLocale: string | null = null
  try {
    savedLocale = localStorage.getItem(STORAGE_KEY)
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
  if (savedLocale === 'ru' || savedLocale === 'fa' || savedLocale === 'en') return savedLocale

  const browserLocale = navigator.language.toLowerCase()
  if (browserLocale.startsWith('fa')) return 'fa'
  if (browserLocale.startsWith('en')) return 'en'
  return 'ru'
}

export const currentLocale = ref<AppLocale>(getInitialLocale())
export const localeTag = computed(() =>
  currentLocale.value === 'fa'
    ? 'fa-IR-u-nu-latn'
    : currentLocale.value === 'en'
      ? 'en-US'
      : 'ru-RU',
)
export const isRtl = computed(() => currentLocale.value === 'fa')

type Translation = { en: string; fa: string }

// Russian source text is intentionally used as the key. It lets legacy screens, server errors,
// and report-template labels share one translation layer without duplicating business values.
const messages: Record<string, Translation> = {
  'Рабочая область': { en: 'Workspace', fa: 'فضای کاری' },
  'И': { en: 'QC', fa: 'ک' },
  'А': { en: 'A', fa: 'م' },
  'Основная навигация': { en: 'Main navigation', fa: 'پیمایش اصلی' },
  'Мобильная навигация': { en: 'Mobile navigation', fa: 'پیمایش موبایل' },
  'Рунаш — главная': { en: 'Runash — home', fa: 'روناش — صفحه اصلی' },
  'Вход': { en: 'Sign in', fa: 'ورود' },
  'Войти': { en: 'Sign in', fa: 'ورود' },
  'Выйти': { en: 'Sign out', fa: 'خروج' },
  'Проверяем...': { en: 'Checking...', fa: 'در حال بررسی...' },
  'Открываем...': { en: 'Opening...', fa: 'در حال باز کردن...' },
  'Демо-вход': { en: 'Demo sign-in', fa: 'ورود آزمایشی' },
  'Инспектор ОКК': { en: 'Quality inspector', fa: 'بازرس کنترل کیفیت' },
  'Администратор': { en: 'Administrator', fa: 'مدیر' },
  'или по номеру и паролю': { en: 'or use ID and password', fa: 'یا با شماره و رمز عبور' },
  'Номер сотрудника': { en: 'Employee ID', fa: 'شماره کارمندی' },
  'Например, 2001': { en: 'For example, 2001', fa: 'برای مثال، ۲۰۰۱' },
  'Пароль': { en: 'Password', fa: 'رمز عبور' },
  'Журнал отчетов': { en: 'Report log', fa: 'فهرست گزارش‌ها' },
  'Отчеты': { en: 'Reports', fa: 'گزارش‌ها' },
  'Архив отчетов': { en: 'Report archive', fa: 'بایگانی گزارش‌ها' },
  'Архив': { en: 'Archive', fa: 'بایگانی' },
  'Макеты отчетов': { en: 'Report templates', fa: 'قالب‌های گزارش' },
  'Макеты': { en: 'Templates', fa: 'قالب‌ها' },
  'Сотрудники': { en: 'Employees', fa: 'کارکنان' },
  'Люди': { en: 'People', fa: 'افراد' },
  'Мои отчеты': { en: 'My reports', fa: 'گزارش‌های من' },
  'Главная': { en: 'Home', fa: 'خانه' },
  'Новый отчет': { en: 'New report', fa: 'گزارش جدید' },
  'Отчет': { en: 'Report', fa: 'گزارش' },
  'Отчеты работников': { en: 'Employee reports', fa: 'گزارش‌های کارکنان' },
  'Контроль качества': { en: 'Quality control', fa: 'کنترل کیفیت' },
  'Сводка отчетов': { en: 'Report summary', fa: 'خلاصه گزارش‌ها' },
  'Всего отчетов': { en: 'Total reports', fa: 'کل گزارش‌ها' },
  'Всего': { en: 'Total', fa: 'مجموع' },
  'Готовы': { en: 'Ready', fa: 'آماده' },
  'Готовы и PDF': { en: 'Ready and PDF', fa: 'آماده و PDF' },
  'Черновики': { en: 'Drafts', fa: 'پیش‌نویس‌ها' },
  'Черновик': { en: 'Draft', fa: 'پیش‌نویس' },
  'Изменения сохраняются автоматически': { en: 'Changes are saved automatically', fa: 'تغییرات به‌صورت خودکار ذخیره می‌شوند' },
  'Поиск': { en: 'Search', fa: 'جستجو' },
  'Поиск по истории': { en: 'Search history', fa: 'جستجو در سوابق' },
  'Товар, заказ, работник или место': { en: 'Product, order, employee, or location', fa: 'محصول، سفارش، کارمند یا محل' },
  'Товар, заказ, инспектор': { en: 'Product, order, inspector', fa: 'محصول، سفارش، بازرس' },
  'Сохраненные отчеты': { en: 'Saved reports', fa: 'گزارش‌های ذخیره‌شده' },
  'Все отчеты': { en: 'All reports', fa: 'همه گزارش‌ها' },
  'Архивные отчеты': { en: 'Archived reports', fa: 'گزارش‌های بایگانی‌شده' },
  'В архиве': { en: 'Archived', fa: 'بایگانی‌شده' },
  'Загружаем сохранённые отчёты…': { en: 'Loading saved reports…', fa: 'در حال بارگذاری گزارش‌های ذخیره‌شده…' },
  'Загружаем отчёты…': { en: 'Loading reports…', fa: 'در حال بارگذاری گزارش‌ها…' },
  'Обновляем...': { en: 'Refreshing...', fa: 'در حال به‌روزرسانی...' },
  'Обновить с сервера': { en: 'Refresh from server', fa: 'به‌روزرسانی از سرور' },
  'Товар': { en: 'Product', fa: 'محصول' },
  'Макет': { en: 'Template', fa: 'قالب' },
  'Номер отчета': { en: 'Report number', fa: 'شماره گزارش' },
  'Номер заказа': { en: 'Order number', fa: 'شماره سفارش' },
  'Дата изменения': { en: 'Modified', fa: 'تاریخ تغییر' },
  'Работник': { en: 'Employee', fa: 'کارمند' },
  'Сюрвейер': { en: 'Surveyor', fa: 'بازرس' },
  'Фотографии': { en: 'Photos', fa: 'عکس‌ها' },
  'Открыть': { en: 'Open', fa: 'باز کردن' },
  'Продолжить': { en: 'Continue', fa: 'ادامه' },
  'Удалить': { en: 'Delete', fa: 'حذف' },
  'Удаляем...': { en: 'Deleting...', fa: 'در حال حذف...' },
  'Создаем...': { en: 'Creating...', fa: 'در حال ایجاد...' },
  'Возвращаем...': { en: 'Restoring...', fa: 'در حال بازگردانی...' },
  'Переносим...': { en: 'Moving...', fa: 'در حال انتقال...' },
  'Вернуть из архива': { en: 'Restore from archive', fa: 'بازگردانی از بایگانی' },
  'Удалить навсегда': { en: 'Delete permanently', fa: 'حذف دائمی' },
  'Отчетов пока нет': { en: 'No reports yet', fa: 'هنوز گزارشی وجود ندارد' },
  'В архиве пока нет отчетов.': { en: 'There are no archived reports yet.', fa: 'هنوز گزارشی در بایگانی نیست.' },
  'Отчетов пока нет. Когда работники сохранят документы, они появятся здесь.': { en: 'No reports yet. Documents saved by employees will appear here.', fa: 'هنوز گزارشی نیست. اسناد ذخیره‌شده توسط کارکنان اینجا نمایش داده می‌شوند.' },
  'Выберите макет — после этого здесь появится черновик отчета.': { en: 'Choose a template and a report draft will appear here.', fa: 'یک قالب انتخاب کنید تا پیش‌نویس گزارش اینجا نمایش داده شود.' },
  'Не указан': { en: 'Not specified', fa: 'مشخص نشده' },
  'Работник не указан': { en: 'Employee not specified', fa: 'کارمند مشخص نشده' },
  'Место не указано': { en: 'Location not specified', fa: 'محل مشخص نشده' },
  'Без номера': { en: 'No number', fa: 'بدون شماره' },
  'Без названия': { en: 'Untitled', fa: 'بدون عنوان' },
  'Товар не указан': { en: 'Product not specified', fa: 'محصول مشخص نشده' },
  'Отчёт без названия': { en: 'Untitled report', fa: 'گزارش بدون عنوان' },
  'Ожидает синхронизации': { en: 'Waiting to sync', fa: 'در انتظار همگام‌سازی' },
  'Ожидает отправки': { en: 'Waiting to submit', fa: 'در انتظار ارسال' },
  'Отправлен': { en: 'Submitted', fa: 'ارسال‌شده' },
  'Отправлен · PDF': { en: 'Submitted · PDF', fa: 'ارسال‌شده · PDF' },
  'Удален': { en: 'Deleted', fa: 'حذف‌شده' },
  'Нет связи · данные сохранены на устройстве': { en: 'Offline · data saved on device', fa: 'آفلاین · داده‌ها روی دستگاه ذخیره شدند' },
  'В сети': { en: 'Online', fa: 'متصل' },
  'Отправляем отчёт…': { en: 'Submitting report…', fa: 'در حال ارسال گزارش…' },
  'Нет отчётов к отправке': { en: 'No reports to submit', fa: 'گزارشی برای ارسال نیست' },
  'Выберите макет': { en: 'Choose a template', fa: 'انتخاب قالب' },
  'Черновик создастся после подтверждения.': { en: 'A draft will be created after confirmation.', fa: 'پس از تأیید، پیش‌نویس ایجاد می‌شود.' },
  'Назад': { en: 'Back', fa: 'بازگشت' },
  'Загружаем…': { en: 'Loading…', fa: 'در حال بارگذاری…' },
  'Продолжить отчет': { en: 'Continue report', fa: 'ادامه گزارش' },
  'Изменен': { en: 'Modified', fa: 'تغییریافته' },
  'Создать новый': { en: 'Create new', fa: 'ایجاد جدید' },
  'Выбрать макет отчета': { en: 'Choose a report template', fa: 'انتخاب قالب گزارش' },
  'Нет доступных макетов': { en: 'No templates available', fa: 'قالبی در دسترس نیست' },
  'Попросите администратора опубликовать макет отчета.': { en: 'Ask an administrator to publish a report template.', fa: 'از مدیر بخواهید قالب گزارش را منتشر کند.' },
  'Создаем…': { en: 'Creating…', fa: 'در حال ایجاد…' },
  'Начать отчет': { en: 'Start report', fa: 'شروع گزارش' },
  'Скачать PDF': { en: 'Download PDF', fa: 'دانلود PDF' },
  'Отправить администратору': { en: 'Submit to administrator', fa: 'ارسال برای مدیر' },
  'Отправляем…': { en: 'Submitting…', fa: 'در حال ارسال…' },
  'Вернуться к редактированию': { en: 'Return to editing', fa: 'بازگشت به ویرایش' },
  'К списку отчётов': { en: 'Back to reports', fa: 'بازگشت به گزارش‌ها' },
  'К истории': { en: 'Back to history', fa: 'بازگشت به سوابق' },
  'Просмотр PDF отчёта': { en: 'Report PDF preview', fa: 'پیش‌نمایش PDF گزارش' },
  'Подготавливаем итоговый PDF…': { en: 'Preparing the final PDF…', fa: 'در حال آماده‌سازی PDF نهایی…' },
  'Не удалось показать отчёт': { en: 'Could not display the report', fa: 'نمایش گزارش ممکن نشد' },
  'Попробовать снова': { en: 'Try again', fa: 'تلاش دوباره' },
  'Отмена': { en: 'Cancel', fa: 'انصراف' },
  'Подтвердить': { en: 'Confirm', fa: 'تأیید' },
  'Отправить отчёт?': { en: 'Submit report?', fa: 'گزارش ارسال شود؟' },
  'После отправки отчёт больше нельзя будет изменить.': { en: 'The report cannot be changed after submission.', fa: 'پس از ارسال، گزارش قابل تغییر نخواهد بود.' },
  'Отправить': { en: 'Submit', fa: 'ارسال' },
  'Удалить отчёт?': { en: 'Delete report?', fa: 'گزارش حذف شود؟' },
  'Переместить в архив?': { en: 'Move to archive?', fa: 'به بایگانی منتقل شود؟' },
  'Переместить': { en: 'Move', fa: 'انتقال' },
  'Удалить навсегда?': { en: 'Delete permanently?', fa: 'برای همیشه حذف شود؟' },
  'Вернуть отчёт?': { en: 'Restore report?', fa: 'گزارش بازگردانی شود؟' },
  'Вернуть': { en: 'Restore', fa: 'بازگردانی' },
  'Добавить фото': { en: 'Add photo', fa: 'افزودن عکس' },
  'Сделайте снимок или выберите изображение из галереи': { en: 'Take a photo or choose one from the gallery', fa: 'عکس بگیرید یا تصویری از گالری انتخاب کنید' },
  'Скрыть подпись': { en: 'Hide caption', fa: 'پنهان کردن توضیح' },
  'Добавить подпись': { en: 'Add caption', fa: 'افزودن توضیح' },
  'Удалить фото': { en: 'Delete photo', fa: 'حذف عکس' },
  'Подпись': { en: 'Caption', fa: 'توضیح' },
  'Выберите источник изображения': { en: 'Choose an image source', fa: 'منبع تصویر را انتخاب کنید' },
  'Снять фото': { en: 'Take photo', fa: 'گرفتن عکس' },
  'Выбрать из галереи': { en: 'Choose from gallery', fa: 'انتخاب از گالری' },
  'Просмотр фотографии': { en: 'Photo preview', fa: 'پیش‌نمایش عکس' },
  'Закрыть просмотр': { en: 'Close preview', fa: 'بستن پیش‌نمایش' },
  'Аккаунты': { en: 'Accounts', fa: 'حساب‌ها' },
  'Список аккаунтов': { en: 'Account list', fa: 'فهرست حساب‌ها' },
  'Создать аккаунт': { en: 'Create account', fa: 'ایجاد حساب' },
  'Аккаунтов пока нет.': { en: 'No accounts yet.', fa: 'هنوز حسابی وجود ندارد.' },
  'Данные аккаунта': { en: 'Account details', fa: 'اطلاعات حساب' },
  'Закрыть': { en: 'Close', fa: 'بستن' },
  'Роль': { en: 'Role', fa: 'نقش' },
  'Выберите роль': { en: 'Choose a role', fa: 'نقش را انتخاب کنید' },
  'Уникальный номер': { en: 'Unique ID', fa: 'شماره یکتا' },
  'Генерируем номер...': { en: 'Generating ID...', fa: 'در حال تولید شماره...' },
  'ФИО': { en: 'Full name', fa: 'نام و نام خانوادگی' },
  'Новый пароль (необязательно)': { en: 'New password (optional)', fa: 'رمز عبور جدید (اختیاری)' },
  'Новый пароль': { en: 'New password', fa: 'رمز عبور جدید' },
  'Показать пароль': { en: 'Show password', fa: 'نمایش رمز عبور' },
  'Скрыть пароль': { en: 'Hide password', fa: 'پنهان کردن رمز عبور' },
  'Показать': { en: 'Show', fa: 'نمایش' },
  'Скрыть': { en: 'Hide', fa: 'پنهان کردن' },
  'Скопировать пароль': { en: 'Copy password', fa: 'کپی رمز عبور' },
  'Скопировать данные сотрудника': { en: 'Copy employee credentials', fa: 'کپی اطلاعات کارمند' },
  'Сбросить пароль': { en: 'Reset password', fa: 'بازنشانی رمز عبور' },
  'Сгенерировать': { en: 'Generate', fa: 'تولید' },
  'Сохранить': { en: 'Save', fa: 'ذخیره' },
  'Добавить': { en: 'Add', fa: 'افزودن' },
  'Удалить аккаунт': { en: 'Delete account', fa: 'حذف حساب' },
  'Выберите аккаунт': { en: 'Choose an account', fa: 'یک حساب انتخاب کنید' },
  'Нажмите на сотрудника в списке, чтобы открыть его данные и настройки доступа.': { en: 'Select an employee to open their details and access settings.', fa: 'برای مشاهده اطلاعات و تنظیمات دسترسی، کارمند را از فهرست انتخاب کنید.' },
  'Пароль скопирован': { en: 'Password copied', fa: 'رمز عبور کپی شد' },
  'Отключить': { en: 'Disable', fa: 'غیرفعال کردن' },
  'Макет создан на сервере. Добавьте разделы и поля.': { en: 'Template created on the server. Add sections and fields.', fa: 'قالب روی سرور ایجاد شد. بخش‌ها و فیلدها را اضافه کنید.' },
  'Продолжайте редактирование черновика.': { en: 'Continue editing the draft.', fa: 'ویرایش پیش‌نویس را ادامه دهید.' },
  'Опубликовать': { en: 'Publish', fa: 'انتشار' },
  'Опубликовано': { en: 'Published', fa: 'منتشرشده' },
  'Опубликован': { en: 'Published', fa: 'منتشرشده' },
  'Редактировать': { en: 'Edit', fa: 'ویرایش' },
  'Создать копию': { en: 'Create a copy', fa: 'ایجاد کپی' },
  'Описание макета не добавлено.': { en: 'No template description.', fa: 'توضیحی برای قالب ثبت نشده است.' },
  'Разделов': { en: 'Sections', fa: 'بخش‌ها' },
  'Полей': { en: 'Fields', fa: 'فیلدها' },
  'Обновлен': { en: 'Updated', fa: 'به‌روزرسانی' },
  'Создать с нуля': { en: 'Create from scratch', fa: 'ایجاد از ابتدا' },
  'Пустой макет с одним разделом': { en: 'Blank template with one section', fa: 'قالب خالی با یک بخش' },
  'К макетам': { en: 'Back to templates', fa: 'بازگشت به قالب‌ها' },
  'Части макета': { en: 'Template areas', fa: 'بخش‌های قالب' },
  'Форма инспектора': { en: 'Inspector form', fa: 'فرم بازرس' },
  'шаги и поля отчета': { en: 'report steps and fields', fa: 'مراحل و فیلدهای گزارش' },
  'Печатный PDF': { en: 'Printable PDF', fa: 'PDF قابل چاپ' },
  'страницы и размещение': { en: 'pages and layout', fa: 'صفحات و چیدمان' },
  'Название макета': { en: 'Template name', fa: 'نام قالب' },
  'Например, Приемка свежих овощей': { en: 'For example, Fresh produce receiving', fa: 'برای مثال، تحویل سبزیجات تازه' },
  'Описание': { en: 'Description', fa: 'توضیحات' },
  'Кратко опишите назначение': { en: 'Briefly describe its purpose', fa: 'کاربرد آن را کوتاه توضیح دهید' },
  'Добавить раздел': { en: 'Add section', fa: 'افزودن بخش' },
  'Название раздела': { en: 'Section name', fa: 'نام بخش' },
  'Описание раздела': { en: 'Section description', fa: 'توضیحات بخش' },
  'Переместить выше': { en: 'Move up', fa: 'انتقال به بالا' },
  'Переместить ниже': { en: 'Move down', fa: 'انتقال به پایین' },
  'Удалить раздел': { en: 'Delete section', fa: 'حذف بخش' },
  'Удалить поле': { en: 'Delete field', fa: 'حذف فیلد' },
  'В разделе пока нет полей': { en: 'This section has no fields yet', fa: 'این بخش هنوز فیلدی ندارد' },
  'Выберите готовое поле ниже или создайте свое.': { en: 'Choose a preset field below or create your own.', fa: 'یک فیلد آماده انتخاب کنید یا فیلد خود را بسازید.' },
  'Добавить готовое поле': { en: 'Add a preset field', fa: 'افزودن فیلد آماده' },
  'Выберите поле': { en: 'Choose a field', fa: 'یک فیلد انتخاب کنید' },
  'Свое поле': { en: 'Custom field', fa: 'فیلد سفارشی' },
  'Свойства': { en: 'Properties', fa: 'ویژگی‌ها' },
  'Настройка поля': { en: 'Field settings', fa: 'تنظیمات فیلد' },
  'Название': { en: 'Name', fa: 'نام' },
  'Тип поля': { en: 'Field type', fa: 'نوع فیلد' },
  'Текст': { en: 'Text', fa: 'متن' },
  'Число': { en: 'Number', fa: 'عدد' },
  'Дата': { en: 'Date', fa: 'تاریخ' },
  'Время': { en: 'Time', fa: 'زمان' },
  'Список': { en: 'List', fa: 'فهرست' },
  'Один вариант': { en: 'Single choice', fa: 'تک‌گزینه‌ای' },
  'Флажок': { en: 'Checkbox', fa: 'کادر انتخاب' },
  'Большой текст': { en: 'Long text', fa: 'متن بلند' },
  'Измерение': { en: 'Measurement', fa: 'اندازه‌گیری' },
  'Соответствует / не соответствует': { en: 'Pass / fail', fa: 'مطابق / نامطابق' },
  'Таблица проверок': { en: 'Inspection table', fa: 'جدول بازرسی' },
  'Вычисляемое значение': { en: 'Calculated value', fa: 'مقدار محاسبه‌شده' },
  'Фото': { en: 'Photo', fa: 'عکس' },
  'Варианты списка': { en: 'List options', fa: 'گزینه‌های فهرست' },
  'Название варианта': { en: 'Option name', fa: 'نام گزینه' },
  'Поднять вариант': { en: 'Move option up', fa: 'انتقال گزینه به بالا' },
  'Опустить вариант': { en: 'Move option down', fa: 'انتقال گزینه به پایین' },
  'Удалить вариант': { en: 'Delete option', fa: 'حذف گزینه' },
  'Добавить вариант': { en: 'Add option', fa: 'افزودن گزینه' },
  'Колонки таблицы': { en: 'Table columns', fa: 'ستون‌های جدول' },
  'Колонка': { en: 'Column', fa: 'ستون' },
  'Название колонки': { en: 'Column name', fa: 'نام ستون' },
  'Тип колонки': { en: 'Column type', fa: 'نوع ستون' },
  'Удалить колонку': { en: 'Delete column', fa: 'حذف ستون' },
  'Строки проверки': { en: 'Inspection rows', fa: 'ردیف‌های بازرسی' },
  'Строка': { en: 'Row', fa: 'ردیف' },
  'Название строки': { en: 'Row name', fa: 'نام ردیف' },
  'Удалить строку': { en: 'Delete row', fa: 'حذف ردیف' },
  'Единица измерения': { en: 'Unit', fa: 'واحد اندازه‌گیری' },
  'Норма': { en: 'Standard', fa: 'استاندارد' },
  'Формула': { en: 'Formula', fa: 'فرمول' },
  'Операция': { en: 'Operation', fa: 'عملیات' },
  'Сумма': { en: 'Sum', fa: 'جمع' },
  'Разность': { en: 'Difference', fa: 'تفاضل' },
  'Среднее': { en: 'Average', fa: 'میانگین' },
  'Знаков после запятой': { en: 'Decimal places', fa: 'تعداد رقم اعشار' },
  'Поля-источники': { en: 'Source fields', fa: 'فیلدهای منبع' },
  'Добавить числовое поле': { en: 'Add a numeric field', fa: 'افزودن فیلد عددی' },
  'ФИО инспектора подставляется автоматически и не редактируется в отчете.': { en: "The inspector's name is added automatically and cannot be edited in the report.", fa: 'نام بازرس به‌صورت خودکار درج می‌شود و در گزارش قابل ویرایش نیست.' },
  'Подсказка внутри поля': { en: 'Field placeholder', fa: 'راهنمای داخل فیلد' },
  'Необязательно': { en: 'Optional', fa: 'اختیاری' },
  'Пояснение': { en: 'Help text', fa: 'توضیح راهنما' },
  'Текст под полем': { en: 'Text below the field', fa: 'متن زیر فیلد' },
  'Ширина': { en: 'Width', fa: 'عرض' },
  'Обязательное поле': { en: 'Required field', fa: 'فیلد اجباری' },
  'Без значения отчет нельзя завершить': { en: 'The report cannot be completed without a value', fa: 'بدون مقدار، گزارش تکمیل نمی‌شود' },
  'Предпросмотр': { en: 'Preview', fa: 'پیش‌نمایش' },
  'Введите значение': { en: 'Enter a value', fa: 'مقداری وارد کنید' },
  'Выберите значение': { en: 'Choose a value', fa: 'یک مقدار انتخاب کنید' },
  'Нажмите на поле в макете, чтобы изменить его название, тип и обязательность.': { en: 'Select a template field to edit its name, type, and required status.', fa: 'برای تغییر نام، نوع و اجباری بودن، یک فیلد را در قالب انتخاب کنید.' },
  'Печатный макет': { en: 'Print template', fa: 'قالب چاپ' },
  'Размещение данных в PDF': { en: 'PDF data layout', fa: 'چیدمان داده‌ها در PDF' },
  'Стиль фиксирован; здесь задаются разделы, поля, таблицы и порядок печати.': { en: 'The style is fixed; configure sections, fields, tables, and print order here.', fa: 'سبک ثابت است؛ بخش‌ها، فیلدها، جدول‌ها و ترتیب چاپ را اینجا تنظیم کنید.' },
  'Сбросить размещение': { en: 'Reset layout', fa: 'بازنشانی چیدمان' },
  'Заголовок документа': { en: 'Document title', fa: 'عنوان سند' },
  'Стиль выходного PDF': { en: 'Output PDF style', fa: 'سبک PDF خروجی' },
  'Единый фирменный шаблон': { en: 'Unified brand template', fa: 'قالب یکپارچه برند' },
  'Заголовок печатного раздела': { en: 'Printed section title', fa: 'عنوان بخش چاپی' },
  'Свернуть': { en: 'Collapse', fa: 'جمع کردن' },
  'Настроить': { en: 'Configure', fa: 'تنظیم' },
  'Колонки': { en: 'Columns', fa: 'ستون‌ها' },
  'С новой страницы': { en: 'Start on a new page', fa: 'شروع از صفحه جدید' },
  'Не печатать раздел': { en: 'Do not print section', fa: 'بخش چاپ نشود' },
  'Поля в PDF': { en: 'Fields in PDF', fa: 'فیلدها در PDF' },
  'Подпись в PDF': { en: 'PDF label', fa: 'عنوان در PDF' },
  'Вся строка': { en: 'Full row', fa: 'تمام ردیف' },
  'Вид значения': { en: 'Value display', fa: 'نمایش مقدار' },
  'Отметка': { en: 'Check mark', fa: 'علامت' },
  'Таблица': { en: 'Table', fa: 'جدول' },
  'Скрывать пустое': { en: 'Hide when empty', fa: 'پنهان کردن در صورت خالی بودن' },
  'Не печатать': { en: 'Do not print', fa: 'چاپ نشود' },
  'В этом разделе пока нет полей мобильной формы.': { en: 'This section has no mobile form fields yet.', fa: 'این بخش هنوز فیلدی از فرم موبایل ندارد.' },
  'Партия': { en: 'Batch', fa: 'محموله' },
  'Продукт': { en: 'Product', fa: 'محصول' },
  'Температура': { en: 'Temperature', fa: 'دما' },
  'Результаты': { en: 'Results', fa: 'نتایج' },
  'Дефекты': { en: 'Defects', fa: 'نقص‌ها' },
  'Выборка': { en: 'Sampling', fa: 'نمونه‌گیری' },
  'Подписи': { en: 'Signatures', fa: 'امضاها' },
  'Загружаем выбранный макет…': { en: 'Loading the selected template…', fa: 'در حال بارگذاری قالب انتخاب‌شده…' },
  'Подготавливаем поля и сохраненный черновик.': { en: 'Preparing fields and the saved draft.', fa: 'در حال آماده‌سازی فیلدها و پیش‌نویس ذخیره‌شده.' },
  'Тестовый режим': { en: 'Test mode', fa: 'حالت آزمایشی' },
  'Временно заполняет обычные и динамические поля выбранного макета.': { en: 'Temporarily fills the standard and dynamic fields of the selected template.', fa: 'فیلدهای معمولی و پویای قالب انتخاب‌شده را به‌طور موقت پر می‌کند.' },
  'Заполнить тестовыми данными': { en: 'Fill with test data', fa: 'پر کردن با داده آزمایشی' },
  'Разделы отчета': { en: 'Report sections', fa: 'بخش‌های گزارش' },
  'Обязательно': { en: 'Required', fa: 'اجباری' },
  'Палет': { en: 'Pallets', fa: 'پالت‌ها' },
  'Точек выборки': { en: 'Sample points', fa: 'نقاط نمونه‌گیری' },
  'Выберите': { en: 'Choose', fa: 'انتخاب کنید' },
  'Подтверждаю': { en: 'I confirm', fa: 'تأیید می‌کنم' },
  'Будет рассчитано автоматически': { en: 'Calculated automatically', fa: 'به‌صورت خودکار محاسبه می‌شود' },
  'В этом разделе макета пока нет полей.': { en: 'This template section has no fields yet.', fa: 'این بخش قالب هنوز فیلدی ندارد.' },
  'Партия и инспекция': { en: 'Batch and inspection', fa: 'محموله و بازرسی' },
  'Продукт и упаковка': { en: 'Product and packaging', fa: 'محصول و بسته‌بندی' },
  'Тип товара': { en: 'Product type', fa: 'نوع محصول' },
  'Наименование товара': { en: 'Product name', fa: 'نام محصول' },
  'Фасовка': { en: 'Pack size', fa: 'مقدار بسته‌بندی' },
  'Вид упаковки': { en: 'Packaging type', fa: 'نوع بسته‌بندی' },
  'Не выбрано': { en: 'Not selected', fa: 'انتخاب نشده' },
  'Температура и пломбы': { en: 'Temperature and seals', fa: 'دما و پلمب‌ها' },
  'Рекомендованная температура': { en: 'Recommended temperature', fa: 'دمای پیشنهادی' },
  'Пульпа при открытии': { en: 'Pulp temperature on opening', fa: 'دمای پالپ هنگام باز کردن' },
  'Нарушение температуры': { en: 'Temperature violation', fa: 'عدم رعایت دما' },
  'Пломба': { en: 'Seal', fa: 'پلمب' },
  'Наличие термографов': { en: 'Thermograph availability', fa: 'وجود ترموگراف' },
  'Нарушение термографов': { en: 'Thermograph violation', fa: 'عدم رعایت ترموگراف' },
  'Результаты инспекции': { en: 'Inspection results', fa: 'نتایج بازرسی' },
  'Калибр соответствует ПК': { en: 'Size matches the specification', fa: 'اندازه مطابق مشخصات است' },
  'Сорт соответствует ПК': { en: 'Variety matches the specification', fa: 'رقم مطابق مشخصات است' },
  'Описание дефектов': { en: 'Defect description', fa: 'شرح نقص‌ها' },
  'Нестандарт для 2 категории': { en: 'Non-standard for category 2', fa: 'نامنطبق برای دسته ۲' },
  'Отход': { en: 'Waste', fa: 'ضایعات' },
  'Не соответствует калибру': { en: 'Size mismatch', fa: 'عدم تطابق اندازه' },
  'Заключение эксперта': { en: 'Expert conclusion', fa: 'نظر کارشناس' },
  'Генератор случайных значений': { en: 'Random sample generator', fa: 'تولیدکننده نمونه تصادفی' },
  'Фотоотчет': { en: 'Photo report', fa: 'گزارش تصویری' },
  'Добавьте снимки в нужные категории документа.': { en: 'Add photos to the appropriate document categories.', fa: 'عکس‌ها را به دسته‌های مناسب سند اضافه کنید.' },
  'Подписи и выпуск': { en: 'Signatures and release', fa: 'امضاها و صدور' },
  'Отчет издан': { en: 'Report issued', fa: 'گزارش صادر شد' },
  'Эксперт': { en: 'Expert', fa: 'کارشناس' },
  'Представитель ТС': { en: 'Retail representative', fa: 'نماینده شبکه فروش' },
  'Далее': { en: 'Next', fa: 'بعدی' },
  'Создаем PDF...': { en: 'Creating PDF...', fa: 'در حال ایجاد PDF...' },
  'Сформировать и проверить PDF': { en: 'Generate and review PDF', fa: 'ایجاد و بررسی PDF' },
  'Заполните обязательные поля, чтобы сформировать итоговый PDF.': { en: 'Complete the required fields to generate the final PDF.', fa: 'برای ایجاد PDF نهایی، فیلدهای اجباری را تکمیل کنید.' },
  'Да': { en: 'Yes', fa: 'بله' },
  'Нет': { en: 'No', fa: 'خیر' },
  'Соответствует': { en: 'Pass', fa: 'مطابق' },
  'Не соответствует': { en: 'Fail', fa: 'نامطابق' },
  'Сохранено': { en: 'Saved', fa: 'ذخیره شد' },
  'Сохраняем на устройстве...': { en: 'Saving on device...', fa: 'در حال ذخیره روی دستگاه...' },
  'Есть несохраненные изменения': { en: 'There are unsaved changes', fa: 'تغییرات ذخیره‌نشده وجود دارد' },
  'Не удалось сохранить локально': { en: 'Could not save locally', fa: 'ذخیره محلی انجام نشد' },
  'Фото отчета': { en: 'Report photo', fa: 'عکس گزارش' },
  'Карточка отчета': { en: 'Report details', fa: 'جزئیات گزارش' },
  'Общая информация': { en: 'General information', fa: 'اطلاعات عمومی' },
  'Визуальная проверка качества': { en: 'Visual quality inspection', fa: 'بازرسی بصری کیفیت' },
  'Количество и упаковка': { en: 'Quantity and packaging', fa: 'مقدار و بسته‌بندی' },
  'Температура и условия перевозки': { en: 'Temperature and transport conditions', fa: 'دما و شرایط حمل' },
  'Оборудование и условия': { en: 'Equipment and conditions', fa: 'تجهیزات و شرایط' },
  'Критерии качества': { en: 'Quality criteria', fa: 'معیارهای کیفیت' },
  'Распределение по категориям': { en: 'Category distribution', fa: 'توزیع دسته‌ها' },
  'Лабораторные испытания': { en: 'Laboratory tests', fa: 'آزمایش‌های آزمایشگاهی' },
  'Итоговое решение': { en: 'Final decision', fa: 'تصمیم نهایی' },
  'Подтверждение': { en: 'Confirmation', fa: 'تأیید' },
  'Фотодокументация': { en: 'Photo documentation', fa: 'مستندات تصویری' },
  'Партия, транспорт, поставщик и условия загрузки.': { en: 'Batch, vehicle, supplier, and loading conditions.', fa: 'محموله، وسیله نقلیه، تأمین‌کننده و شرایط بارگیری.' },
  'Сверка документов, факта и состояния упаковки.': { en: 'Check documents, actual quantities, and packaging condition.', fa: 'بررسی اسناد، مقادیر واقعی و وضعیت بسته‌بندی.' },
  'Измерения продукта, кузова и проверка оборудования.': { en: 'Product and vehicle measurements and equipment checks.', fa: 'اندازه‌گیری محصول و خودرو و بررسی تجهیزات.' },
  'Каждый критерий заполняется отдельной карточкой, а не строкой бумажной таблицы.': { en: 'Each criterion is completed in a separate card.', fa: 'هر معیار در یک کارت جداگانه تکمیل می‌شود.' },
  'Категории продукции, замечания и решение по отгрузке.': { en: 'Product categories, observations, and shipment decision.', fa: 'دسته‌های محصول، ملاحظات و تصمیم ارسال.' },
  'Имена ответственных лиц и дата выпуска отчёта.': { en: 'Responsible persons and the report issue date.', fa: 'نام افراد مسئول و تاریخ صدور گزارش.' },
  'Каждая категория фотографий загружается в свой серверный фотослот.': { en: 'Each photo category is uploaded to its own server slot.', fa: 'هر دسته عکس در جایگاه جداگانه سرور بارگذاری می‌شود.' },
  'Заказ, поставщик, место инспекции и даты.': { en: 'Order, supplier, inspection location, and dates.', fa: 'سفارش، تأمین‌کننده، محل بازرسی و تاریخ‌ها.' },
  'Товар, PLU, фасовка, упаковка и маркировка.': { en: 'Product, PLU, pack size, packaging, and labeling.', fa: 'محصول، PLU، مقدار بسته‌بندی، نوع بسته‌بندی و برچسب‌گذاری.' },
  'Температурный режим, пломба и термографы.': { en: 'Temperature conditions, seal, and thermographs.', fa: 'شرایط دما، پلمب و ترموگراف‌ها.' },
  'Проценты категорий, отход, калибр, сорт и Brix.': { en: 'Category percentages, waste, size, variety, and Brix.', fa: 'درصد دسته‌ها، ضایعات، اندازه، رقم و بریکس.' },
  'Описание нестандарта, отхода и замечаний по калибру.': { en: 'Non-standard product, waste, and size observations.', fa: 'شرح محصول نامنطبق، ضایعات و ملاحظات اندازه.' },
  'Генератор точек контроля по палетам.': { en: 'Pallet inspection point generator.', fa: 'تولیدکننده نقاط بازرسی پالت‌ها.' },
  'Фотоотчет по категориям документа.': { en: 'Photo report by document category.', fa: 'گزارش تصویری بر اساس دسته سند.' },
  'Выпуск отчета, эксперт и представитель ТС.': { en: 'Report release, expert, and retail representative.', fa: 'صدور گزارش، کارشناس و نماینده شبکه فروش.' },
  'После данных о партии укажите товар, фасовку, PLU и маркировку.': { en: 'After the batch details, enter product, pack size, PLU, and labeling.', fa: 'پس از اطلاعات محموله، محصول، مقدار بسته‌بندی، PLU و برچسب را وارد کنید.' },
  'Добавьте фотографии для этого поля.': { en: 'Add photos for this field.', fa: 'برای این فیلد عکس اضافه کنید.' },
  'Сформируйте случайные точки контроля по палетам.': { en: 'Generate random inspection points for the pallets.', fa: 'نقاط بازرسی تصادفی برای پالت‌ها تولید کنید.' },
  'Заполните результаты проверки по пунктам.': { en: 'Complete the inspection results item by item.', fa: 'نتایج بازرسی را موردبه‌مورد تکمیل کنید.' },
  'Заполните поля этого раздела.': { en: 'Complete the fields in this section.', fa: 'فیلدهای این بخش را تکمیل کنید.' },
  'Номер партии': { en: 'Batch number', fa: 'شماره محموله' },
  'Номер инвойса': { en: 'Invoice number', fa: 'شماره فاکتور' },
  'Поставщик': { en: 'Supplier', fa: 'تأمین‌کننده' },
  'Страна происхождения': { en: 'Country of origin', fa: 'کشور مبدأ' },
  'Место загрузки': { en: 'Loading location', fa: 'محل بارگیری' },
  'Государственный номер': { en: 'Vehicle registration number', fa: 'شماره پلاک خودرو' },
  'Номер прицепа': { en: 'Trailer number', fa: 'شماره تریلر' },
  'Прицеп N': { en: 'Trailer no.', fa: 'شماره تریلر' },
  'Номер пломбы': { en: 'Seal number', fa: 'شماره پلمب' },
  'Место инспекции': { en: 'Inspection location', fa: 'محل بازرسی' },
  'Дата открытия': { en: 'Opening date', fa: 'تاریخ بازگشایی' },
  'Дата инспекции': { en: 'Date Inspection', fa: 'بازرسی تاریخ' },
  'Время инспекции': { en: 'Inspection time', fa: 'زمان بازرسی' },
  'Смена': { en: 'Shift', fa: 'شیفت' },
  'Утро': { en: 'Morning', fa: 'صبح' },
  'Вечер': { en: 'Evening', fa: 'عصر' },
  'Всего палет': { en: 'Total pallets', fa: 'کل پالت‌ها' },
  'Коробок на палете': { en: 'Boxes per pallet', fa: 'تعداد جعبه در هر پالت' },
  'Всего коробок': { en: 'Total boxes', fa: 'کل جعبه‌ها' },
  'Вес нетто коробки': { en: 'Box net weight', fa: 'وزن خالص جعبه' },
  'Вес брутто коробки': { en: 'Box gross weight', fa: 'وزن ناخالص جعبه' },
  'Общий вес нетто': { en: 'Total net weight', fa: 'وزن خالص کل' },
  'По документам': { en: 'According to documents', fa: 'طبق اسناد' },
  'Фактически': { en: 'Actual', fa: 'واقعی' },
  'Состояние коробок': { en: 'Box condition', fa: 'وضعیت جعبه‌ها' },
  'Целостность упаковки': { en: 'Packaging integrity', fa: 'سلامت بسته‌بندی' },
  'Сухость упаковки': { en: 'Packaging dryness', fa: 'خشکی بسته‌بندی' },
  'Корректность этикетки': { en: 'Label correctness', fa: 'صحت برچسب' },
  'Качество штрихкода': { en: 'Barcode quality', fa: 'کیفیت بارکد' },
  'Код фермы / GAP': { en: 'Farm / GAP code', fa: 'کد مزرعه / GAP' },
  'Сертификат здоровья': { en: 'Health certificate', fa: 'گواهی سلامت' },
  'Отсутствие посторонней рекламы': { en: 'No third-party advertising', fa: 'نبود تبلیغات نامرتبط' },
  'Товарный вид': { en: 'Product appearance', fa: 'ظاهر محصول' },
  'Температура пульпы': { en: 'Pulp temperature', fa: 'دمای پالپ' },
  'Температура мякоти': { en: 'Flesh temperature', fa: 'دمای بافت محصول' },
  'Температура поверхности продукта': { en: 'Product surface temperature', fa: 'دمای سطح محصول' },
  'Температура в передней части кузова': { en: 'Front vehicle temperature', fa: 'دمای جلوی محفظه خودرو' },
  'Температура в средней части кузова': { en: 'Middle vehicle temperature', fa: 'دمای میانه محفظه خودرو' },
  'Температура в задней части кузова': { en: 'Rear vehicle temperature', fa: 'دمای عقب محفظه خودرو' },
  'Относительная влажность': { en: 'Relative humidity', fa: 'رطوبت نسبی' },
  'Терморегистратор': { en: 'Temperature logger', fa: 'ثبت‌کننده دما' },
  'Холодильная установка': { en: 'Refrigeration unit', fa: 'واحد سرمایشی' },
  'Чистота кузова': { en: 'Vehicle cleanliness', fa: 'تمیزی محفظه خودرو' },
  'Циркуляция воздуха': { en: 'Air circulation', fa: 'گردش هوا' },
  'Конденсат на палетах': { en: 'Condensation on pallets', fa: 'میعان روی پالت‌ها' },
  'Стабильная работа': { en: 'Stable operation', fa: 'عملکرد پایدار' },
  'Чисто, без запахов': { en: 'Clean and odor-free', fa: 'تمیز و بدون بو' },
  'Без препятствий': { en: 'Unobstructed', fa: 'بدون مانع' },
  'Должен отсутствовать': { en: 'Must be absent', fa: 'نباید وجود داشته باشد' },
  'Активен и записывает': { en: 'Active and recording', fa: 'فعال و در حال ثبت' },
  'Равномерность цвета': { en: 'Color uniformity', fa: 'یکنواختی رنگ' },
  'Форма и плотность': { en: 'Shape and firmness', fa: 'شکل و سفتی' },
  'Механические повреждения': { en: 'Mechanical damage', fa: 'آسیب مکانیکی' },
  'Гниль, плесень и слизь': { en: 'Rot, mold, and slime', fa: 'پوسیدگی، کپک و لیزی' },
  'Увядание и вредители': { en: 'Wilting and pests', fa: 'پژمردگی و آفات' },
  'Состояние плодоножки': { en: 'Stem condition', fa: 'وضعیت دم محصول' },
  'Посторонние включения': { en: 'Foreign matter', fa: 'مواد خارجی' },
  'Запах': { en: 'Odor', fa: 'بو' },
  'Критичность': { en: 'Severity', fa: 'شدت' },
  'Комментарий': { en: 'Comment', fa: 'نظر' },
  '1 категория': { en: 'Category 1', fa: 'دسته ۱' },
  '2 категория': { en: 'Category 2', fa: 'دسته ۲' },
  'Соответствует 1 категории': { en: 'Meets category 1', fa: 'مطابق دسته ۱' },
  'Нестандарт для 1 категории': { en: 'Non-standard for category 1', fa: 'نامنطبق برای دسته ۱' },
  'Нестандарт': { en: 'Non-standard', fa: 'نامنطبق' },
  'Калибр': { en: 'Size', fa: 'اندازه' },
  'Сорт': { en: 'Variety', fa: 'رقم' },
  'Плотность': { en: 'Firmness', fa: 'سفتی' },
  'Brix / сахар': { en: 'Brix / sugar', fa: 'بریکس / قند' },
  'Содержание нитратов': { en: 'Nitrate content', fa: 'مقدار نیترات' },
  'Нитраты': { en: 'Nitrates', fa: 'نیترات' },
  'Метод': { en: 'Method', fa: 'روش' },
  'Результат': { en: 'Result', fa: 'نتیجه' },
  'Номер лаборатории': { en: 'Laboratory number', fa: 'شماره آزمایشگاه' },
  'Дата сбора': { en: 'Collection date', fa: 'تاریخ نمونه‌برداری' },
  'Примечания лаборатории': { en: 'Laboratory notes', fa: 'یادداشت‌های آزمایشگاه' },
  'Решение по партии': { en: 'Batch decision', fa: 'تصمیم درباره محموله' },
  'Принято': { en: 'Accepted', fa: 'پذیرفته‌شده' },
  'Условно принято': { en: 'Conditionally accepted', fa: 'پذیرش مشروط' },
  'Отклонено': { en: 'Rejected', fa: 'ردشده' },
  'Замечания и предписания': { en: 'Observations and instructions', fa: 'ملاحظات و دستورها' },
  'Инспектор': { en: 'Inspector', fa: 'بازرس' },
  'Представитель заказчика': { en: 'Customer representative', fa: 'نماینده مشتری' },
  'Представитель склада': { en: 'Warehouse representative', fa: 'نماینده انبار' },
  'Водитель': { en: 'Driver', fa: 'راننده' },
  'Руководитель ОТК': { en: 'Quality control manager', fa: 'مدیر کنترل کیفیت' },
  'Дата отчёта': { en: 'Report date', fa: 'تاریخ گزارش' },
  'Дата выпуска отчета': { en: 'Report issue date', fa: 'تاریخ صدور گزارش' },
  'Образец продукта': { en: 'Product sample', fa: 'نمونه محصول' },
  'Дисплей температуры': { en: 'Temperature display', fa: 'نمایشگر دما' },
  'Состояние кузова': { en: 'Vehicle condition', fa: 'وضعیت محفظه خودرو' },
  'Загрузка палет': { en: 'Pallet loading', fa: 'بارگیری پالت‌ها' },
  'Этикетка и штрихкод': { en: 'Label and barcode', fa: 'برچسب و بارکد' },
  'Дополнительные фотографии': { en: 'Additional photos', fa: 'عکس‌های بیشتر' },
  'Транспортное средство': { en: 'Vehicle', fa: 'وسیله نقلیه' },
  'Аллея / фасад': { en: 'Aisle / facade', fa: 'راهرو / نما' },
  'ГСЗ / выборка': { en: 'Sampling', fa: 'نمونه‌گیری' },
  'Общий вид товара': { en: 'Product overview', fa: 'نمای کلی محصول' },
  'Разрушающий контроль': { en: 'Destructive testing', fa: 'آزمون مخرب' },
  'Введите название макета': { en: 'Enter a template name', fa: 'نام قالب را وارد کنید' },
  'Добавьте хотя бы один раздел': { en: 'Add at least one section', fa: 'حداقل یک بخش اضافه کنید' },
  'Добавьте в макет хотя бы одно поле': { en: 'Add at least one field to the template', fa: 'حداقل یک فیلد به قالب اضافه کنید' },
  'Макет не найден': { en: 'Template not found', fa: 'قالب پیدا نشد' },
  'Отчет не найден': { en: 'Report not found', fa: 'گزارش پیدا نشد' },
  'Отчет не найден на сервере': { en: 'Report not found on the server', fa: 'گزارش روی سرور پیدا نشد' },
  'Нужно войти в систему': { en: 'Please sign in', fa: 'لطفاً وارد شوید' },
  'Нужно войти под администратором': { en: 'Administrator access required', fa: 'دسترسی مدیر لازم است' },
  'Нужно войти под аккаунтом инспектора': { en: 'Inspector access required', fa: 'دسترسی بازرس لازم است' },
  'Не удалось войти в аккаунт': { en: 'Could not sign in', fa: 'ورود به حساب انجام نشد' },
  'Не удалось обновить аккаунты': { en: 'Could not refresh accounts', fa: 'به‌روزرسانی حساب‌ها انجام نشد' },
  'Не удалось обновить параметры макета': { en: 'Could not update template settings', fa: 'به‌روزرسانی تنظیمات قالب انجام نشد' },
  'Не удалось сохранить данные': { en: 'Could not save data', fa: 'ذخیره داده‌ها انجام نشد' },
  'Не удалось сохранить макет': { en: 'Could not save template', fa: 'ذخیره قالب انجام نشد' },
  'Не удалось открыть PDF': { en: 'Could not open PDF', fa: 'باز کردن PDF انجام نشد' },
  'Не удалось отправить отчёт': { en: 'Could not submit report', fa: 'ارسال گزارش انجام نشد' },
  'Не удалось отрисовать страницы PDF': { en: 'Could not render PDF pages', fa: 'نمایش صفحات PDF انجام نشد' },
  'Не удалось получить серверный PDF': { en: 'Could not retrieve the server PDF', fa: 'دریافت PDF از سرور انجام نشد' },
  'PDF повреждён или имеет неподдерживаемый формат': { en: 'The PDF is damaged or uses an unsupported format', fa: 'PDF خراب است یا قالب آن پشتیبانی نمی‌شود' },
  'Браузер не поддерживает отрисовку PDF в canvas': { en: 'This browser cannot render PDF to canvas', fa: 'این مرورگر نمایش PDF روی canvas را پشتیبانی نمی‌کند' },
  'Сервер недоступен. Нет подключения к сети.': { en: 'Server unavailable. No network connection.', fa: 'سرور در دسترس نیست. اتصال شبکه وجود ندارد.' },
  'Сервер не ответил вовремя. Повторите попытку.': { en: 'The server timed out. Please try again.', fa: 'سرور به‌موقع پاسخ نداد. دوباره تلاش کنید.' },
  'Сервер недоступен. Проверьте подключение и повторите попытку.': { en: 'Server unavailable. Check your connection and try again.', fa: 'سرور در دسترس نیست. اتصال را بررسی و دوباره تلاش کنید.' },
  'Сначала сформируйте PDF отчета': { en: 'Generate the report PDF first', fa: 'ابتدا PDF گزارش را ایجاد کنید' },
  'Сначала сформируйте и проверьте актуальный PDF': { en: 'Generate and review the current PDF first', fa: 'ابتدا PDF فعلی را ایجاد و بررسی کنید' },
  'Есть неотправленные отчёты': { en: 'There are unsent reports', fa: 'گزارش‌های ارسال‌نشده وجود دارد' },
  'Удалить локальные данные': { en: 'Delete local data', fa: 'حذف داده‌های محلی' },
  'Новое поле': { en: 'New field', fa: 'فیلد جدید' },
  'Новый раздел': { en: 'New section', fa: 'بخش جدید' },
  'Новый макет': { en: 'New template', fa: 'قالب جدید' },
  'Поле без названия': { en: 'Untitled field', fa: 'فیلد بدون عنوان' },
  'Добавить поле-источник': { en: 'Add source field', fa: 'افزودن فیلد منبع' },
  'Удалить поле-источник': { en: 'Delete source field', fa: 'حذف فیلد منبع' },
  'Поднять поле': { en: 'Move field up', fa: 'انتقال فیلد به بالا' },
  'Опустить поле': { en: 'Move field down', fa: 'انتقال فیلد به پایین' },
  'Поднять печатный раздел': { en: 'Move print section up', fa: 'انتقال بخش چاپی به بالا' },
  'Опустить печатный раздел': { en: 'Move print section down', fa: 'انتقال بخش چاپی به پایین' },
  'Удалить макет': { en: 'Delete template', fa: 'حذف قالب' },
  'Удалить макет?': { en: 'Delete template?', fa: 'قالب حذف شود؟' },
  'Удалить раздел?': { en: 'Delete section?', fa: 'بخش حذف شود؟' },
  'Опубликовать макет?': { en: 'Publish template?', fa: 'قالب منتشر شود؟' },
  'Сбросить настройки?': { en: 'Reset settings?', fa: 'تنظیمات بازنشانی شوند؟' },
  'Сбросить': { en: 'Reset', fa: 'بازنشانی' },
  'Создан независимый черновик-копия.': { en: 'An independent draft copy was created.', fa: 'یک کپی پیش‌نویس مستقل ایجاد شد.' },
  '1 кг': { en: '1 kg', fa: '۱ کیلوگرم' },
  '5 кг': { en: '5 kg', fa: '۵ کیلوگرم' },
  'Картонная коробка': { en: 'Cardboard box', fa: 'جعبه مقوایی' },
  'Пластиковый ящик': { en: 'Plastic crate', fa: 'سبد پلاستیکی' },
  'Овощи': { en: 'Vegetables', fa: 'سبزیجات' },
  'Свежие овощи': { en: 'Fresh vegetables', fa: 'سبزیجات تازه' },
  'Молочная продукция': { en: 'Dairy products', fa: 'محصولات لبنی' },
  'Замороженное мясо': { en: 'Frozen meat', fa: 'گوشت منجمد' },
  'Сухие товары': { en: 'Dry goods', fa: 'کالاهای خشک' },
  'Склад холодного хранения': { en: 'Cold storage warehouse', fa: 'انبار سردخانه' },
  'Морозильный склад': { en: 'Freezer warehouse', fa: 'انبار انجماد' },
  'Основной склад': { en: 'Main warehouse', fa: 'انبار اصلی' },
  'Перец красный сладкий 1 кг': { en: 'Red sweet pepper, 1 kg', fa: 'فلفل دلمه‌ای قرمز، ۱ کیلوگرم' },
  'Красный перец': { en: 'Red pepper', fa: 'فلفل قرمز' },
  'Жёлтый перец': { en: 'Yellow pepper', fa: 'فلفل زرد' },
  'Оранжевый перец': { en: 'Orange pepper', fa: 'فلفل نارنجی' },
}

const originalText = new WeakMap<Text, string>()
const originalAttributes = new WeakMap<Element, Map<string, string>>()
const translatableAttributes = ['aria-label', 'title', 'placeholder', 'alt'] as const
let observer: MutationObserver | null = null
let translating = false

function translateKnownText(source: string): string {
  if (currentLocale.value === 'ru') return source
  const exact = messages[source]
  if (exact) return exact[currentLocale.value]

  const rules: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
    [/^([＋+]\s*)(.+)$/, (m) => `${m[1]}${translateKnownText(m[2] ?? '')}`],
    [/^Ожидают отправки: (\d+)$/, (m) => currentLocale.value === 'fa' ? `${m[1]} گزارش در انتظار ارسال` : `Waiting to submit: ${m[1]}`],
    [/^Шаг (\d+) из (\d+)$/, (m) => currentLocale.value === 'fa' ? `مرحله ${m[1]} از ${m[2]}` : `Step ${m[1]} of ${m[2]}`],
    [/^Шаг (\d+) из (\d+) ·$/, (m) => currentLocale.value === 'fa' ? `مرحله ${m[1]} از ${m[2]} ·` : `Step ${m[1]} of ${m[2]} ·`],
    [/^Шаг (\d+) из (\d+) · (.+)$/, (m) => currentLocale.value === 'fa' ? `مرحله ${m[1]} از ${m[2]} · ${translateKnownText(m[3] ?? '')}` : `Step ${m[1]} of ${m[2]} · ${translateKnownText(m[3] ?? '')}`],
    [/^Страница (\d+) из (\d+)$/, (m) => currentLocale.value === 'fa' ? `صفحه ${m[1]} از ${m[2]}` : `Page ${m[1]} of ${m[2]}`],
    [/^Отрисовываем страницы: (\d+) \/ (\d+)$/, (m) => currentLocale.value === 'fa' ? `در حال نمایش صفحات: ${m[1]} / ${m[2]}` : `Rendering pages: ${m[1]} / ${m[2]}`],
    [/^(\d+) разделов · (\d+) полей$/, (m) => currentLocale.value === 'fa' ? `${m[1]} بخش · ${m[2]} فیلد` : `${m[1]} sections · ${m[2]} fields`],
    [/^(\d+) полей$/, (m) => currentLocale.value === 'fa' ? `${m[1]} فیلد` : `${m[1]} fields`],
    [/^(\d+) фото$/, (m) => currentLocale.value === 'fa' ? `${m[1]} عکس` : `${m[1]} photos`],
    [/^(\d+) шт\.$/, (m) => currentLocale.value === 'fa' ? `${m[1]} عدد` : `${m[1]}`],
    [/^Заказ (.+)$/, (m) => currentLocale.value === 'fa' ? `سفارش ${m[1]}` : `Order ${m[1]}`],
    [/^Норма: (.+)$/, (m) => currentLocale.value === 'fa' ? `استاندارد: ${m[1]}` : `Standard: ${m[1]}`],
    [/^Открыть фото: (.+)$/, (m) => currentLocale.value === 'fa' ? `باز کردن عکس: ${m[1]}` : `Open photo: ${m[1]}`],
    [/^Изменен (.+)$/, (m) => currentLocale.value === 'fa' ? `تغییر در ${m[1]}` : `Modified ${m[1]}`],
    [/^Сохранено в (.+)$/, (m) => currentLocale.value === 'fa' ? `در ${m[1]} ذخیره شد` : `Saved at ${m[1]}`],
    [/^В архиве с (.+)$/, (m) => currentLocale.value === 'fa' ? `بایگانی‌شده از ${m[1]}` : `Archived since ${m[1]}`],
    [/^Удалить отчет «(.+)» из истории\?$/, (m) => currentLocale.value === 'fa' ? `گزارش «${m[1]}» از سوابق حذف شود؟` : `Delete “${m[1]}” from report history?`],
    [/^Вернуть отчет «(.+)» из архива\?$/, (m) => currentLocale.value === 'fa' ? `گزارش «${m[1]}» از بایگانی بازگردانی شود؟` : `Restore “${m[1]}” from the archive?`],
    [/^Отключить аккаунт «(.+)» на этой рабочей станции\?$/, (m) => currentLocale.value === 'fa' ? `حساب «${m[1]}» در این دستگاه غیرفعال شود؟` : `Disable “${m[1]}” on this device?`],
    [/^Удалить раздел «(.+)» и все его поля\?$/, (m) => currentLocale.value === 'fa' ? `بخش «${m[1]}» و همه فیلدهای آن حذف شوند؟` : `Delete section “${m[1]}” and all its fields?`],
    [/^Проверяющие смогут выбрать «(.+)» для новых отчетов\.$/, (m) => currentLocale.value === 'fa' ? `بازرسان می‌توانند برای گزارش‌های جدید «${m[1]}» را انتخاب کنند.` : `Inspectors will be able to choose “${m[1]}” for new reports.`],
  ]

  for (const [pattern, render] of rules) {
    const match = source.match(pattern)
    if (match) return render(match)
  }

  return source
}

function isTranslationIgnored(node: Node): boolean {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  return Boolean(element?.closest('[data-i18n-ignore]'))
}

export function t(source: string): string {
  return translateKnownText(source)
}

export function tForLocale(source: string, locale: AppLocale): string {
  if (locale === 'ru') {
    return source
  }

  return messages[source]?.[locale] ?? source
}

export function setLocale(locale: AppLocale): void {
  currentLocale.value = locale
}

function translateTextNode(node: Text): void {
  if (isTranslationIgnored(node)) return
  const rendered = node.nodeValue ?? ''
  const trimmed = rendered.trim()
  if (!trimmed) return

  let source = originalText.get(node)
  if (!source || (/[А-Яа-яЁё]/.test(trimmed) && trimmed !== translateKnownText(source))) {
    source = trimmed
    originalText.set(node, source)
  }

  const translated = translateKnownText(source)
  if (translated === trimmed) return
  node.nodeValue = rendered.replace(trimmed, translated)
}

function translateElement(element: Element): void {
  if (isTranslationIgnored(element)) return
  let attributes = originalAttributes.get(element)
  if (!attributes) {
    attributes = new Map<string, string>()
    originalAttributes.set(element, attributes)
  }

  for (const attribute of translatableAttributes) {
    const rendered = element.getAttribute(attribute)
    if (!rendered) continue
    const saved = attributes.get(attribute)
    if (!saved || (/[А-Яа-яЁё]/.test(rendered) && rendered !== translateKnownText(saved))) {
      attributes.set(attribute, rendered)
    }
    const source = attributes.get(attribute) ?? rendered
    const translated = translateKnownText(source)
    if (rendered !== translated) element.setAttribute(attribute, translated)
  }
}

function translateTree(root: Node): void {
  if (isTranslationIgnored(root)) return
  translating = true
  if (root.nodeType === Node.TEXT_NODE) translateTextNode(root as Text)
  if (root.nodeType === Node.ELEMENT_NODE) translateElement(root as Element)

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    if (!isTranslationIgnored(node)) {
      if (node.nodeType === Node.TEXT_NODE) translateTextNode(node as Text)
      else translateElement(node as Element)
    }
    node = walker.nextNode()
  }
  translating = false
}

function applyDocumentLocale(): void {
  document.documentElement.lang = currentLocale.value
  document.documentElement.dir = isRtl.value ? 'rtl' : 'ltr'
  try {
    localStorage.setItem(STORAGE_KEY, currentLocale.value)
  } catch {
    // The language still works for the current session when storage is unavailable.
  }
  if (document.body) translateTree(document.body)
}

export function initializeI18n(): void {
  applyDocumentLocale()
  observer?.disconnect()
  observer = new MutationObserver((mutations) => {
    if (translating) return
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') translateTree(mutation.target)
      if (mutation.type === 'attributes') translateTree(mutation.target)
      for (const node of mutation.addedNodes) translateTree(node)
    }
  })
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...translatableAttributes],
  })
}

watch(currentLocale, applyDocumentLocale)
