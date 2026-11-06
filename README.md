# claude

Мої моди, плагіни й скіли для Claude Code. Репозиторій є маркетплейсом (каталогом плагінів) `renjeka`: кожен плагін лежить в окремій папці `plugins/<назва>`.

## Плагіни

| Плагін | Що робить |
|---|---|
| [session-dash](plugins/session-dash) | Панель «Сесія» поруч із чатом: скіли, MCP, агенти, плагіни й хуки, використання контексту і таймлайн подій поточної сесії. Вкладки, підказки при наведенні. Команда `/dash` відкриває панель. |
| [somewhat-general-purpose-refactor](plugins/somewhat-general-purpose-refactor) | Скіл рефакторингу за Остерхаутом («A Philosophy of Software Design», розд. 6 і 21): знаходить функції й модулі, підігнані під одного викликача, прапорці-перемикачі, функції-близнюки, змішування механізму з політикою. Складає план у `docs/refactor-audit/` і після «так» виконує порціями з тестами. TypeScript і Python/Frappe. |

## Встановлення

У терміналі, в сесії Claude Code:

```
/plugin install session-dash --marketplace RenJeka/claude
```

Далі `y`, щоб додати маркетплейс, і Enter для області user (усі ваші сесії).

Зі звичайного терміналу (shell):

```
claude plugin install session-dash --marketplace RenJeka/claude
```

У десктоп-застосунку Claude, де `/plugin` не працює: натисніть + біля поля вводу → Plugins → Add marketplace, введіть `RenJeka/claude`, потім Add plugin.

## Оновлення

```
claude plugin marketplace update renjeka
claude plugin update session-dash@renjeka
```

Після цього в уже відкритій сесії виконайте `/reload-plugins`.
