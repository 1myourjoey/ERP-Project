export {
  Dialog as AlertDialog,
  DialogClose as AlertDialogCancel,
  DialogContent as AlertDialogContent,
  DialogDescription as AlertDialogDescription,
  DialogFooter as AlertDialogFooter,
  DialogHeader as AlertDialogHeader,
  DialogTitle as AlertDialogTitle,
  DialogTrigger as AlertDialogTrigger,
} from '@/components/ui/dialog'

export function AlertDialogAction(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} />
}
