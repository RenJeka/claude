# Python / Frappe: приклади

Кожен приклад: як є → як краще → як викликач складає свою дію. Приклади ілюструють запах; переносити їх буквально не треба.

## Зміст
1. Whitelisted-методи під кожну сторінку
2. Копії запитів з різними фільтрами
3. Прапорці-перемикачі
4. Утиліта, що знає доктайп
5. Контролер доктайпа змішує механізм і політику
6. Клієнтські скрипти-близнюки
7. Протилежна крайність
8. Особливості Frappe, які легко зламати
9. Інструменти й перевірка

---

## 1. Whitelisted-методи під кожну сторінку

```python
# myapp/api.py — як є
@frappe.whitelist()
def get_dashboard_card_data():
    return frappe.db.sql("select name, status from `tabTask` where status='Open' and owner=%s", frappe.session.user, as_dict=True)

@frappe.whitelist()
def get_sidebar_open_tasks():
    return frappe.db.sql("select name, subject from `tabTask` where status='Open' and owner=%s limit 5", frappe.session.user, as_dict=True)
```
Нижній шар знає про картку дашборду і бічну панель. Новий віджет — ще один метод.

```python
# myapp/tasks/queries.py — механізм
def list_tasks(filters: dict, fields: list[str], limit: int | None = None) -> list[dict]:
    return frappe.get_list("Task", filters=filters, fields=fields, limit_page_length=limit or 0)

# myapp/api.py — один whitelisted-метод з явними параметрами
@frappe.whitelist()
def my_open_tasks(fields: list[str] | None = None, limit: int | None = None):
    return list_tasks({"status": "Open", "owner": frappe.session.user}, fields or ["name", "subject", "status"], limit)
```
Сторінка сама вирішує, скільки рядків і яких полів їй треба. Старі методи — це публічний API (URL `/api/method/myapp.api.get_dashboard_card_data`), тож на перехідний період лиши їх тонкими обгортками і познач застарілими.

`frappe.get_list` враховує права користувача, `frappe.get_all` і сирий SQL — ні. Під час заміни SQL переконайся, що поведінка щодо прав не змінилась (або змінилась свідомо і це записано).

## 2. Копії запитів з різними фільтрами

```python
# як є: три функції відрізняються одним рядком WHERE
def get_overdue_invoices(customer): ...
def get_unpaid_invoices(customer): ...
def get_draft_invoices(customer): ...
```
```python
# як краще
def list_invoices(customer: str, **filters) -> list[dict]:
    return frappe.get_all("Sales Invoice", filters={"customer": customer, **filters}, fields=[...])
```
```python
# викликач
list_invoices(c, status="Overdue")
list_invoices(c, docstatus=0)
```

## 3. Прапорці-перемикачі

```python
# як є
def build_member_summary(member, for_report=False, for_print=False): ...
```
Якщо `for_report` і `for_print` вмикають різні гілки — це три функції в одній. Залиш один примітив, що повертає дані, а форматування під звіт чи друк зроби у відповідному звіті / Print Format / Jinja.

## 4. Утиліта, що знає доктайп

```python
# myapp/utils.py — як є
def send_reminder(name):
    doc = frappe.get_doc("Membership", name)
    frappe.sendmail(recipients=[doc.email], subject=f"Членство {doc.name} спливає", ...)
```
```python
# myapp/utils/notify.py — механізм
def send_doc_email(doc, recipients: list[str], subject: str, template: str): ...

# myapp/membership/reminders.py — політика
def remind_expiring(name):
    doc = frappe.get_doc("Membership", name)
    send_doc_email(doc, [doc.email], _("Членство {0} спливає").format(doc.name), "membership_expiring")
```
Ознака: модуль з назвою на кшталт `utils`, `helpers`, `common` імпортує або згадує конкретний доктайп.

## 5. Контролер доктайпа змішує механізм і політику

```python
# як є: validate знає про конкретний відділ і конкретне повідомлення форми
class Request(Document):
    def validate(self):
        if self.department == "Розвиток" and not self.budget:
            frappe.msgprint("Для відділу розвитку бюджет обов'язковий", indicator="red")
        ...
```
Правила, що змінюються разом з бізнесом (хто, коли, яке повідомлення), винось у окрему функцію-політику або таблицю налаштувань (Single DocType / дочірня таблиця правил), а контролер лише викликає перевірку. Коли таких правил одне-два і вони стабільні, лиши як є — це не варте окремого механізму.

## 6. Клієнтські скрипти-близнюки

```js
// як є: те саме у трьох формах
frappe.ui.form.on("Task",    { refresh(frm) { if (!frm.is_new()) frm.add_custom_button("Копіювати посилання", () => {...}) } })
frappe.ui.form.on("Project", { refresh(frm) { if (!frm.is_new()) frm.add_custom_button("Копіювати посилання", () => {...}) } })
```
```js
// myapp/public/js/form_utils.js (через app_include_js) — механізм
myapp.add_copy_link_button = (frm) => { ... }
// у формах — політика: де показувати
frappe.ui.form.on("Task", { refresh: myapp.add_copy_link_button })
```
Після зміни JS потрібен `bench build --app myapp` і очищення кешу.

## 7. Протилежна крайність
Не будуй «універсальний рушій правил» або власний мінідоктайп-конструктор там, де вистачить двох функцій. Frappe вже дає механізми: `doc_events`, Notification, Assignment Rule, Workflow, Property Setter. Часто найкращий рефакторинг — замінити свій спеціалізований код вбудованим механізмом.

## 8. Особливості Frappe, які легко зламати
- **Фіксовані імена:** методи контролера (`validate`, `before_save`, `on_submit`, `on_cancel`...), ключі `hooks.py`, структура папок доктайпа — не перейменовуй.
- **Шляхи в рядках:** `frappe.call({method: "myapp.api.fn"})`, `hooks.py` (`doc_events`, `scheduler_events`, `override_whitelisted_methods`), `frm.call("method")`, `fetch_from`, звіти (`*.py` поруч зі `*.json`). Переміщення функції ламає ці шляхи мовчки.
- **Код у базі даних:** Client Script, Server Script, Custom Field, Property Setter, Print Format можуть викликати твої методи, хоча в репозиторії їх нема. Перевір на стенді або у фікстурах (`fixtures` у `hooks.py`).
- **Дані:** якщо рефакторинг зачіпає поля, потрібен патч у `patches.txt`, а не лише зміна JSON доктайпа.

## 9. Інструменти й перевірка
- Пошук викликачів: `rg -n "fn_name"` по Python, JS, JSON і `hooks.py`; на стенді — пошук у Client Script / Server Script.
- Перевірка після порції: `ruff check`, `bench --site <site> run-tests --app <app>` (або `--module`), `bench build --app <app>` для JS, ручна перевірка форми / сторінки, якщо тестів нема.
- `bench --site <site> migrate`, якщо змінювались доктайпи чи патчі.
