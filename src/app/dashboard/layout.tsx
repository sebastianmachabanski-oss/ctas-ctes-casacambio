import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/Sidebar'
import Topbar from '@/components/Topbar'
import BlockBack from '@/components/BlockBack'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')
  return (
    <div style={{ minHeight: '100vh' }}>
      <Sidebar profile={profile as any} />
      <BlockBack />
      <div className="cc-main">
        <header className="cc-topbar">
          <button id="cc-hamb" className="cc-hamb" aria-label="Menú">☰</button>
          <Topbar />
        </header>
        <main>{children}</main>
      </div>
    </div>
  )
}
