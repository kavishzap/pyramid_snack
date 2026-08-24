import BackOfficeApp from '@/components/back-office-app'

export default function OfficeLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <BackOfficeApp>{children}</BackOfficeApp>
}
