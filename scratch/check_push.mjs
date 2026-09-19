import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envFile = fs.readFileSync('.env.local', 'utf-8')
const env = Object.fromEntries(envFile.split('\n').filter(Boolean).map(line => line.split('=')))

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
  const { data: logs, error } = await supabase
    .from('push_notification_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) {
    console.error(error)
  } else {
    console.log("Recent Push Logs:", JSON.stringify(logs, null, 2))
  }

  const { data: motos } = await supabase
    .from('motos')
    .select('id, moto_name, status, moto_order, checker_prep_ready_at')
    .in('status', ['READY', 'LOCKED', 'FINISHED'])
    .order('moto_order', { ascending: false })
    .limit(5)
  console.log("Recent Motos:", JSON.stringify(motos, null, 2))
}

run()
