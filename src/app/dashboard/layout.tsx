import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar profile={profile as any} />
      {/* pt-14 en mobile para compensar el top bar fijo */}
      <main className="flex-1 overflow-y-auto bg-gray-50 pt-14 md:pt-0">
        {children}
      </main>
    </div>
  )
}
