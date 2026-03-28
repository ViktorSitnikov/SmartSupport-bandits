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
  'Не запускается газоанализатор после профилактики.',
  'Требуется консультация по калибровке прибора.',
  'Появляются ложные срабатывания датчика.',
]

const deviceTypes = ['ГХ-200', 'Сигнал-7', 'Аналитик-М', 'ПГА-4']
const tones: EmotionalTone[] = ['positive', 'neutral', 'negative']

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

  const issueSummary = issueSamples[Math.floor(Math.random() * issueSamples.length)]
  const deviceType = deviceTypes[Math.floor(Math.random() * deviceTypes.length)]
  const emotionalTone = tones[Math.floor(Math.random() * tones.length)]
  const uid = Math.floor(Math.random() * 900 + 100)

  const incomingMail: Mail = {
    id: randomId('in'),
    date: new Date().toISOString(),
    fullName: `Внешний Контакт ${uid}`,
    objectName: `Объект #${uid}`,
    phone: `+7 (9${Math.floor(Math.random() * 90 + 10)}) ${Math.floor(Math.random() * 900)}-${Math.floor(Math.random() * 90 + 10)}-${Math.floor(Math.random() * 90 + 10)}`,
    email: `external${uid}@mail.local`,
    serialNumbers: `SN-${Math.floor(Math.random() * 90000 + 10000)}`,
    deviceType,
    emotionalTone,
    issueSummary,
    direction: 'in',
    read: false,
    text: `Симуляция входящего письма #${uid}`,
    supportResponse: null,
  }

  return incomingMail
}
