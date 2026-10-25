const STORAGE_KEY = 'memory:memos:v1'

function isMemo(value: unknown): value is Memo {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.id === 'string' && typeof v.text === 'string' && typeof v.createdAt === 'number'
    && (v.done === undefined || typeof v.done === 'boolean')
}

function read(): Memo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const data: unknown = JSON.parse(raw)
    return Array.isArray(data) ? data.filter(isMemo) : []
  } catch {
    return []
  }
}

function write(memos: Memo[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memos))
  } catch {
    // stockage plein ou indisponible : on garde les bulles en mémoire
  }
}

export function useMemos() {
  const memos = useState<Memo[]>('memos', () => [])

  onMounted(() => {
    if (import.meta.client) memos.value = read()
  })

  function add(text: string): Memo | null {
    const trimmed = text.trim()
    if (!trimmed) return null
    const memo: Memo = { id: crypto.randomUUID(), text: trimmed, createdAt: Date.now() }
    memos.value = [...memos.value, memo]
    write(memos.value)
    return memo
  }

  function toggleDone(id: string) {
    memos.value = memos.value.map(m => m.id === id ? { ...m, done: !m.done } : m)
    write(memos.value)
  }

  function remove(id: string) {
    memos.value = memos.value.filter(m => m.id !== id)
    write(memos.value)
  }

  return { memos, add, toggleDone, remove }
}
