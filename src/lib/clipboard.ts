import { toast } from 'sonner'

/** Writes to the clipboard, with the same success and failure toasts
 * everywhere — the fallback message tells the user what to do by hand. */
export async function copyText(text: string, label: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} copied`)
    return true
  } catch {
    toast.error('Clipboard unavailable — select the text and copy it by hand.')
    return false
  }
}
