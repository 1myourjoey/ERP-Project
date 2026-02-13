export type ToastType = 'success' | 'error' | 'info'

let toastHandler: ((type: ToastType, message: string) => void) | null = null

export const setToastHandler = (handler: ((type: ToastType, message: string) => void) | null) => {
  toastHandler = handler
}

export const pushToast = (type: ToastType, message: string) => {
  toastHandler?.(type, message)
}
