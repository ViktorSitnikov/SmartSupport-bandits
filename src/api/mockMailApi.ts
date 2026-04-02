export type MailDirection = 'in' | 'out'
export type EmotionalTone = 'positive' | 'neutral' | 'negative'

export type Mail = {
  id: string
  date: string
  fullName: string
  objectName: string
  phone: string
  email: string
  serialNumbers: string
  deviceType: string
  emotionalTone: EmotionalTone
  issueSummary: string
  direction: MailDirection
  read: boolean
  text: string
  supportResponse: string | null
}

export type MailInput = Omit<Mail, 'id' | 'date' | 'direction' | 'read'>
/** Вебхук: либо только текст, либо только файл (PDF/TXT как base64). */
export type RawLetterInput =
  | { kind: 'text'; text: string }
  | {
      kind: 'file'
      fileName: string
      fileMimeType: string
      /** Содержимое файла в base64 без префикса data:... */
      fileBase64: string
    }

/** Ответ AI/n8n после разбора письма (как в webhook). */
export type AIResponse = {
  fullName: string
  company: string
  phoneNumber: string
  email: string
  factoryNumber: string
  typeOfDevices: string
  emotionalColoring: string
  questionEssence: string
  mailText: string
  supportResponse: string
}

function getApiBase(): string {
  const raw = import.meta.env.VITE_API_BASE
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw.replace(/\/$/, '')
  }
  return '/api'
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBase()
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text || res.statusText}`)
  }

  if (res.status === 204) {
    return undefined as T
  }

  return res.json() as Promise<T>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Достаёт объект AI из ответа n8n (плоский JSON, массив, body/output и т.п.). */
export function parseAIResponseFromWebhookPayload(payload: unknown): AIResponse {
  let current: unknown = payload

  if (Array.isArray(current) && current.length > 0) {
    current = current[0]
  }

  if (isRecord(current) && 'body' in current) {
    current = current.body
  }
  if (isRecord(current) && 'output' in current) {
    current = current.output
  }
  if (isRecord(current) && 'data' in current && isRecord(current.data)) {
    current = current.data
  }

  if (!isRecord(current)) {
    throw new Error('Webhook: ожидался объект с полями AI')
  }

  const str = (key: string) => {
    const v = current[key]
    return typeof v === 'string' ? v : v == null ? '' : String(v)
  }

  const ai: AIResponse = {
    fullName: str('fullName'),
    company: str('company'),
    phoneNumber: str('phoneNumber'),
    email: str('email'),
    factoryNumber: str('factoryNumber'),
    typeOfDevices: str('typeOfDevices'),
    emotionalColoring: str('emotionalColoring'),
    questionEssence: str('questionEssence'),
    mailText: str('mailText'),
    supportResponse: str("supportResponse")
  }

  if (!ai.fullName && !ai.questionEssence && !ai.mailText) {
    throw new Error('Webhook: пустой ответ AI (нет распознанных полей)')
  }

  return ai
}

function emotionalColoringToTone(label: string): EmotionalTone {
  const n = label.trim().toLowerCase()
  if (/негатив|negative|негативн/.test(n)) return 'negative'
  if (/позитив|positive|позитивн/.test(n)) return 'positive'
  return 'neutral'
}

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

export function aiResponseToMail(ai: AIResponse): Mail {
  return {
    id: randomId('ai'),
    date: new Date().toISOString(),
    fullName: ai.fullName || '—',
    objectName: ai.company || '—',
    phone: ai.phoneNumber || '—',
    email: ai.email || '—',
    serialNumbers: ai.factoryNumber || '—',
    deviceType: ai.typeOfDevices || '—',
    emotionalTone: emotionalColoringToTone(ai.emotionalColoring),
    issueSummary: ai.questionEssence || '—',
    direction: 'out',
    read: true,
    text: ai.mailText || '',
    supportResponse: ai.supportResponse
  }
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const issueSamples = [
  'После замены сенсора прибор не проходит самотестирование (ошибка E03).',
  'Нужно уточнить процедуру калибровки и рекомендуемую газовую смесь.',
  'Ложные срабатывания в ночное время, подозреваем наводки/помехи по питанию.',
  'Периодически пропадает связь по RS‑485, помогает перезапуск.',
  'Сильно выросло время прогрева, показания «плавают» первые 10–15 минут.',
  'Не сохраняются настройки порогов тревоги после выключения питания.',
]

const deviceTypes = ['ГХ-200', 'Сигнал-7', 'Аналитик-М', 'ПГА-4', 'Аналитик‑М2', 'Сигнал‑7 Pro']
const tones: EmotionalTone[] = ['positive', 'neutral', 'negative']

const firstNames = ['Алексей', 'Иван', 'Дмитрий', 'Сергей', 'Андрей', 'Михаил', 'Павел', 'Анна', 'Екатерина', 'Мария', 'Ольга', 'Наталья']
const lastNames = ['Иванов', 'Петров', 'Сидоров', 'Смирнов', 'Кузнецов', 'Попов', 'Васильев', 'Соколов', 'Морозов', 'Новиков']
const patronymics = ['Иванович', 'Петрович', 'Сергеевич', 'Алексеевич', 'Андреевич', 'Дмитриевич', 'Михайлович', 'Викторович', 'Олегович']

const companies = [
  'ООО «ГазСервис»',
  'АО «ТеплоЭнерго»',
  'ООО «ПромАвтоматика»',
  'АО «НефтеХимМонтаж»',
  'ООО «ИнжТех»',
  'МУП «ГорТеплоСеть»',
]

const sites = [
  'котельная №3',
  'цех КИПиА',
  'участок подготовки газа',
  'насосная станция',
  'лаборатория',
  'склад ГСМ',
]

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function makeFullName(): string {
  return `${pick(lastNames)} ${pick(firstNames)} ${pick(patronymics)}`
}

function makeObjectName(): string {
  return `${pick(companies)}, ${pick(sites)}`
}

function makePhone(): string {
  // +7 9XX XXX-XX-XX
  const a = Math.floor(Math.random() * 900 + 100)
  const b = Math.floor(Math.random() * 900 + 100)
  const c = Math.floor(Math.random() * 90 + 10)
  const d = Math.floor(Math.random() * 90 + 10)
  return `+7 ${a} ${b}-${c}-${d}`
}

function makeEmail(fullName: string): string {
  const [last, first] = fullName.split(' ')
  const slug = `${(first ?? 'user').toLowerCase()}.${(last ?? 'mail').toLowerCase()}`
    .replace(/ё/g, 'e')
    .replace(/[^a-z.]/g, '')
  const domains = ['example.ru', 'corp.local', 'mail.ru', 'company.ru']
  return `${slug}@${pick(domains)}`
}

function makeSerial(): string {
  const year = String(new Date().getFullYear()).slice(-2)
  const batch = Math.floor(Math.random() * 900 + 100)
  const num = Math.floor(Math.random() * 900000 + 100000)
  return `SN-${year}${batch}-${num}`
}

async function saveMail(mail: Mail): Promise<Mail> {
  return apiFetch<Mail>('/mails', {
    method: 'POST',
    body: JSON.stringify(mail),
  })
}

export async function fetchMails(): Promise<Mail[]> {
  const list = await apiFetch<Mail[]>('/mails')
  return [...list].sort((a, b) => b.date.localeCompare(a.date))
}

export async function createMail(input: MailInput): Promise<Mail> {
  const createdMail: Mail = {
    id: randomId('m'),
    ...input,
    date: new Date().toISOString(),
    direction: 'out',
    read: true,
  }
  return saveMail(createdMail)
}

export async function sendLetterToWebhook(
  input: RawLetterInput,
  webhookUrl: string,
): Promise<Mail> {
  if (!webhookUrl) {
    throw new Error('Webhook URL is empty')
  }

  const body =
    input.kind === 'text'
      ? {
          text: input.text,
        }
      : {
        binary: {
          pdf: {
            data: input.fileBase64,  // строка base64
            mimeType: input.fileMimeType,
            fileName: input.fileName,
          }
        },
        }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Webhook failed with status ${response.status}`)
  }

  const payload: unknown = await response.json()
  const ai = parseAIResponseFromWebhookPayload(payload)
  const mail = aiResponseToMail(ai)

  return saveMail(mail)
}

export async function generateIncomingMail() {
  await delay(300)

  const issueSummary = pick(issueSamples)
  const deviceType = pick(deviceTypes)
  const emotionalTone = pick(tones)

  const fullName = makeFullName()
  const objectName = makeObjectName()
  const phone = makePhone()
  const email = makeEmail(fullName)
  const serialNumbers = makeSerial()

  const ticket = Math.floor(Math.random() * 9000 + 1000)
  const text = [
    `Добрый день! Обращение №${ticket}.`,
    `Прибор: ${deviceType}, заводской номер: ${serialNumbers}.`,
    `Ситуация: ${issueSummary}`,
    'Подскажите, пожалуйста, возможные причины и что проверить в первую очередь.',
  ].join('\n')

  const incomingMail: Mail = {
    id: randomId('in'),
    date: new Date().toISOString(),
    fullName,
    objectName,
    phone,
    email,
    serialNumbers,
    deviceType,
    emotionalTone,
    issueSummary,
    direction: 'in',
    read: false,
    text,
    supportResponse: null,
  }

  return incomingMail
}
