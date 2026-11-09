# TypeScript / React: приклади

Кожен приклад: як є → як краще → як викликач складає свою дію. Приклади ілюструють запах; переносити їх буквально не треба.

## Зміст
1. Контекст викликача в назві утиліти
2. Прапорці-перемикачі
3. Функції-близнюки
4. Механізм змішаний з політикою (HTTP, retry, повідомлення)
5. Історія undo/redo
6. React-хуки, підігнані під один компонент
7. Спільний компонент, що знає домен
8. Протилежна крайність: надмірна загальність
9. Інструменти

---

## 1. Контекст викликача в назві утиліти

```ts
// utils/price.ts — як є
export function formatPriceForCheckout(cents: number): string { ... }
export function formatPriceForInvoicePdf(cents: number): string { ... }
export function formatPriceForCartBadge(cents: number): string { ... }
```
Три функції відрізняються валютою і кількістю знаків. Нижній модуль знає про три екрани.

```ts
// utils/price.ts — як краще
export function formatMoney(cents: number, opts?: { currency?: string; fractionDigits?: number }): string
```
```ts
// CartBadge.tsx — політика у викликача
formatMoney(total, { fractionDigits: 0 })
```

## 2. Прапорці-перемикачі

```ts
// як є
export async function fetchOrders(userId: string, includeArchived: boolean, forAdmin: boolean) { ... }
fetchOrders(id, true, false) // що означає true?
```
Прапорець `forAdmin` вмикає зовсім іншу гілку коду — це дві функції в одній.

```ts
// як краще: один примітив з фільтром, що описує дані, а не викликача
type OrderFilter = { userId?: string; status?: OrderStatus[]; archived?: boolean }
export async function listOrders(filter: OrderFilter): Promise<Order[]>
```
Адмінська сторінка просто передає інший фільтр. Правило: параметр має описувати **що** потрібно (дані, діапазон), а не **хто** питає.

## 3. Функції-близнюки

```ts
// editor/text.ts — як є
export function removeLine(doc: Doc, line: number): Doc
export function removeWord(doc: Doc, cursor: Pos): Doc
export function removeChar(doc: Doc, cursor: Pos): Doc
export function backspace(doc: Doc, cursor: Pos): Doc
```
```ts
// як краще: два примітиви
export function deleteRange(doc: Doc, start: Pos, end: Pos): Doc
export function movePos(doc: Doc, pos: Pos, chars: number): Pos
```
```ts
// keymap.ts — дія клавіші складається у верхньому шарі
const onBackspace = (doc: Doc, cur: Pos) => deleteRange(doc, movePos(doc, cur, -1), cur)
```

## 4. Механізм змішаний з політикою

```ts
// api/client.ts — як є
export async function request(url: string, body?: unknown) {
  for (let i = 0; i < 3; i++) {
    try { return await fetch(url, ...) }
    catch (e) {
      if (url.includes('/orders')) toast.error('Не вдалося завантажити замовлення')
      ...
    }
  }
}
```
HTTP-клієнт знає про замовлення і про toast.

```ts
// як краще: механізм не знає ні про сутності, ні про UI
export async function withRetry<T>(fn: () => Promise<T>, opts?: { attempts?: number }): Promise<T>
export async function request<T>(url: string, init?: RequestInit): Promise<T>
```
```ts
// orders/api.ts — політика тут
try { return await withRetry(() => request<Order[]>('/orders')) }
catch { toast.error('Не вдалося завантажити замовлення'); throw e }
```

## 5. Історія undo/redo

```ts
// як є: історія знає про типи змін
type Change = { kind: 'insert'; pos: Pos; text: string } | { kind: 'delete'; ... } | { kind: 'select'; ... }
export function undo(state: State) { switch (last.kind) { case 'insert': ... } }
```
```ts
// як краще: історія — лише послідовність дій
export type Action = { undo(): void; redo(): void }
export function createHistory() {
  return { push(a: Action): void, undo(): void, redo(): void }
}
```
Кожен модуль (текст, виділення, налаштування) сам створює свої `Action`. Нова сутність не вимагає правки історії.

## 6. React-хуки, підігнані під один компонент

```ts
// як є
export function useUsersForAssigneeDropdown() {
  const { data } = useQuery(['users'], fetchUsers)
  return data?.filter(u => u.active).map(u => ({ label: u.fullName, value: u.id }))
}
export function useUsersForMentionList() { ... майже те саме ... }
```
```ts
// як краще: хук повертає дані, перетворення під UI робить компонент
export function useUsers(filter?: UserFilter) { return useQuery(['users', filter], () => listUsers(filter)) }
```
```tsx
// AssigneeSelect.tsx
const { data = [] } = useUsers({ active: true })
const options = data.map(u => ({ label: u.fullName, value: u.id }))
```

## 7. Спільний компонент, що знає домен

```tsx
// як є: «загальна» таблиця знає про замовлення
<DataTable rows={orders} showOrderStatus highlightOverdue onOrderClick={...} />
```
```tsx
// як краще: таблиця приймає колонки і обробник рядка
<DataTable<Order> rows={orders} columns={orderColumns} onRowClick={openOrder} rowClassName={o => o.overdue ? 'overdue' : ''} />
```
`orderColumns` і правило «прострочено» живуть у модулі замовлень.

## 8. Протилежна крайність: надмірна загальність

```ts
// погано: «універсальний» конвеєр, яким користується одне місце
export function createPipeline<TIn, TOut, TCtx extends Record<string, unknown>>(
  steps: Step<TIn, TOut, TCtx>[], opts: PipelineOptions<TCtx>) { ... }
```
Якщо є один викликач і три кроки — звичайна функція з трьома викликами простіша. Generic-параметри, реєстри, плагіни й конфіги додавай лише під реальних викликачів, які вже є.

## 9. Інструменти
- Пошук викликачів: `tsc` + ts-morph (`findReferences`), або `rg -n "\bfnName\b"`; експорти без зовнішніх викликачів — `ts-prune` / `knip`.
- Перейменування й переміщення — ts-morph або рефакторинги IDE, щоб імпорти оновились автоматично.
- Перевірка після порції: `tsc --noEmit`, лінтер, тести (vitest/jest), збірка.
