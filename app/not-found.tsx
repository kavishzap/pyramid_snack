import { redirect } from 'next/navigation'

import { PAGE_PATH } from '@/lib/routes'

export default function NotFound() {
  redirect(PAGE_PATH.dashboard)
}
