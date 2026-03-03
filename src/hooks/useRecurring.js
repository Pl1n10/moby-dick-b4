import { useState, useEffect } from 'react'

const RECURRING_KEY = 'moby-dick-b4-recurring'

function loadRecurring() {
  try {
    const stored = localStorage.getItem(RECURRING_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (e) { console.warn('Recurring load failed:', e) }
  return []
}

function saveRecurring(templates) {
  try { localStorage.setItem(RECURRING_KEY, JSON.stringify(templates)) }
  catch (e) { console.warn('Recurring save failed:', e) }
}

function shouldSkipRecurring(tmpl) {
  if (!tmpl.lastCreatedDate) return false
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  switch (tmpl.frequency) {
    case 'daily':
      return tmpl.lastCreatedDate === todayStr
    case 'weekly': {
      const last = new Date(tmpl.lastCreatedDate + 'T00:00:00')
      return Math.floor((now - last) / (1000 * 60 * 60 * 24)) < 7
    }
    case 'monthly': {
      const last = new Date(tmpl.lastCreatedDate + 'T00:00:00')
      return last.getFullYear() === now.getFullYear() && last.getMonth() === now.getMonth()
    }
    default: return false
  }
}

function processRecurring(templates) {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  const newTasks = []
  const updatedTemplates = templates.map(tmpl => {
    if (!tmpl.active) return tmpl
    if (currentTime < tmpl.scheduledTime) return tmpl
    if (shouldSkipRecurring(tmpl)) return tmpl

    newTasks.push({
      id: crypto.randomUUID(),
      group: tmpl.group,
      reference: tmpl.reference,
      description: tmpl.description,
      status: 'New',
      owner: tmpl.owner,
      waiting: false,
      deadline: null,
      updatedAt: now.toISOString(),
      recurringTemplateId: tmpl.id,
    })
    return { ...tmpl, lastCreatedDate: todayStr }
  })

  return { newTasks, updatedTemplates }
}

export default function useRecurring(setTasks) {
  const [recurring, setRecurring] = useState(loadRecurring)
  const [showRecurringModal, setShowRecurringModal] = useState(false)

  useEffect(() => { saveRecurring(recurring) }, [recurring])

  useEffect(() => {
    const check = () => {
      const freshTemplates = loadRecurring()
      const { newTasks, updatedTemplates } = processRecurring(freshTemplates)
      if (newTasks.length > 0) {
        setTasks(prev => [...newTasks, ...prev])
        setRecurring(updatedTemplates)
      }
    }
    check()
    const interval = setInterval(check, 60000)
    return () => clearInterval(interval)
  }, [setTasks])

  const clearRecurring = () => setRecurring([])

  return { recurring, setRecurring, showRecurringModal, setShowRecurringModal, clearRecurring }
}
