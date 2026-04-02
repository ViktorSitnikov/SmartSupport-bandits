import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material'
import { BarChart, PieChart } from '@mui/x-charts'
import './App.css'
import {
  fetchMails,
  generateIncomingMail,
  sendLetterToWebhook,
  type EmotionalTone,
  type Mail,
} from './api/mockMailApi'

function App() {
  const [mails, setMails] = useState<Mail[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMail, setSelectedMail] = useState<Mail | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [letterText, setLetterText] = useState('')
  const [letterFile, setLetterFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [newMailNoticeOpen, setNewMailNoticeOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchMails()
        setMails(data)
      } catch {
        setError('Не удалось загрузить письма')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  useEffect(() => {
    const timerId = window.setInterval(async () => {
      try {
        const incomingMail = await generateIncomingMail()
        setMails((prev) => [incomingMail, ...prev])
        setNewMailNoticeOpen(true)
      } catch {
        setError('Ошибка получения нового письма')
      }
    }, 18000)

    return () => window.clearInterval(timerId)
  }, [])

  const stats = useMemo(() => {
    const total = mails.length
    const unread = mails.filter((m) => !m.read).length
    const toneCount = mails.reduce<Record<EmotionalTone, number>>(
      (acc, mail) => {
        acc[mail.emotionalTone] += 1
        return acc
      },
      { positive: 0, neutral: 0, negative: 0 },
    )

    const deviceMap = mails.reduce<Record<string, number>>((acc, mail) => {
      acc[mail.deviceType] = (acc[mail.deviceType] ?? 0) + 1
      return acc
    }, {})

    return {
      total,
      unread,
      toneCount,
      deviceLabels: Object.keys(deviceMap),
      deviceValues: Object.values(deviceMap),
    }
  }, [mails])

  const handleCreate = async () => {
    const trimmedText = letterText.trim()
    const hasText = trimmedText.length > 0
    const hasFile = letterFile != null

    if (!hasText && !hasFile) {
      setError('Добавьте текст письма или PDF/TXT файл')
      return
    }
    if (hasText && hasFile) {
      setError('Укажите либо текст письма, либо файл — не оба варианта сразу')
      return
    }

    try {
      setSubmitting(true)

      const webhookUrl = import.meta.env.VITE_N8N_WEBHOOK_URL as string | undefined

      const fileToBase64 = (file: File) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => {
            const s = reader.result as string
            const comma = s.indexOf(',')
            resolve(comma >= 0 ? s.slice(comma + 1) : s)
          }
          reader.onerror = () => reject(reader.error ?? new Error('Ошибка чтения файла'))
          reader.readAsDataURL(file)
        })

      const payload =
        hasFile && letterFile
          ? {
              kind: 'file' as const,
              fileName: letterFile.name,
              fileMimeType: letterFile.type,
              fileBase64: await fileToBase64(letterFile),
            }
          : { kind: 'text' as const, text: trimmedText }

      const newMail = await sendLetterToWebhook(payload, webhookUrl ?? '')

      setMails((prev) => [newMail, ...prev])
      setCreateOpen(false)
      setLetterText('')
      setLetterFile(null)
    } catch {
      setError(
        'Не удалось отправить письмо.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    if (!file) {
      setLetterFile(null)
      return
    }

    const allowedTypes = ['application/pdf', 'text/plain']
    if (!allowedTypes.includes(file.type)) {
      setError('Поддерживаются только PDF и TXT файлы')
      event.target.value = ''
      return
    }

    setLetterFile(file)
  }

  const getFirstNWords = (text: string, n = 15) => {
    if (!text) return '';
    const words = text.split(' ');
    return words.length > n 
      ? `${words.slice(0, n).join(' ')}...` 
      : text;
  };

  return (
    <Box sx={{ bgcolor: '#f5f7fb', minHeight: '100vh', pb: 4 }}>
      <AppBar position="static" color="primary">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            <div className="navbar-brand">
              <img style={{ height: 46, position: "absolute", top: "20%", zIndex: 5}} src="./src/assets/logo.svg"/>
            </div>
          </Typography>
          <Button color="inherit" variant="outlined" onClick={() => setCreateOpen(true)}>
            Загрузить письмо
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Typography variant="h5" gutterBottom>
          Главная
        </Typography>

        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle1" gutterBottom>
                Письма по статусу
              </Typography>
              <BarChart
                height={240}
                xAxis={[{ scaleType: 'band', data: ['Всего', 'Непрочитанные'] }]}
                series={[{ data: [stats.total, stats.unread], color: '#1976d2' }]}
              />
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle1" gutterBottom>
                Эмоциональный окрас
              </Typography>
              <PieChart
                height={240}
                series={[
                  {
                    data: [
                      { id: 0, value: stats.toneCount.positive, label: 'Позитив' },
                      { id: 1, value: stats.toneCount.neutral, label: 'Нейтрально' },
                      { id: 2, value: stats.toneCount.negative, label: 'Негатив' },
                    ],
                  },
                ]}
              />
            </Paper>
          </Grid>
        </Grid>
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle1" gutterBottom>
            Распределение по типам приборов
          </Typography>
          <BarChart
            height={250}
            xAxis={[{ scaleType: 'band', data: stats.deviceLabels }]}
            series={[{ data: stats.deviceValues, color: '#2e7d32' }]}
          />
        </Paper>

        <Paper>
          <Box sx={{ p: 2 }}>
            <Typography variant="h6">Письма</Typography>
            <Typography variant="body2" color="text.secondary">
              Нажмите на строку, чтобы открыть полную карточку обращения
            </Typography>
          </Box>
          <Divider />
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Дата</TableCell>
                  <TableCell>ФИО</TableCell>
                  <TableCell>Объект</TableCell>
                  <TableCell>Телефон</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Заводские номера</TableCell>
                  <TableCell>Тип приборов</TableCell>
                  <TableCell>Эмоциональный окрас</TableCell>
                  <TableCell>Суть вопроса</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {!loading &&
                  mails.map((mail) => (
                    <TableRow
                      key={mail.id}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => setSelectedMail(mail)}
                    >
                      <TableCell>{new Date(mail.date).toLocaleString('ru-RU')}</TableCell>
                      <TableCell>{mail.fullName}</TableCell>
                      <TableCell>{mail.objectName}</TableCell>
                      <TableCell>{mail.phone}</TableCell>
                      <TableCell>{mail.email}</TableCell>
                      <TableCell>{mail.serialNumbers}</TableCell>
                      <TableCell>{mail.deviceType}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={
                            mail.emotionalTone === 'positive'
                              ? 'Позитив'
                              : mail.emotionalTone === 'negative'
                                ? 'Негатив'
                                : 'Нейтрально'
                          }
                          color={
                            mail.emotionalTone === 'positive'
                              ? 'success'
                              : mail.emotionalTone === 'negative'
                                ? 'error'
                                : 'default'
                          }
                        />
                      </TableCell>
                      <TableCell>{getFirstNWords(mail.issueSummary, 10)}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Container>

      <Dialog open={Boolean(selectedMail)} onClose={() => setSelectedMail(null)} fullWidth maxWidth="md">
        <DialogTitle>Карточка обращения</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5}>
            <Typography variant="body2">
              <strong>Дата:</strong> {selectedMail ? new Date(selectedMail.date).toLocaleString('ru-RU') : ''}
            </Typography>
            <Typography variant="body2">
              <strong>ФИО:</strong> {selectedMail?.fullName}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>Объект:</strong> {selectedMail?.objectName}
            </Typography>
            <Typography variant="body2"><strong>Телефон:</strong> {selectedMail?.phone}</Typography>
            <Typography variant="body2"><strong>Email:</strong> {selectedMail?.email}</Typography>
            <Typography variant="body2"><strong>Заводские номера:</strong> {selectedMail?.serialNumbers}</Typography>
            <Typography variant="body2"><strong>Тип приборов:</strong> {selectedMail?.deviceType}</Typography>
            <Divider />
            <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
              <strong>Суть вопроса:</strong> {selectedMail?.issueSummary}
            </Typography>
            <Box sx={{ mb: 1 }}>
              <Typography variant="body1" component="div" sx={{ mb: 0.5 }}>
                <strong>Текст письма:</strong>
              </Typography>
              <Typography variant="body1" component="div" sx={{ whiteSpace: 'pre-wrap' }}>
                {selectedMail?.text}
              </Typography>
            </Box>
            <Box sx={{ mb: 1 }}>
              <Typography variant="body1" component="div" sx={{ mb: 0.5 }}>
                <strong>Ответ ИИ:</strong>
              </Typography>
              <Typography variant="body1" component="div" sx={{ whiteSpace: 'pre-wrap' }}>
                {selectedMail?.supportResponse}
              </Typography>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedMail(null)}>Закрыть</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Загрузка письма</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Текст письма"
              value={letterText}
              onChange={(event) => setLetterText(event.target.value)}
              multiline
              minRows={4}
              fullWidth
            />
            <Button variant="outlined" component="label">
              Выбрать PDF/TXT файл
              <input hidden type="file" accept=".pdf,.txt,application/pdf,text/plain" onChange={handleFileChange} />
            </Button>
            <Typography variant="body2" color="text.secondary">
              {letterFile ? `Файл выбран: ${letterFile.name}` : 'Файл не выбран'}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              На анализ пойдет либо только текст из поля выше, либо только выбранный файл.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleCreate} disabled={submitting}>
            {submitting ? 'Отправка...' : 'Отправить'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={newMailNoticeOpen}
        autoHideDuration={3500}
        onClose={() => setNewMailNoticeOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity="info" variant="filled" onClose={() => setNewMailNoticeOpen(false)}>
          Получено новое письмо
        </Alert>
      </Snackbar>

      <Snackbar
        open={Boolean(error)}
        autoHideDuration={3500}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Alert severity="error" variant="filled" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
  )
}

export default App
