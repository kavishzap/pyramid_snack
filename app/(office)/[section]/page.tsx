import { redirect } from 'next/navigation'
import type { Metadata } from 'next'

import { isPageKey, PAGE_KEYS, PAGE_PATH, sectionMetadata } from '@/lib/routes'

type SectionPageProps = {
  params: Promise<{ section: string }>
}

export function generateStaticParams() {
  return PAGE_KEYS.map(section => ({ section }))
}

export async function generateMetadata({ params }: SectionPageProps): Promise<Metadata> {
  const { section } = await params
  if (!isPageKey(section)) return { title: 'Dashboard | Pyramid Snack' }
  return sectionMetadata(section)
}

export default async function SectionPage({ params }: SectionPageProps) {
  const { section } = await params
  if (!isPageKey(section)) redirect(PAGE_PATH.dashboard)
  return null
}
